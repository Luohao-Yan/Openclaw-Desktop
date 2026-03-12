import pkg from 'electron';
const { ipcMain } = pkg;
import { existsSync, readdirSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { getOpenClawRootDir, resolveOpenClawCommand } from './settings.js';

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
}

// 运行 OpenClaw 命令的辅助函数
async function runOpenClawCommand(args: string[]): Promise<{ success: boolean; output: string; error?: string }> {
  return new Promise((resolve) => {
    try {
      const { spawn } = require('child_process');
      const process = spawn(resolveOpenClawCommand(), args);
      
      let output = '';
      let errorOutput = '';
      
      process.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      process.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      process.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, output });
        } else {
          resolve({ success: false, output: '', error: errorOutput || `Command exited with code ${code}` });
        }
      });
      
      process.on('error', (error) => {
        resolve({ success: false, output: '', error: error.message });
      });
      
      // 设置超时
      setTimeout(() => {
        try {
          process.kill();
        } catch (e) {
          // ignore
        }
        resolve({ success: false, output: '', error: 'Command timeout' });
      }, 15000);
      
    } catch (error: any) {
      resolve({ success: false, output: '', error: error.message });
    }
  });
}

// 获取已安装的技能
async function getInstalledSkills(): Promise<SkillInfo[]> {
  const skills: SkillInfo[] = [];
  const rootDir = getOpenClawRootDir();
  const skillsDir = join(rootDir, 'skills');
  
  if (!existsSync(skillsDir)) {
    return skills;
  }
  
  try {
    const entries = readdirSync(skillsDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillId = entry.name;
        const skillPath = join(skillsDir, skillId);
        const packageJsonPath = join(skillPath, 'package.json');
        const skillMetadataPath = join(skillPath, 'SKILL.md');
        
        if (existsSync(packageJsonPath)) {
          try {
            const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
            
            // 尝试从 SKILL.md 读取描述
            let description = packageJson.description || 'No description available';
            if (existsSync(skillMetadataPath)) {
              const skillContent = readFileSync(skillMetadataPath, 'utf-8');
              const descMatch = skillContent.match(/## Description\s*\n([\s\S]*?)(?:\n##|\n#|\n$)/);
              if (descMatch) {
                description = descMatch[1].trim();
              }
            }
            
            skills.push({
              id: skillId,
              name: packageJson.name || skillId,
              description: description,
              version: packageJson.version || '1.0.0',
              author: typeof packageJson.author === 'string' 
                ? packageJson.author 
                : packageJson.author?.name || 'Unknown',
              category: packageJson.category || 'tools',
              status: 'installed',
              installedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              enabled: true,
              path: skillPath,
              dependencies: packageJson.dependencies ? Object.keys(packageJson.dependencies) : []
            });
          } catch (e) {
            console.error(`Error reading skill ${skillId}:`, e);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error reading skills directory:', error);
  }
  
  return skills;
}

// 获取可用的技能（从官方仓库）
async function getAvailableSkills(): Promise<SkillInfo[]> {
  const skills: SkillInfo[] = [];
  
  try {
    // 这里应该调用 OpenClaw 官方技能仓库 API
    // 暂时返回一些示例技能
    skills.push({
      id: 'github-integration',
      name: 'GitHub Integration',
      description: 'Integrate with GitHub for issue tracking, PR management, and repository operations',
      version: '1.2.0',
      author: 'OpenClaw Team',
      category: 'development',
      status: 'available',
      size: 245760,
      dependencies: ['axios', 'octokit'],
      rating: 4.8,
      downloads: 1245,
      enabled: false
    });
    
    skills.push({
      id: 'calendar-integration',
      name: 'Calendar Integration',
      description: 'Integrate with calendar services for scheduling and event management',
      version: '1.0.0',
      author: 'OpenClaw Team',
      category: 'productivity',
      status: 'available',
      size: 204800,
      dependencies: ['googleapis'],
      rating: 4.5,
      downloads: 567,
      enabled: false
    });
    
    skills.push({
      id: 'weather',
      name: 'Weather',
      description: 'Get current weather and forecasts for any location',
      version: '1.1.0',
      author: 'OpenClaw Team',
      category: 'tools',
      status: 'available',
      size: 102400,
      dependencies: ['axios'],
      rating: 4.7,
      downloads: 890,
      enabled: false
    });
    
  } catch (error) {
    console.error('Error fetching available skills:', error);
  }
  
  return skills;
}

export function setupSkillsIPC() {
  // 获取所有技能
  ipcMain.handle('skills:getAll', async (): Promise<{ success: boolean; skills?: SkillInfo[]; error?: string }> => {
    try {
      const [installedSkills, availableSkills] = await Promise.all([
        getInstalledSkills(),
        getAvailableSkills()
      ]);
      
      // 合并技能，避免重复
      const allSkills = [...installedSkills];
      const installedIds = new Set(installedSkills.map(s => s.id));
      
      for (const availableSkill of availableSkills) {
        if (!installedIds.has(availableSkill.id)) {
          allSkills.push(availableSkill);
        }
      }
      
      return { success: true, skills: allSkills };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to get skills: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  });

  // 安装技能
  ipcMain.handle('skills:install', async (_, skillId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      // 这里应该调用真实的技能安装命令
      // 暂时模拟安装过程
      console.log(`Installing skill: ${skillId}`);
      
      // 模拟安装延迟
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // 卸载技能
  ipcMain.handle('skills:uninstall', async (_, skillId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      // 这里应该调用真实的技能卸载命令
      // 暂时模拟卸载过程
      console.log(`Uninstalling skill: ${skillId}`);
      
      // 模拟卸载延迟
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // 更新技能
  ipcMain.handle('skills:update', async (_, skillId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      // 这里应该调用真实的技能更新命令
      // 暂时模拟更新过程
      console.log(`Updating skill: ${skillId}`);
      
      // 模拟更新延迟
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // 启用技能
  ipcMain.handle('skills:enable', async (_, skillId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      // 这里应该启用技能
      console.log(`Enabling skill: ${skillId}`);
      
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // 禁用技能
  ipcMain.handle('skills:disable', async (_, skillId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      // 这里应该禁用技能
      console.log(`Disabling skill: ${skillId}`);
      
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // 获取技能统计信息
  ipcMain.handle('skills:stats', async (): Promise<{ 
    success: boolean; 
    stats?: {
      total: number;
      installed: number;
      available: number;
      updatable: number;
      enabled: number;
      byCategory: Record<string, number>;
    }; 
    error?: string 
  }> => {
    try {
      const [installedSkills, availableSkills] = await Promise.all([
        getInstalledSkills(),
        getAvailableSkills()
      ]);
      
      const allSkills = [...installedSkills];
      const installedIds = new Set(installedSkills.map(s => s.id));
      
      for (const availableSkill of availableSkills) {
        if (!installedIds.has(availableSkill.id)) {
          allSkills.push(availableSkill);
        }
      }
      
      const stats = {
        total: allSkills.length,
        installed: installedSkills.length,
        available: availableSkills.length,
        updatable: installedSkills.filter(s => s.status === 'updatable').length,
        enabled: installedSkills.filter(s => s.enabled).length,
        byCategory: allSkills.reduce((acc, skill) => {
          acc[skill.category] = (acc[skill.category] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      };
      
      return { success: true, stats };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // 搜索技能
  ipcMain.handle('skills:search', async (_, query: string): Promise<{ success: boolean; skills?: SkillInfo[]; error?: string }> => {
    try {
      const [installedSkills, availableSkills] = await Promise.all([
        getInstalledSkills(),
        getAvailableSkills()
      ]);
      
      const allSkills = [...installedSkills];
      const installedIds = new Set(installedSkills.map(s => s.id));
      
      for (const availableSkill of availableSkills) {
        if (!installedIds.has(availableSkill.id)) {
          allSkills.push(availableSkill);
        }
      }
      
      const filteredSkills = allSkills.filter(skill => 
        skill.name.toLowerCase().includes(query.toLowerCase()) ||
        skill.description.toLowerCase().includes(query.toLowerCase()) ||
        skill.category.toLowerCase().includes(query.toLowerCase())
      );
      
      return { success: true, skills: filteredSkills };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
}