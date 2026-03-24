import pkg from 'electron';
const { ipcMain, BrowserWindow, dialog } = pkg;
import { existsSync, readdirSync, readFileSync, watch } from 'fs';
import fs from 'fs/promises';
import { join } from 'path';
import { spawn } from 'child_process';
import * as AdmZip from 'adm-zip';
import { getOpenClawRootDir, resolveOpenClawCommand, runCommand as runShellCommand, getShellPath } from './settings.js';
import {
  parseSkillMd, formatSkillMd, toKebabCase, isValidSkillName,
  stripAnsi, inferSkillCategory, SkillsDiskCache, createDebouncedNotifier,
} from './skillsLogic.js';
import type { SkillInfo, SkillDiagnosticReport, SkillDiagnosticItem, SkillEntryConfig, PluginInfo } from '../../types/electron.js';
import type { SkillMdData } from './skillsLogic.js';
import { formatClawHubSearchError } from './clawhubInstallLogic.js';
import {
  bindSkillToAgents,
  unbindSkillFromAgents,
  getBoundAgents,
  getAgentSkills,
  checkSkillPermission,
  getAllBindings,
} from './skillAgentBinding.js';

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

/**
 * 将 CLI 返回的单条 skill 原始对象映射为 SkillInfo
 * 真实 CLI 字段：name, description, eligible, disabled, blockedByAllowlist, source, bundled, missing
 * missing 结构：{ bins:[], anyBins:[], env:[], config:[], os:[] }
 */
function mapRawSkillToInfo(item: any, installedSkills: SkillInfo[]): SkillInfo {
  const id = String(item.id || item.name || '');
  const name = String(item.name || item.id || '');
  const description = String(item.description || '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  const version = String(item.version || '1.0.0');
  const author = String(item.author || 'Unknown');
  const category = inferSkillCategory(name, description);
  const eligible = Boolean(item.eligible);
  const disabled = Boolean(item.disabled);
  // missing 字段：合并 bins + anyBins + env + config + os 作为缺失依赖列表
  const missing = item.missing || {};
  const missingRequirements = [
    ...(Array.isArray(missing.bins) ? missing.bins : []),
    ...(Array.isArray(missing.anyBins) ? missing.anyBins : []),
    ...(Array.isArray(missing.env) ? missing.env : []),
    ...(Array.isArray(missing.config) ? missing.config : []),
    ...(Array.isArray(missing.os) ? missing.os : []),
  ].map(String);
  const isInstalled = installedSkills.some(s => s.id === id || s.name === name);
  // 状态判断：disabled → error；已安装 → installed；其余 → available
  let status: SkillInfo['status'] = 'available';
  if (disabled) status = 'error';
  else if (isInstalled) status = 'installed';
  return { id, name, description, version, author, category, status, enabled: !disabled && eligible, eligible, missingRequirements };
}

/**
 * 调用 CLI 获取全量技能列表
 * 真实命令：openclaw skills list --json
 * 返回结构：{ workspaceDir, managedSkillsDir, skills: [...] }
 * 每个 skill 包含 eligible 字段，无需单独调用 --eligible
 */
async function fetchSkillsFromCLI(): Promise<SkillInfo[]> {
  const result = await runCommand(['skills', 'list', '--json']);
  const parsed = tryParseJson<any>(result.output);
  if (parsed) {
    // 真实返回结构是 { skills: [...] }，不是数组
    const list: any[] = Array.isArray(parsed) ? parsed
      : Array.isArray(parsed?.skills) ? parsed.skills
      : Array.isArray(parsed?.items) ? parsed.items
      : [];
    // 缓存一次磁盘读取结果，避免 map 内重复调用
    const installedSkills = readInstalledSkillsFromDisk();
    return list
      .filter((item: any) => typeof item === 'object' && item !== null)
      .map((item: any) => mapRawSkillToInfo(item, installedSkills));
  }
  // CLI 失败时回退到磁盘读取
  return readInstalledSkillsFromDisk();
}

/**
 * 获取 eligible（满足依赖条件）的技能列表
 * 真实命令：openclaw skills list --eligible --json（--eligible 是真实存在的 flag）
 * 返回结构与 skills list 相同，但只包含 eligible=true 的条目
 */
async function fetchEligibleSkillsFromCLI(): Promise<SkillInfo[]> {
  const result = await runCommand(['skills', 'list', '--eligible', '--json']);
  const parsed = tryParseJson<any>(result.output);
  if (!parsed) return [];
  const list: any[] = Array.isArray(parsed) ? parsed
    : Array.isArray(parsed?.skills) ? parsed.skills
    : [];
  const installedSkills = readInstalledSkillsFromDisk();
  return list
    .filter((item: any) => typeof item === 'object' && item !== null)
    .map((item: any) => mapRawSkillToInfo(item, installedSkills));
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

  // 启用技能：openclaw skills 没有 enable/disable 子命令
  // 通过直接修改 openclaw.json 中 skills.disabled 数组来实现
  ipcMain.handle('skills:enable', async (_, skillId: string) => {
    try {
      if (!skillId) return { success: false, error: '技能 ID 不能为空' };
      const configPath = join(getOpenClawRootDir(), 'openclaw.json');
      let config: Record<string, any> = {};
      if (existsSync(configPath)) {
        const raw = await fs.readFile(configPath, 'utf-8');
        config = JSON.parse(raw);
      }
      // 从 skills.disabled 数组中移除该技能
      if (Array.isArray(config?.skills?.disabled)) {
        config.skills.disabled = config.skills.disabled.filter((id: string) => id !== skillId);
      }
      await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
      return { success: true };
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) }; }
  });

  // 禁用技能：同上，将技能 ID 加入 skills.disabled 数组
  ipcMain.handle('skills:disable', async (_, skillId: string) => {
    try {
      if (!skillId) return { success: false, error: '技能 ID 不能为空' };
      const configPath = join(getOpenClawRootDir(), 'openclaw.json');
      let config: Record<string, any> = {};
      if (existsSync(configPath)) {
        const raw = await fs.readFile(configPath, 'utf-8');
        config = JSON.parse(raw);
      }
      if (!config.skills) config.skills = {};
      if (!Array.isArray(config.skills.disabled)) config.skills.disabled = [];
      if (!config.skills.disabled.includes(skillId)) {
        config.skills.disabled.push(skillId);
      }
      await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
      return { success: true };
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) }; }
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
  // 真实 CLI：openclaw skills check --json
  // 真实返回结构：
  // {
  //   summary: { total, eligible, disabled, blocked, missingRequirements },
  //   eligible: ["skill-name", ...],       // 满足依赖的技能名列表
  //   disabled: ["skill-name", ...],       // 被禁用的技能名列表
  //   blocked: ["skill-name", ...],        // 被 allowlist 屏蔽的技能名列表
  //   missingRequirements: [{ name, missing: { bins, env, config, os } }, ...]
  // }
  ipcMain.handle('skills:check', async () => {
    try {
      const r = await runCommand(['skills', 'check', '--json']);
      const parsed = tryParseJson<any>(r.output);
      if (parsed && parsed.summary) {
        const summary = parsed.summary as { total: number; eligible: number; disabled: number; blocked: number; missingRequirements: number };
        // 将真实结构转换为 SkillDiagnosticReport 格式
        const items: SkillDiagnosticItem[] = [];
        // eligible 技能 → ok
        for (const name of (Array.isArray(parsed.eligible) ? parsed.eligible : [])) {
          items.push({ skillName: String(name), status: 'ok', issues: [] });
        }
        // disabled 技能 → warning
        for (const name of (Array.isArray(parsed.disabled) ? parsed.disabled : [])) {
          items.push({ skillName: String(name), status: 'warning', issues: ['技能已被禁用'] });
        }
        // blocked 技能 → warning
        for (const name of (Array.isArray(parsed.blocked) ? parsed.blocked : [])) {
          items.push({ skillName: String(name), status: 'warning', issues: ['技能被 allowlist 屏蔽'] });
        }
        // missingRequirements 技能 → error，附带缺失依赖详情
        for (const entry of (Array.isArray(parsed.missingRequirements) ? parsed.missingRequirements : [])) {
          const missing = entry.missing || {};
          const issues: string[] = [
            ...(Array.isArray(missing.bins) ? missing.bins.map((b: string) => `缺少命令: ${b}`) : []),
            ...(Array.isArray(missing.anyBins) ? missing.anyBins.map((b: string) => `缺少命令(任一): ${b}`) : []),
            ...(Array.isArray(missing.env) ? missing.env.map((e: string) => `缺少环境变量: ${e}`) : []),
            ...(Array.isArray(missing.config) ? missing.config.map((c: string) => `缺少配置: ${c}`) : []),
            ...(Array.isArray(missing.os) ? missing.os.map((o: string) => `不支持的操作系统: ${o}`) : []),
          ];
          items.push({ skillName: String(entry.name || ''), status: 'error', issues });
        }
        return {
          success: true,
          report: {
            items,
            summary: {
              ok: summary.eligible || 0,
              warning: (summary.disabled || 0) + (summary.blocked || 0),
              error: summary.missingRequirements || 0,
            },
          } as SkillDiagnosticReport,
        };
      }
      // 回退：CLI 未返回 JSON，返回空报告
      return { success: true, report: { items: [], summary: { ok: 0, warning: 0, error: 0 } } as SkillDiagnosticReport };
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) }; }
  });

  // ClawHub 市场搜索：优先使用 openclaw 子命令，回退到独立 clawhub CLI
  ipcMain.handle('skills:clawHubSearch', async (_, query: string) => {
    try {
      if (!query || !query.trim()) return { success: false, error: '搜索关键词不能为空' };

      const trimmedQuery = query.trim();
      const searchArgs = ['search', trimmedQuery, '--limit', '20'];

      // 优先尝试 openclaw clawhub search（openclaw 子命令）
      let searchResult = await runCommand(['clawhub', ...searchArgs]);

      // 如果 openclaw 子命令不支持，回退到独立 clawhub CLI
      if (!searchResult.success && (searchResult.error?.includes('ENOENT') || searchResult.error?.includes('unknown command'))) {
        searchResult = await runShellCommand('clawhub', searchArgs);
      }

      if (!searchResult.success) {
        const errMsg = searchResult.error || 'ClawHub 搜索失败';
        // ENOENT 说明 clawhub CLI 未安装，使用友好的安装引导信息
        const friendlyError = formatClawHubSearchError(errMsg);
        if (friendlyError) {
          return { success: false, error: friendlyError };
        }
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
  // 真实 CLI：openclaw plugins list --json
  // 真实返回结构：{ workspaceDir, plugins: [{ id, name, description, version, source, origin, enabled, status, toolNames, ... }] }
  // 注意：stdout 中混有 [plugins] ANSI 日志行，需要先 stripAnsi 再提取 JSON
  ipcMain.handle('plugins:list', async () => {
    try {
      const r = await runCommand(['plugins', 'list', '--json']);
      if (!r.success) return { success: false, error: r.error || '获取插件列表失败' };
      // 先 stripAnsi，再从最后一个 } 往前找完整 JSON（与 sessions:send 相同的健壮解析策略）
      const cleanOutput = stripAnsi(r.output).trim();
      let parsed: any = null;
      try { parsed = JSON.parse(cleanOutput); } catch { /* 继续 */ }
      if (!parsed) {
        const lastClose = cleanOutput.lastIndexOf('}');
        if (lastClose >= 0) {
          let depth = 0, start = -1;
          for (let i = lastClose; i >= 0; i--) {
            if (cleanOutput[i] === '}') depth++;
            else if (cleanOutput[i] === '{') { depth--; if (depth === 0) { start = i; break; } }
          }
          if (start >= 0) {
            try { parsed = JSON.parse(cleanOutput.substring(start, lastClose + 1)); } catch { /* 继续 */ }
          }
        }
      }
      // 真实结构：{ plugins: [...] }
      const rawList: any[] = parsed
        ? (Array.isArray(parsed) ? parsed : Array.isArray(parsed?.plugins) ? parsed.plugins : [])
        : [];
      const plugins: PluginInfo[] = rawList.map((item: any): PluginInfo => {
        // 状态映射：优先使用 CLI 返回的 status 字段
        // loaded = 已加载运行中，disabled = 未启用，error = 出错，enabled = 已启用
        let status: PluginInfo['status'];
        if (item.enabled === false) {
          status = 'disabled';
        } else if (item.status === 'error') {
          status = 'error';
        } else if (item.status === 'loaded') {
          // 保留 loaded 状态，前端可区分"已加载"与"已启用"
          status = 'loaded';
        } else {
          status = 'enabled';
        }
        return {
          id: String(item.id || item.name || ''),
          name: String(item.name || item.id || ''),
          version: String(item.version || '0.0.0'),
          status,
          description: item.description ? String(item.description) : undefined,
          // 路径：优先取 source 字段（真实 CLI 字段），其次 path
          path: item.source ? String(item.source) : (item.path ? String(item.path) : undefined),
          // toolNames 是真实字段（工具名数组），兼容旧字段 skills
          skills: Array.isArray(item.toolNames) ? item.toolNames.map(String)
            : Array.isArray(item.skills) ? item.skills.map(String)
            : undefined,
          // origin 字段：bundled = 内置，global = 用户安装
          origin: item.origin ? String(item.origin) : undefined,
        };
      });
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
;
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

  // ── Task 4.8: 本地文件安装 ────────────────────────────────────────────────────

  /**
   * 选择本地文件进行安装
   * 支持格式：.zip 文件或包含 SKILL.md 的文件夹
   */
  ipcMain.handle('skills:installFromLocal', async () => {
    try {
      // 获取当前窗口引用
      const focusedWindow = BrowserWindow.getFocusedWindow();
      if (!focusedWindow) return { success: false, error: '未找到活动窗口' };

      // 弹出文件选择对话框
      const result = await dialog.showOpenDialog(focusedWindow, {
        title: '选择技能文件',
        properties: ['openFile', 'openDirectory'],
        filters: [
          { name: '技能包', extensions: ['zip'] },
          { name: '所有文件', extensions: ['*'] },
        ],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, canceled: true, error: '用户取消选择' };
      }

      const filePath = result.filePaths[0];
      return { success: true, filePath };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  /**
   * 安装本地文件
   * 支持格式：.zip 文件解压或文件夹复制到 skills 目录
   */
  ipcMain.handle('skills:installLocalFile', async (_, filePath: string) => {
    try {
      if (!filePath || !filePath.trim()) {
        return { success: false, error: '文件路径不能为空' };
      }

      const skillsDir = join(getOpenClawRootDir(), 'skills');
      if (!existsSync(skillsDir)) {
        await fs.mkdir(skillsDir, { recursive: true });
      }

      // 检查是否为 .zip 文件
      const isZip = filePath.toLowerCase().endsWith('.zip');
      let tempDir: string | null = null;
      let skillId: string | null = null;

      try {
        if (isZip) {
          // 解压 zip 文件
          const zip = new AdmZip(filePath);
          const zipEntries = zip.getEntries();

          // 查找 SKILL.md 所在的根目录
          let skillRootEntry = null;
          for (const entry of zipEntries) {
            if (entry.entryName.endsWith('SKILL.md')) {
              // 获取 SKILL.md 所在的目录名称
              const parts = entry.entryName.split('/');
              if (parts.length >= 2) {
                // 找到包含 SKILL.md 的顶级目录
                const rootDir = parts[0];
                skillRootEntry = rootDir;
                break;
              }
            }
          }

          if (!skillRootEntry) {
            return { success: false, error: 'ZIP 文件中未找到 SKILL.md，请检查文件结构' };
          }

          // 解压到临时目录
          tempDir = join(skillsDir, `.temp-${Date.now()}`);
          zip.extractAllTo(tempDir, true);

          // 检查解压后的目录
          const extractedDir = join(tempDir, skillRootEntry);
          if (!existsSync(extractedDir)) {
            return { success: false, error: '解压失败，无法找到技能目录' };
          }

          // 检查 SKILL.md 是否存在
          const skillMdPath = join(extractedDir, 'SKILL.md');
          if (!existsSync(skillMdPath)) {
            return { success: false, error: '技能目录中缺少 SKILL.md 文件' };
          }

          // 解析 SKILL.md 获取技能名称
          const skillMdContent = await fs.readFile(skillMdPath, 'utf-8');
          const parsed = parseSkillMd(skillMdContent);
          if (!parsed.ok) {
            return { success: false, error: 'SKILL.md 解析失败: 格式错误' };
          }

          skillId = toKebabCase(parsed.data.frontmatter.name);

          // 检查是否已存在
          const targetDir = join(skillsDir, skillId);
          if (existsSync(targetDir)) {
            return { success: false, error: `技能 "${skillId}" 已存在，请先卸载旧版本` };
          }

          // 移动目录到 skills 目录
          await fs.rename(extractedDir, targetDir);
        } else {
          // 文件夹模式：检查是否包含 SKILL.md
          const skillMdPath = join(filePath, 'SKILL.md');
          if (!existsSync(skillMdPath)) {
            return { success: false, error: '所选文件夹中缺少 SKILL.md 文件' };
          }

          // 解析 SKILL.md 获取技能名称
          const skillMdContent = await fs.readFile(skillMdPath, 'utf-8');
          const parsed = parseSkillMd(skillMdContent);
          if (!parsed.ok) {
            return { success: false, error: 'SKILL.md 解析失败: 格式错误' };
          }

          skillId = toKebabCase(parsed.data.frontmatter.name);

          // 检查是否已存在
          const targetDir = join(skillsDir, skillId);
          if (existsSync(targetDir)) {
            return { success: false, error: `技能 "${skillId}" 已存在，请先卸载旧版本` };
          }

          // 复制整个文件夹到 skills 目录
          await fs.cp(filePath, targetDir, { recursive: true });
        }

        // 清理临时目录
        if (tempDir && existsSync(tempDir)) {
          await fs.rm(tempDir, { recursive: true, force: true });
        }

        // 清除缓存
        diskCache.invalidate();

        return { success: true, skillId };
      } catch (installError: any) {
        // 清理临时目录
        if (tempDir && existsSync(tempDir)) {
          try {
            await fs.rm(tempDir, { recursive: true, force: true });
          } catch {
            // 忽略清理错误
          }
        }
        throw installError;
      }
    } catch (err: any) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── Task 4.4: Agent专属技能管理 ────────────────────────────────────────

  // 将技能绑定到一个或多个Agent
  ipcMain.handle('skills:bindToAgents', async (_, skillId: string, agentIds: string[]) => {
    try {
      bindSkillToAgents(skillId, agentIds);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // 从一个或多个Agent解绑技能
  ipcMain.handle('skills:unbindFromAgents', async (_, skillId: string, agentIds: string[]) => {
    try {
      unbindSkillFromAgents(skillId, agentIds);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // 获取技能绑定的所有Agent列表
  ipcMain.handle('skills:getBoundAgents', async (_, skillId: string) => {
    try {
      const bindings = getBoundAgents(skillId);
      return { success: true, bindings };
    } catch (err: any) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // 获取Agent的专属技能信息（全局技能+专属技能）
  ipcMain.handle('skills:getAgentAgentSkills', async (_, agentId: string) => {
    try {
      // 获取所有技能列表
      const allSkills = await fetchSkillsFromCLI();
      // 获取所有Agent列表 - 需要从agents模块导入
      // 暂时返回空结果，需要后续集成agents模块
      return {
        success: true,
        agentSkills: {
          agentId,
          globalSkills: allSkills,
          exclusiveSkills: [],
        },
      };
    } catch (err: any) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // 检查Agent是否有权限调用指定技能
  ipcMain.handle('skills:checkPermission', async (_, agentId: string, skillId: string) => {
    try {
      const result = checkSkillPermission(agentId, skillId);
      return { success: true, ...result };
    } catch (err: any) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // 获取所有技能与Agent的绑定关系
  ipcMain.handle('skills:getAllBindings', async () => {
    try {
      const bindings = getAllBindings();
      return { success: true, bindings };
    } catch (err: any) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}
