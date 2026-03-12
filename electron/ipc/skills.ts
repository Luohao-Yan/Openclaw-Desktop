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

// 从本地 skills 目录读取已安装技能
function readInstalledSkillsFromDisk(): SkillInfo[] {
  const skills: SkillInfo[] = [];
  const rootDir = getOpenClawRootDir();
  const skillsDir = join(rootDir, 'skills');

  if (!existsSync(skillsDir)) return skills;

  try {
    const entries = readdirSync(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillId = entry.name;
      const skillPath = join(skillsDir, skillId);
      const pkgPath = join(skillPath, 'package.json');
      if (!existsSync(pkgPath)) continue;

      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        let description = pkg.description || '';

        // 尝试从 SKILL.md 读取描述
        const skillMdPath = join(skillPath, 'SKILL.md');
        if (existsSync(skillMdPath)) {
          const md = readFileSync(skillMdPath, 'utf-8');
          const m = md.match(/## Description\s*\n([\s\S]*?)(?:\n##|\n#|$)/);
          if (m) description = m[1].trim();
        }

        skills.push({
          id: skillId,
          name: pkg.name || skillId,
          description,
          version: pkg.version || '1.0.0',
          author: typeof pkg.author === 'string' ? pkg.author : (pkg.author?.name || 'Unknown'),
          category: pkg.category || 'tools',
          status: 'installed',
          enabled: true,
          path: skillPath,
          dependencies: pkg.dependencies ? Object.keys(pkg.dependencies) : [],
        });
      } catch { /* 跳过解析失败的技能 */ }
    }
  } catch (err) {
    console.error('读取 skills 目录失败:', err);
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
      .map((item: any): SkillInfo => ({
        id: String(item.id || item.name || ''),
        name: String(item.name || item.id || ''),
        description: String(item.description || ''),
        version: String(item.version || '1.0.0'),
        author: String(item.author || 'Unknown'),
        category: String(item.category || 'tools'),
        status: item.installed ? 'installed' : 'available',
        enabled: item.enabled !== false,
        eligible: item.eligible,
        missingRequirements: Array.isArray(item.missingRequirements) ? item.missingRequirements : [],
      }));
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
    .map((item: any): SkillInfo => ({
      id: String(item.id || item.name || ''),
      name: String(item.name || item.id || ''),
      description: String(item.description || ''),
      version: String(item.version || '1.0.0'),
      author: String(item.author || 'Unknown'),
      category: String(item.category || 'tools'),
      status: 'available',
      enabled: false,
      eligible: true,
    }));
}

export function setupSkillsIPC() {
  // 获取所有技能（已安装 + 可用）
  ipcMain.handle('skills:getAll', async (): Promise<{ success: boolean; skills?: SkillInfo[]; error?: string }> => {
    try {
      const [allSkills, eligibleSkills] = await Promise.all([
        fetchSkillsFromCLI(),
        fetchEligibleSkillsFromCLI(),
      ]);

      // 合并：已安装优先，eligible 补充未安装的
      const installedIds = new Set(allSkills.filter(s => s.status === 'installed').map(s => s.id));
      const merged = [...allSkills];
      for (const s of eligibleSkills) {
        if (!installedIds.has(s.id) && !merged.some(m => m.id === s.id)) {
          merged.push(s);
        }
      }

      return { success: true, skills: merged };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // 安装技能（openclaw skills install <id> 或 openclaw clawbot install <id>）
  ipcMain.handle('skills:install', async (_, skillId: string): Promise<{ success: boolean; error?: string }> => {
    // 尝试 skills install，再尝试 clawbot install
    let result = await runCommand(['skills', 'install', skillId]);
    if (!result.success) {
      result = await runCommand(['clawbot', 'install', skillId]);
    }
    if (!result.success) {
      return { success: false, error: result.error || '安装技能失败' };
    }
    return { success: true };
  });

  // 卸载技能
  ipcMain.handle('skills:uninstall', async (_, skillId: string): Promise<{ success: boolean; error?: string }> => {
    let result = await runCommand(['skills', 'uninstall', skillId]);
    if (!result.success) {
      result = await runCommand(['clawbot', 'uninstall', skillId]);
    }
    if (!result.success) {
      return { success: false, error: result.error || '卸载技能失败' };
    }
    return { success: true };
  });

  // 更新技能
  ipcMain.handle('skills:update', async (_, skillId: string): Promise<{ success: boolean; error?: string }> => {
    let result = await runCommand(['skills', 'update', skillId]);
    if (!result.success) {
      result = await runCommand(['clawbot', 'update', skillId]);
    }
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
