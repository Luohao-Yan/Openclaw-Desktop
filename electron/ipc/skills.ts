import pkg from 'electron';
const { ipcMain } = pkg;
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { getOpenClawRootDir, resolveOpenClawCommand, runCommand as runShellCommand } from './settings.js';

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  category: string;
  status: 'installed' | 'available' | 'updatable' | 'error';
  installedAt?: string;
  updatedAt?: string;
  size?: number;
  dependencies?: string[];
  rating?: number;
  downloads?: number;
  enabled: boolean;
  path?: string;
  eligible?: boolean;
  missingRequirements?: string[];
}

// 运行 openclaw 命令，复用 settings 中带完整 shell PATH 的 runCommand
async function runCommand(args: string[]): Promise<{ success: boolean; output: string; error?: string }> {
  const cmd = resolveOpenClawCommand();
  return runShellCommand(cmd, args);
}

function stripAnsi(s: string): string {
  return s.replace(/\u001b\[[0-9;]*m/g, '').replace(/\x1B\[[0-9;]*m/g, '');
}

function tryParseJson<T>(raw: string): T | null {
  const text = stripAnsi(raw).trim();
  if (!text) return null;
  try { return JSON.parse(text) as T; } catch { return null; }
}

function inferSkillCategory(name: string, description: string): string {
  const nameLower = name.toLowerCase();
  const descLower = description.toLowerCase();
  
  // 根据技能名称和描述推断分类
  if (nameLower.includes('feishu') || descLower.includes('飞书') || descLower.includes('lark')) {
    return 'feishu';
  }
  if (descLower.includes('github') || nameLower.includes('gh')) {
    return 'development';
  }
  if (descLower.includes('calendar') || descLower.includes('日程') || descLower.includes('会议')) {
    return 'productivity';
  }
  if (descLower.includes('task') || descLower.includes('任务') || descLower.includes('待办')) {
    return 'productivity';
  }
  if (descLower.includes('note') || descLower.includes('笔记') || descLower.includes('文档')) {
    return 'productivity';
  }
  if (descLower.includes('ai') || descLower.includes('模型') || descLower.includes('llm')) {
    return 'ai';
  }
  if (descLower.includes('security') || descLower.includes('安全') || descLower.includes('加密')) {
    return 'security';
  }
  if (descLower.includes('automation') || descLower.includes('自动化')) {
    return 'automation';
  }
  if (descLower.includes('monitor') || descLower.includes('监控')) {
    return 'monitoring';
  }
  if (descLower.includes('message') || descLower.includes('聊天') || descLower.includes('im')) {
    return 'communication';
  }
  if (descLower.includes('music') || descLower.includes('音频') || descLower.includes('播放')) {
    return 'media';
  }
  if (descLower.includes('image') || descLower.includes('图片') || descLower.includes('视频')) {
    return 'media';
  }
  
  return 'tools';
}

// 从本地 skills 目录读取已安装技能
function readInstalledSkillsFromDisk(): SkillInfo[] {
  const skills: SkillInfo[] = [];
  
  // 检查多个可能的技能安装位置
  const possiblePaths = [
    join(process.env.HOME || '', '.openclaw', 'skills'),
    join(process.env.HOME || '', '.openclaw', 'lib', 'node_modules', 'openclaw', 'skills'),
    join(process.env.HOME || '', '.openclaw', 'lib', 'node_modules', 'clawbot', 'skills'),
    getOpenClawRootDir() ? join(getOpenClawRootDir(), 'skills') : null,
  ].filter((p): p is string => p !== null);

  for (const skillsDir of possiblePaths) {
    if (!existsSync(skillsDir)) continue;

    try {
      const entries = readdirSync(skillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillId = entry.name;
        const skillPath = join(skillsDir, skillId);
        const skillMdPath = join(skillPath, 'SKILL.md');
        
        if (!existsSync(skillMdPath)) continue;

        try {
          const mdContent = readFileSync(skillMdPath, 'utf-8');
          
          // 解析 YAML frontmatter
          const frontmatterMatch = mdContent.match(/^---\n([\s\S]*?)\n---\n/);
          let description = '';
          let name = skillId;
          let version = '1.0.0';
          let author = 'Unknown';
          let category = 'tools';
          let emoji = '📦';
          let requires = {};
          let homepage = '';

          if (frontmatterMatch) {
            const frontmatter = frontmatterMatch[1];
            
            // 提取 description
            const descMatch = frontmatter.match(/description:\s*"([^"]+)"|\s*'([^']+)'/);
            if (descMatch) description = descMatch[1] || descMatch[2] || '';
            
            // 提取 name
            const nameMatch = frontmatter.match(/name:\s*([^\n\s]+)/);
            if (nameMatch) name = nameMatch[1];
            
            // 解析 metadata 块
            const metadataMatch = frontmatter.match(/metadata:\s*\{([\s\S]*?)\}/);
            if (metadataMatch) {
              try {
                const metadataStr = metadataMatch[0].replace(/metadata:\s*/, '');
                const metadata = JSON.parse(metadataStr.replace(/(\w+):/g, '"$1":'));
                
                if (metadata.openclaw) {
                  const oc = metadata.openclaw;
                  if (oc.emoji) emoji = oc.emoji;
                  if (oc.requires) requires = oc.requires;
                  if (oc.homepage) homepage = oc.homepage;
                }
              } catch { /* 忽略解析错误 */ }
            }
          }

          // 如果没有从frontmatter获取到description，尝试从SKILL.md内容获取
          if (!description) {
            const descMatch = mdContent.match(/## Description\s*\n([\s\S]*?)(?:\n##|\n#|$)/);
            if (descMatch) description = descMatch[1].trim();
          }

          // 确定技能状态
          const status = 'installed';
          
          skills.push({
            id: skillId,
            name: name,
            description,
            version,
            author,
            category,
            status,
            enabled: true,
            path: skillPath,
            dependencies: [],
            missingRequirements: [],
          });
        } catch { /* 跳过解析失败的技能 */ }
      }
    } catch (err) {
      console.error(`读取 skills 目录 ${skillsDir} 失败:`, err);
    }
  }

  return skills;
}

// 调用 openclaw skills list --json 获取技能列表
async function fetchSkillsFromCLI(): Promise<SkillInfo[]> {
  // 先尝试带 --json 标志
  const result = await runCommand(['skills', 'list', '--json']);
  const parsed = tryParseJson<unknown>(result.output);

  if (parsed) {
    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as any)?.skills)
        ? (parsed as any).skills
        : Array.isArray((parsed as any)?.items)
          ? (parsed as any).items
          : [];

    return list
      .filter((item: any) => typeof item === 'object' && item !== null)
      .map((item: any): SkillInfo => {
        const id = String(item.id || item.name || '');
        const name = String(item.name || item.id || '');
        const description = String(item.description || '');
        const version = String(item.version || '1.0.0');
        const author = String(item.author || 'Unknown');
        const category = inferSkillCategory(name, description);
        const eligible = Boolean(item.eligible);
        const disabled = Boolean(item.disabled);
        const missing = item.missing || {};
        const missingBins = Array.isArray(missing.bins) ? missing.bins : [];
        const missingEnv = Array.isArray(missing.env) ? missing.env : [];
        const missingConfig = Array.isArray(missing.config) ? missing.config : [];
        
        // 检查是否已安装（从磁盘读取）
        const installedSkills = readInstalledSkillsFromDisk();
        const isInstalled = installedSkills.some(s => s.id === id || s.name === name);
        
        // 确定技能状态
        let status: SkillInfo['status'] = 'available';
        if (disabled) {
          status = 'error';
        } else if (isInstalled) {
          status = 'installed';
          // TODO: 检查是否有更新可用，如果有则设置为'updatable'
        } else if (eligible && missingBins.length === 0 && missingEnv.length === 0 && missingConfig.length === 0) {
          status = 'available';
        } else {
          status = 'error';
        }

        return {
          id,
          name,
          description: description.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim(),
          version,
          author,
          category,
          status,
          enabled: !disabled && isInstalled,
          eligible,
          missingRequirements: [...missingBins, ...missingEnv, ...missingConfig],
        };
      });
  }

  // 回退：从磁盘读取
  return readInstalledSkillsFromDisk();
}

// 调用 openclaw skills list --eligible --json 获取可用技能
async function fetchEligibleSkillsFromCLI(): Promise<SkillInfo[]> {
  const result = await runCommand(['skills', 'list', '--eligible', '--json']);
  const parsed = tryParseJson<unknown>(result.output);
  if (!parsed) return [];

  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as any)?.skills)
      ? (parsed as any).skills
      : [];

  return list
    .filter((item: any) => typeof item === 'object' && item !== null)
    .map((item: any): SkillInfo => {
      const id = String(item.id || item.name || '');
      const name = String(item.name || item.id || '');
      const description = String(item.description || '');
      const version = String(item.version || '1.0.0');
      const author = String(item.author || 'Unknown');
      const category = inferSkillCategory(name, description);
      const eligible = Boolean(item.eligible);
      const disabled = Boolean(item.disabled);
      const missing = item.missing || {};
      const missingBins = Array.isArray(missing.bins) ? missing.bins : [];
      const missingEnv = Array.isArray(missing.env) ? missing.env : [];
      const missingConfig = Array.isArray(missing.config) ? missing.config : [];

      // 检查是否已安装
      const installedSkills = readInstalledSkillsFromDisk();
      const isInstalled = installedSkills.some(s => s.id === id || s.name === name);

      return {
        id,
        name,
        description: description.replace(/\n/g, ' ').trim(),
        version,
        author,
        category,
        status: isInstalled ? 'installed' : 'available',
        enabled: !disabled && isInstalled,
        eligible,
        missingRequirements: [...missingBins, ...missingEnv, ...missingConfig],
      };
    });
}

export function setupSkillsIPC() {
  // 获取所有技能（已安装 + 可用）
  ipcMain.handle('skills:getAll', async (): Promise<{ success: boolean; skills?: SkillInfo[]; error?: string }> => {
    try {
      const [allSkills, eligibleSkills] = await Promise.all([
        fetchSkillsFromCLI(),
        fetchEligibleSkillsFromCLI(),
      ]);

      // 合并技能：优先保留已安装的，避免重复
      const skillMap = new Map<string, SkillInfo>();
      
      // 首先添加所有技能
      for (const skill of allSkills) {
        skillMap.set(skill.id, skill);
      }
      
      // 然后添加eligible技能，但不要覆盖已安装的
      for (const skill of eligibleSkills) {
        if (!skillMap.has(skill.id)) {
          skillMap.set(skill.id, skill);
        } else {
          const existing = skillMap.get(skill.id)!;
          // 如果eligible技能是已安装的，更新状态
          if (skill.status === 'installed' && existing.status !== 'installed') {
            skillMap.set(skill.id, { ...existing, status: 'installed', enabled: skill.enabled });
          }
        }
      }

      const merged = Array.from(skillMap.values());

      return { success: true, skills: merged };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // 安装技能（使用 clawhub install <id>）
  ipcMain.handle('skills:install', async (_, skillId: string): Promise<{ success: boolean; error?: string }> => {
    // 使用 clawhub install 命令
    const result = await runCommand(['clawhub', 'install', skillId]);
    if (!result.success) {
      return { success: false, error: result.error || '安装技能失败' };
    }
    return { success: true };
  });

  // 卸载技能（使用 clawhub uninstall <id>）
  ipcMain.handle('skills:uninstall', async (_, skillId: string): Promise<{ success: boolean; error?: string }> => {
    const result = await runCommand(['clawhub', 'uninstall', skillId]);
    if (!result.success) {
      return { success: false, error: result.error || '卸载技能失败' };
    }
    return { success: true };
  });

  // 更新技能（使用 clawhub update <id>）
  ipcMain.handle('skills:update', async (_, skillId: string): Promise<{ success: boolean; error?: string }> => {
    const result = await runCommand(['clawhub', 'update', skillId]);
    if (!result.success) {
      return { success: false, error: result.error || '更新技能失败' };
    }
    return { success: true };
  });

  // 启用技能
  ipcMain.handle('skills:enable', async (_, skillId: string): Promise<{ success: boolean; error?: string }> => {
    const result = await runCommand(['skills', 'enable', skillId]);
    if (!result.success) {
      return { success: false, error: result.error || '启用技能失败' };
    }
    return { success: true };
  });

  // 禁用技能
  ipcMain.handle('skills:disable', async (_, skillId: string): Promise<{ success: boolean; error?: string }> => {
    const result = await runCommand(['skills', 'disable', skillId]);
    if (!result.success) {
      return { success: false, error: result.error || '禁用技能失败' };
    }
    return { success: true };
  });

  // 技能统计
  ipcMain.handle('skills:stats', async (): Promise<{ success: boolean; stats?: Record<string, unknown>; error?: string }> => {
    try {
      const skills = await fetchSkillsFromCLI();
      const stats = {
        total: skills.length,
        installed: skills.filter(s => s.status === 'installed').length,
        available: skills.filter(s => s.status === 'available').length,
        updatable: skills.filter(s => s.status === 'updatable').length,
        enabled: skills.filter(s => s.enabled && s.status === 'installed').length,
        byCategory: skills.reduce((acc, s) => {
          acc[s.category] = (acc[s.category] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      };
      return { success: true, stats };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // 搜索技能
  ipcMain.handle('skills:search', async (_, query: string): Promise<{ success: boolean; skills?: SkillInfo[]; error?: string }> => {
    try {
      const skills = await fetchSkillsFromCLI();
      const q = query.toLowerCase();
      const filtered = skills.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q),
      );
      return { success: true, skills: filtered };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}
