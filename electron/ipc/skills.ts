import pkg from 'electron';
const { ipcMain, BrowserWindow } = pkg;
import { existsSync, readdirSync, readFileSync, watch } from 'fs';
import fs from 'fs/promises';
import { join } from 'path';
import { spawn } from 'child_process';
import { getOpenClawRootDir, resolveOpenClawCommand, runCommand as runShellCommand, getShellPath } from './settings.js';
import {
  parseSkillMd, formatSkillMd, toKebabCase, isValidSkillName,
  stripAnsi, inferSkillCategory, SkillsDiskCache, createDebouncedNotifier,
} from './skillsLogic.js';
import type { SkillInfo, SkillDiagnosticReport, SkillDiagnosticItem, SkillEntryConfig, PluginInfo } from '../../types/electron.js';
import type { SkillMdData } from './skillsLogic.js';

// 磁盘缓存实例（TTL 30 秒）
const diskCache = new SkillsDiskCache();
// 文件监听器引用（模块作用域）
let skillsWatcher: ReturnType<typeof watch> | null = null;
let debouncedNotifier: ReturnType<typeof createDebouncedNotifier> | null = null;

// 运行 openclaw 命令
async function runCommand(args: string[]): Promise<{ success: boolean; output: string; error?: string }> {
  return runShellCommand(resolveOpenClawCommand(), args);
}

// 尝试解析 JSON，自动去除 ANSI
function tryParseJson<T>(raw: string): T | null {
  const text = stripAnsi(raw).trim();
  if (!text) return null;
  // CLI 输出可能在 JSON 前混有 warning 文本，提取第一个 { 或 [ 开始的部分
  const idxObj = text.indexOf('{');
  const idxArr = text.indexOf('[');
  const jsonStart = idxObj === -1 ? idxArr : idxArr === -1 ? idxObj : Math.min(idxObj, idxArr);
  const jsonText = jsonStart === -1 ? text : text.slice(jsonStart);
  try { return JSON.parse(jsonText) as T; } catch { return null; }
}

// 从本地 skills 目录读取已安装技能（带缓存）
function readInstalledSkillsFromDisk(): SkillInfo[] {
  const cached = diskCache.get<SkillInfo[]>();
  if (cached) return cached;
  const skills: SkillInfo[] = [];
  const possiblePaths = [
    join(process.env.HOME || '', '.openclaw', 'skills'),
    join(process.env.HOME || '', '.openclaw', 'lib', 'node_modules', 'openclaw', 'skills'),
    join(process.env.HOME || '', '.openclaw', 'lib', 'node_modules', 'clawbot', 'skills'),
    getOpenClawRootDir() ? join(getOpenClawRootDir(), 'skills') : null,
  ].filter((p): p is string => p !== null);
  const customSkillsDir = join(getOpenClawRootDir(), 'skills');
  for (const skillsDir of possiblePaths) {
    if (!existsSync(skillsDir)) continue;
    try {
      for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const skillId = entry.name;
        const skillPath = join(skillsDir, skillId);
        if (!existsSync(join(skillPath, 'SKILL.md'))) continue;
        try {
          const parsed = parseSkillMd(readFileSync(join(skillPath, 'SKILL.md'), 'utf-8'));
          let name = skillId, description = '', emoji = '📦', requires: SkillInfo['requires'];
          if (parsed.ok) {
            name = parsed.data.frontmatter.name || skillId;
            description = parsed.data.frontmatter.description || '';
            const oc = parsed.data.frontmatter.metadata?.openclaw;
            if (oc?.emoji) emoji = oc.emoji;
            if (oc?.requires) requires = oc.requires;
          }
          const isCustom = skillPath.startsWith(customSkillsDir);
          skills.push({ id: skillId, name, description, version: '1.0.0', author: 'Unknown',
            category: inferSkillCategory(name, description), status: 'installed', enabled: true,
            path: skillPath, dependencies: [], missingRequirements: [],
            source: isCustom ? 'custom' : 'bundled', emoji, requires, isCustom });
        } catch { /* 跳过 */ }
      }
    } catch (err) { console.error(`读取 skills 目录 ${skillsDir} 失败:`, err); }
  }
  diskCache.set(skills);
  return skills;
}

// 调用 CLI 获取技能列表（使用缓存的磁盘读取结果）
async function fetchSkillsFromCLI(): Promise<SkillInfo[]> {
  const result = await runCommand(['skills', 'list', '--json']);
  const parsed = tryParseJson<unknown>(result.output);
  if (parsed) {
    const list = Array.isArray(parsed) ? parsed : Array.isArray((parsed as any)?.skills) ? (parsed as any).skills : Array.isArray((parsed as any)?.items) ? (parsed as any).items : [];
    const installedSkills = readInstalledSkillsFromDisk();
    return list.filter((item: any) => typeof item === 'object' && item !== null).map((item: any): SkillInfo => {
      const id = String(item.id || item.name || ''), name = String(item.name || item.id || '');
      const description = String(item.description || ''), version = String(item.version || '1.0.0');
      const author = String(item.author || 'Unknown'), category = inferSkillCategory(name, description);
      const eligible = Boolean(item.eligible), disabled = Boolean(item.disabled);
      const missing = item.missing || {};
      const missingBins = Array.isArray(missing.bins) ? missing.bins : [];
      const missingEnv = Array.isArray(missing.env) ? missing.env : [];
      const missingConfig = Array.isArray(missing.config) ? missing.config : [];
      const isInstalled = installedSkills.some(s => s.id === id || s.name === name);
      let status: SkillInfo['status'] = 'available';
      if (disabled) status = 'error'; else if (isInstalled) status = 'installed';
      else if (eligible && !missingBins.length && !missingEnv.length && !missingConfig.length) status = 'available';
      else status = 'error';
      return { id, name, description: description.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim(), version, author, category, status, enabled: !disabled && isInstalled, eligible, missingRequirements: [...missingBins, ...missingEnv, ...missingConfig] };
    });
  }
  return readInstalledSkillsFromDisk();
}

async function fetchEligibleSkillsFromCLI(): Promise<SkillInfo[]> {
  const result = await runCommand(['skills', 'list', '--eligible', '--json']);
  const parsed = tryParseJson<unknown>(result.output);
  if (!parsed) return [];
  const list = Array.isArray(parsed) ? parsed : Array.isArray((parsed as any)?.skills) ? (parsed as any).skills : [];
  const installedSkills = readInstalledSkillsFromDisk();
  return list.filter((item: any) => typeof item === 'object' && item !== null).map((item: any): SkillInfo => {
    const id = String(item.id || item.name || ''), name = String(item.name || item.id || '');
    const description = String(item.description || ''), version = String(item.version || '1.0.0');
    const author = String(item.author || 'Unknown'), category = inferSkillCategory(name, description);
    const eligible = Boolean(item.eligible), disabled = Boolean(item.disabled);
    const missing = item.missing || {};
    const missingBins = Array.isArray(missing.bins) ? missing.bins : [];
    const missingEnv = Array.isArray(missing.env) ? missing.env : [];
    const missingConfig = Array.isArray(missing.config) ? missing.config : [];
    const isInstalled = installedSkills.some(s => s.id === id || s.name === name);
    return { id, name, description: description.replace(/\n/g, ' ').trim(), version, author, category, status: isInstalled ? 'installed' : 'available', enabled: !disabled && isInstalled, eligible, missingRequirements: [...missingBins, ...missingEnv, ...missingConfig] };
  });
}

export function setupSkillsIPC() {
  // 获取所有技能（已安装 + 可用）
  ipcMain.handle('skills:getAll', async (): Promise<{ success: boolean; skills?: SkillInfo[]; error?: string }> => {
    try {
      const [allSkills, eligibleSkills] = await Promise.all([fetchSkillsFromCLI(), fetchEligibleSkillsFromCLI()]);
      const skillMap = new Map<string, SkillInfo>();
      for (const skill of allSkills) skillMap.set(skill.id, skill);
      for (const skill of eligibleSkills) {
        if (!skillMap.has(skill.id)) skillMap.set(skill.id, skill);
        else {
          const existing = skillMap.get(skill.id)!;
          if (skill.status === 'installed' && existing.status !== 'installed')
            skillMap.set(skill.id, { ...existing, status: 'installed', enabled: skill.enabled });
        }
      }
      return { success: true, skills: Array.from(skillMap.values()) };
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) }; }
  });

  // 安装技能
  ipcMain.handle('skills:install', async (_, skillId: string) => {
    const r = await runCommand(['clawbot', 'install', skillId]);
    if (!r.success) return { success: false, error: r.error || '安装技能失败' };
    diskCache.invalidate(); return { success: true };
  });

  // 卸载技能
  ipcMain.handle('skills:uninstall', async (_, skillId: string) => {
    const r = await runCommand(['clawbot', 'uninstall', skillId]);
    if (!r.success) return { success: false, error: r.error || '卸载技能失败' };
    diskCache.invalidate(); return { success: true };
  });

  // 更新技能
  ipcMain.handle('skills:update', async (_, skillId: string) => {
    const r = await runCommand(['clawbot', 'update', skillId]);
    if (!r.success) return { success: false, error: r.error || '更新技能失败' };
    diskCache.invalidate(); return { success: true };
  });

  // 启用技能
  ipcMain.handle('skills:enable', async (_, skillId: string) => {
    const r = await runCommand(['skills', 'enable', skillId]);
    return r.success ? { success: true } : { success: false, error: r.error || '启用技能失败' };
  });

  // 禁用技能
  ipcMain.handle('skills:disable', async (_, skillId: string) => {
    const r = await runCommand(['skills', 'disable', skillId]);
    return r.success ? { success: true } : { success: false, error: r.error || '禁用技能失败' };
  });

  // 技能统计
  ipcMain.handle('skills:stats', async () => {
    try {
      const skills = await fetchSkillsFromCLI();
      return { success: true, stats: {
        total: skills.length, installed: skills.filter(s => s.status === 'installed').length,
        available: skills.filter(s => s.status === 'available').length,
        updatable: skills.filter(s => s.status === 'updatable').length,
        enabled: skills.filter(s => s.enabled && s.status === 'installed').length,
        byCategory: skills.reduce((acc, s) => { acc[s.category] = (acc[s.category] || 0) + 1; return acc; }, {} as Record<string, number>),
      }};
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) }; }
  });

  // 搜索技能
  ipcMain.handle('skills:search', async (_, query: string) => {
    try {
      const skills = await fetchSkillsFromCLI();
      const q = query.toLowerCase();
      return { success: true, skills: skills.filter(s => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.category.toLowerCase().includes(q)) };
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) }; }
  });

  // ── Task 4.2: 自定义技能 CRUD ──────────────────────────────────────────────

  // 创建自定义技能
  ipcMain.handle('skills:create', async (_, payload: { name: string; description: string; emoji?: string; content?: string }) => {
    try {
      const { name, description, emoji, content } = payload;
      if (!name || !name.trim()) return { success: false, error: '技能名称不能为空' };
      const kebabName = toKebabCase(name.trim());
      if (!isValidSkillName(kebabName)) return { success: false, error: `技能名称 "${kebabName}" 格式无效` };
      const skillDir = join(getOpenClawRootDir(), 'skills', kebabName);
      if (existsSync(skillDir)) return { success: false, error: `技能 "${kebabName}" 已存在` };
      let skillMdContent: string;
      if (content) { skillMdContent = content; }
      else {
        const data: SkillMdData = {
          frontmatter: { name: kebabName, description: description || '', metadata: emoji ? { openclaw: { emoji } } : undefined },
          sections: { Instructions: '在此编写技能指令。', Rules: '在此编写技能规则。' },
        };
        skillMdContent = formatSkillMd(data);
      }
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(join(skillDir, 'SKILL.md'), skillMdContent, 'utf-8');
      diskCache.invalidate();
      return { success: true, skillId: kebabName };
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) }; }
  });

  // 读取技能 SKILL.md 原始内容
  ipcMain.handle('skills:read', async (_, skillId: string) => {
    try {
      if (!skillId) return { success: false, error: '技能 ID 不能为空' };
      const candidates = [
        join(getOpenClawRootDir(), 'skills', skillId, 'SKILL.md'),
        join(process.env.HOME || '', '.openclaw', 'skills', skillId, 'SKILL.md'),
      ];
      for (const mdPath of candidates) {
        if (existsSync(mdPath)) {
          const fileContent = await fs.readFile(mdPath, 'utf-8');
          return { success: true, content: fileContent };
        }
      }
      return { success: false, error: `未找到技能 "${skillId}" 的 SKILL.md 文件` };
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) }; }
  });

  // 保存技能 SKILL.md 内容（仅自定义技能）
  ipcMain.handle('skills:save', async (_, skillId: string, content: string) => {
    try {
      if (!skillId) return { success: false, error: '技能 ID 不能为空' };
      const installed = readInstalledSkillsFromDisk();
      const skill = installed.find(s => s.id === skillId);
      if (skill && !skill.isCustom) return { success: false, error: '仅自定义技能可编辑' };
      const dir = join(getOpenClawRootDir(), 'skills', skillId);
      if (!existsSync(dir)) return { success: false, error: `技能目录 "${skillId}" 不存在` };
      await fs.writeFile(join(dir, 'SKILL.md'), content, 'utf-8');
      diskCache.invalidate();
      return { success: true };
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) }; }
  });

  // 删除自定义技能
  ipcMain.handle('skills:deleteCustom', async (_, skillId: string) => {
    try {
      if (!skillId) return { success: false, error: '技能 ID 不能为空' };
      const installed = readInstalledSkillsFromDisk();
      const skill = installed.find(s => s.id === skillId);
      if (skill && !skill.isCustom) return { success: false, error: '仅自定义技能可删除' };
      const skillDir = join(getOpenClawRootDir(), 'skills', skillId);
      if (!existsSync(skillDir)) return { success: false, error: `技能目录 "${skillId}" 不存在` };
      await fs.rm(skillDir, { recursive: true, force: true });
      diskCache.invalidate();
      return { success: true };
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) }; }
  });

  // ── Task 4.3: 技能详情、诊断和 ClawHub 搜索 ───────────────────────────────

  // 获取技能运行时详情
  ipcMain.handle('skills:info', async (_, skillName: string) => {
    try {
      if (!skillName) return { success: false, error: '技能名称不能为空' };
      const r = await runCommand(['skills', 'info', skillName]);
      if (!r.success) return { success: false, error: r.error || '获取技能详情失败' };
      const parsed = tryParseJson<Record<string, unknown>>(r.output);
      return { success: true, info: parsed || { raw: stripAnsi(r.output) } };
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) }; }
  });

  // 执行全局技能健康检查
  ipcMain.handle('skills:check', async () => {
    try {
      const r = await runCommand(['skills', 'check']);
      const output = stripAnsi(r.output || '');
      const parsed = tryParseJson<any>(r.output);
      if (parsed) {
        const rawItems = Array.isArray(parsed) ? parsed : (parsed.items || parsed.skills || []);
        const checkItems: SkillDiagnosticItem[] = rawItems.map((item: any) => ({
          skillName: String(item.name || item.skillName || ''),
          status: (item.status === 'ok' ? 'ok' : item.status === 'warning' ? 'warning' : 'error') as 'ok' | 'warning' | 'error',
          issues: Array.isArray(item.issues) ? item.issues.map(String) : [],
        }));
        return { success: true, report: { items: checkItems, summary: {
          ok: checkItems.filter(i => i.status === 'ok').length,
          warning: checkItems.filter(i => i.status === 'warning').length,
          error: checkItems.filter(i => i.status === 'error').length,
        }} as SkillDiagnosticReport };
      }
      const lines = output.split('\n').filter(l => l.trim());
      const textItems: SkillDiagnosticItem[] = lines.map(line => ({
        skillName: line.trim(),
        status: (line.includes('✓') || line.includes('ok') ? 'ok' : line.includes('⚠') || line.includes('warn') ? 'warning' : 'error') as 'ok' | 'warning' | 'error',
        issues: (line.includes('✓') || line.includes('ok')) ? [] : [line.trim()],
      }));
      return { success: true, report: { items: textItems, summary: {
        ok: textItems.filter(i => i.status === 'ok').length,
        warning: textItems.filter(i => i.status === 'warning').length,
        error: textItems.filter(i => i.status === 'error').length,
      }} as SkillDiagnosticReport };
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) }; }
  });

  // ClawHub 市场搜索：调用独立的 clawhub CLI（路径通过 PATH 解析）
  ipcMain.handle('skills:clawHubSearch', async (_, query: string) => {
    try {
      if (!query || !query.trim()) return { success: false, error: '搜索关键词不能为空' };
      const shellPath = await getShellPath();
      // clawhub 是独立 CLI，不是 openclaw 子命令
      const searchResult = await new Promise<{ success: boolean; output: string; error?: string }>((resolve) => {
        const child = spawn('clawhub', ['search', query.trim(), '--limit', '20'], {
          env: { ...process.env, PATH: shellPath },
        });
        let stdout = '', stderr = '';
        const timer = setTimeout(() => {
          try { child.kill(); } catch {}
          resolve({ success: false, output: '', error: '搜索超时，请重试' });
        }, 15_000);
        child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
        child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
        child.once('close', (code) => {
          clearTimeout(timer);
          resolve(code === 0
            ? { success: true, output: stdout.trim() }
            : { success: false, output: stdout.trim(), error: stripAnsi(stderr.trim()) || `命令退出码 ${code}` });
        });
        child.once('error', (e) => {
          clearTimeout(timer);
          resolve({ success: false, output: '', error: e.message });
        });
      });
      if (!searchResult.success) {
        // rate limit 给出友好提示
        const errMsg = searchResult.error || 'ClawHub 搜索失败';
        const friendlyMsg = errMsg.toLowerCase().includes('rate limit')
          ? '搜索频率超限，请稍后再试'
          : errMsg;
        return { success: false, error: friendlyMsg };
      }
      // 解析文本输出格式：每行 "slug  名称  (score)" 或 "slug  名称"
      const installedSkills = readInstalledSkillsFromDisk();
      const installedIds = new Set(installedSkills.map(s => s.id));
      const lines = searchResult.output.split('\n').filter(l => l.trim() && !l.startsWith('-'));
      const searchSkills: SkillInfo[] = lines.map((line): SkillInfo | null => {
        // 格式：slug  显示名  (score) 或 slug  显示名
        const parts = line.trim().split(/\s{2,}/);
        if (parts.length < 1) return null;
        const id = parts[0].trim();
        if (!id) return null;
        // 去掉末尾的 (score) 部分
        const rawName = (parts[1] || id).replace(/\s*\(\d+\.\d+\)\s*$/, '').trim();
        const name = rawName || id;
        const isInstalled = installedIds.has(id);
        return {
          id, name,
          description: '',
          version: '1.0.0',
          author: 'ClawHub',
          category: inferSkillCategory(name, ''),
          status: isInstalled ? 'installed' : 'available',
          enabled: isInstalled,
          source: 'clawhub',
          isCustom: false,
          missingRequirements: [],
        };
      }).filter((s): s is SkillInfo => s !== null);
      return { success: true, skills: searchSkills };
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) }; }
  });

  // ── Task 4.4: 技能配置管理 ─────────────────────────────────────────────────

  // 读取技能配置
  ipcMain.handle('skills:getConfig', async (_, skillId: string) => {
    try {
      if (!skillId) return { success: false, error: '技能 ID 不能为空' };
      const configPath = join(getOpenClawRootDir(), 'openclaw.json');
      if (!existsSync(configPath)) return { success: true, config: {} };
      const raw = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(raw);
      const entry = config?.skills?.entries?.[skillId] as SkillEntryConfig | undefined;
      return { success: true, config: entry || {} };
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) }; }
  });

  // 保存技能配置
  ipcMain.handle('skills:saveConfig', async (_, skillId: string, entryConfig: SkillEntryConfig) => {
    try {
      if (!skillId) return { success: false, error: '技能 ID 不能为空' };
      const configPath = join(getOpenClawRootDir(), 'openclaw.json');
      let config: Record<string, any> = {};
      if (existsSync(configPath)) { const raw = await fs.readFile(configPath, 'utf-8'); config = JSON.parse(raw); }
      if (!config.skills) config.skills = {};
      if (!config.skills.entries) config.skills.entries = {};
      config.skills.entries[skillId] = entryConfig;
      await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
      return { success: true };
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) }; }
  });

  // ── Task 4.5: 文件监听 ────────────────────────────────────────────────────

  // 启动文件监听
  ipcMain.handle('skills:startWatcher', async () => {
    try {
      if (skillsWatcher) { skillsWatcher.close(); skillsWatcher = null; }
      if (debouncedNotifier) { debouncedNotifier.cancel(); debouncedNotifier = null; }
      const skillsDir = join(getOpenClawRootDir(), 'skills');
      if (!existsSync(skillsDir)) { try { await fs.mkdir(skillsDir, { recursive: true }); } catch { return { success: true }; } }
      // 创建 500ms 防抖通知器
      debouncedNotifier = createDebouncedNotifier(500, () => {
        diskCache.invalidate();
        for (const win of BrowserWindow.getAllWindows()) { try { win.webContents.send('skills:changed'); } catch {} }
      });
      // 使用 fs.watch 监控目录
      skillsWatcher = watch(skillsDir, { recursive: true }, () => { debouncedNotifier?.notify(); });
      // fs.watch 错误时静默降级
      skillsWatcher.on('error', () => {
        if (skillsWatcher) { skillsWatcher.close(); skillsWatcher = null; }
        if (debouncedNotifier) { debouncedNotifier.cancel(); debouncedNotifier = null; }
      });
      return { success: true };
    } catch { return { success: true }; }
  });

  // 停止文件监听
  ipcMain.handle('skills:stopWatcher', async () => {
    if (skillsWatcher) { skillsWatcher.close(); skillsWatcher = null; }
    if (debouncedNotifier) { debouncedNotifier.cancel(); debouncedNotifier = null; }
    return { success: true };
  });

  // ── Task 4.6: 插件管理 ────────────────────────────────────────────────────

  // 获取插件列表
  ipcMain.handle('plugins:list', async () => {
    try {
      const r = await runCommand(['plugins', 'list', '--json']);
      if (!r.success) return { success: false, error: r.error || '获取插件列表失败' };
      const parsed = tryParseJson<any>(r.output);
      const rawList = parsed ? (Array.isArray(parsed) ? parsed : (parsed.plugins || parsed.items || [])) : [];
      const plugins: PluginInfo[] = rawList.map((item: any): PluginInfo => ({
        id: String(item.id || item.name || ''), name: String(item.name || item.id || ''),
        version: String(item.version || '0.0.0'),
        status: item.enabled === false ? 'disabled' : item.status === 'error' ? 'error' : 'enabled',
        description: item.description ? String(item.description) : undefined,
        path: item.path ? String(item.path) : undefined,
        skills: Array.isArray(item.skills) ? item.skills.map(String) : undefined,
      }));
      return { success: true, plugins };
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) }; }
  });

  // 安装插件
  ipcMain.handle('plugins:install', async (_, spec: string) => {
    try {
      if (!spec || !spec.trim()) return { success: false, error: '插件标识符不能为空' };
      const r = await runCommand(['plugins', 'install', spec.trim()]);
      if (!r.success) return { success: false, error: r.error || '安装插件失败' };
      diskCache.invalidate(); return { success: true };
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) }; }
  });

  // 卸载插件
  ipcMain.handle('plugins:uninstall', async (_, id: string) => {
    try {
      if (!id) return { success: false, error: '插件 ID 不能为空' };
      const r = await runCommand(['plugins', 'uninstall', id]);
      if (!r.success) return { success: false, error: r.error || '卸载插件失败' };
      diskCache.invalidate(); return { success: true };
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) }; }
  });

  // 启用插件
  ipcMain.handle('plugins:enable', async (_, id: string) => {
    try {
      if (!id) return { success: false, error: '插件 ID 不能为空' };
      const r = await runCommand(['plugins', 'enable', id]);
      return r.success ? { success: true } : { success: false, error: r.error || '启用插件失败' };
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) }; }
  });

  // 禁用插件
  ipcMain.handle('plugins:disable', async (_, id: string) => {
    try {
      if (!id) return { success: false, error: '插件 ID 不能为空' };
      const r = await runCommand(['plugins', 'disable', id]);
      return r.success ? { success: true } : { success: false, error: r.error || '禁用插件失败' };
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) }; }
  });

  // 查看插件详情
  ipcMain.handle('plugins:inspect', async (_, id: string) => {
    try {
      if (!id) return { success: false, error: '插件 ID 不能为空' };
      const r = await runCommand(['plugins', 'inspect', id]);
      if (!r.success) return { success: false, error: r.error || '获取插件详情失败' };
      const parsed = tryParseJson<Record<string, unknown>>(r.output);
      return { success: true, detail: parsed || { raw: stripAnsi(r.output) } };
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) }; }
  });

  // 插件诊断
  ipcMain.handle('plugins:doctor', async () => {
    try {
      const r = await runCommand(['plugins', 'doctor']);
      if (!r.success) return { success: false, error: r.error || '插件诊断失败' };
      const parsed = tryParseJson<Record<string, unknown>>(r.output);
      return { success: true, report: parsed || { raw: stripAnsi(r.output) } };
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) }; }
  });

  // ── Task 4.7: 依赖安装 ────────────────────────────────────────────────────

  // 执行依赖安装命令
  ipcMain.handle('skills:installDependency', async (_, payload: { command: string; args: string[] }) => {
    try {
      const { command, args } = payload;
      if (!command || !command.trim()) return { success: false, error: '安装命令不能为空' };
      // 安全检查：仅允许已知的包管理器命令
      const allowedCommands = ['brew', 'apt', 'apt-get', 'yum', 'dnf', 'pacman', 'npm', 'pip', 'pip3', 'cargo'];
      const baseCmd = command.trim().split('/').pop() || '';
      if (!allowedCommands.includes(baseCmd)) return { success: false, error: `不允许执行命令 "${baseCmd}"，仅支持: ${allowedCommands.join(', ')}` };
      const r = await runShellCommand(command.trim(), args || []);
      if (!r.success) return { success: false, output: r.output, error: r.error || '依赖安装失败' };
      return { success: true, output: r.output };
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) }; }
  });
}
