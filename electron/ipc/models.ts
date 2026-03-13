/**
 * Models IPC 处理器
 * 负责模型配置相关的 IPC 通信，包括：
 * - 提供商认证状态查询
 * - Onboard 向导启动
 * - 模型扫描
 * - 主模型和备用模型配置
 * - 模型别名管理
 */

import pkg from 'electron';
const { ipcMain, shell } = pkg;
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { getOpenClawRootDir } from './settings.js';

/** 获取配置文件路径 */
const getConfigPath = () => path.join(getOpenClawRootDir(), 'openclaw.json');

/**
 * 执行 openclaw CLI 命令
 * @param args CLI 参数数组
 * @param timeoutMs 超时时间（毫秒）
 * @returns 执行结果
 */
async function runOpenClawCommand(
  args: string[],
  timeoutMs = 30000
): Promise<{ success: boolean; output: string; error?: string }> {
  return new Promise((resolve) => {
    try {
      const child = spawn('openclaw', args, {
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let output = '';
      let errorOutput = '';
      let settled = false;

      const finish = (result: { success: boolean; output: string; error?: string }) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      child.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });

      child.stderr?.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          finish({ success: true, output: output.trim() });
        } else {
          finish({
            success: false,
            output: output.trim(),
            error: errorOutput.trim() || `Command exited with code ${code}`,
          });
        }
      });

      child.on('error', (err) => {
        finish({ success: false, output: '', error: err.message });
      });

      setTimeout(() => {
        try {
          child.kill();
        } catch {}
        finish({ success: false, output, error: 'Command timeout' });
      }, timeoutMs);
    } catch (err: any) {
      resolve({ success: false, output: '', error: err.message });
    }
  });
}

/**
 * 读取配置文件
 * @returns 配置对象或 null
 */
function readConfig(): any | null {
  try {
    const configPath = getConfigPath();
    if (!existsSync(configPath)) {
      return null;
    }
    const content = readFileSync(configPath, 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * 写入配置文件
 * @param config 配置对象
 * @returns 是否成功
 */
function writeConfig(config: any): boolean {
  try {
    const configPath = getConfigPath();
    const jsonContent = JSON.stringify(config, null, 2);
    writeFileSync(configPath, jsonContent, 'utf8');
    return true;
  } catch {
    return false;
  }
}

/**
 * 安全地获取嵌套对象属性
 * @param obj 对象
 * @param path 属性路径（点分隔）
 * @returns 属性值或 undefined
 */
function getNestedProperty(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * 安全地设置嵌套对象属性
 * @param obj 对象
 * @param path 属性路径（点分隔）
 * @param value 要设置的值
 */
function setNestedProperty(obj: any, path: string, value: any): void {
  const keys = path.split('.');
  const lastKey = keys.pop();
  if (!lastKey) return;

  let current = obj;
  for (const key of keys) {
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }
  current[lastKey] = value;
}

/** 设置 Models IPC 处理器 */
export function setupModelsIPC() {
  // ── 认证状态 ──────────────────────────────────────────────────────────────
  
  /**
   * models:status - 获取所有提供商的认证状态
   * 执行 `openclaw models status` 并解析 JSON 输出
   */
  ipcMain.handle('models:status', async () => {
    try {
      const result = await runOpenClawCommand(['models', 'status', '--json']);
      
      if (!result.success) {
        return {
          success: false,
          providers: {},
          error: result.error || 'Failed to execute openclaw models status',
        };
      }

      // 尝试解析 JSON 输出
      try {
        const statusData = JSON.parse(result.output);
        // 假设 CLI 返回格式为 { "provider-id": "authenticated" | "unauthenticated", ... }
        return {
          success: true,
          providers: statusData,
        };
      } catch (parseErr) {
        // JSON 解析失败，返回空状态映射
        return {
          success: false,
          providers: {},
          error: 'Invalid JSON output from openclaw models status',
        };
      }
    } catch (err: any) {
      return {
        success: false,
        providers: {},
        error: err.message || 'Unknown error',
      };
    }
  });

  // ── Onboard / Scan ────────────────────────────────────────────────────────
  
  /**
   * models:onboard - 在系统终端启动 openclaw onboard 交互式命令
   */
  ipcMain.handle('models:onboard', async () => {
    try {
      // 在用户的默认终端中打开 openclaw onboard
      const platform = process.platform;
      
      if (platform === 'darwin') {
        // macOS: 使用 Terminal.app
        await shell.openExternal('openclaw://onboard');
        // 备用方案：直接执行命令
        spawn('open', ['-a', 'Terminal', 'openclaw', 'onboard'], {
          detached: true,
          stdio: 'ignore',
        }).unref();
      } else if (platform === 'win32') {
        // Windows: 使用 cmd
        spawn('cmd', ['/c', 'start', 'cmd', '/k', 'openclaw', 'onboard'], {
          detached: true,
          stdio: 'ignore',
        }).unref();
      } else {
        // Linux: 尝试常见终端
        const terminals = ['gnome-terminal', 'konsole', 'xterm'];
        let launched = false;
        for (const term of terminals) {
          try {
            spawn(term, ['-e', 'openclaw onboard'], {
              detached: true,
              stdio: 'ignore',
            }).unref();
            launched = true;
            break;
          } catch {}
        }
        if (!launched) {
          return {
            success: false,
            error: 'No suitable terminal found on Linux',
          };
        }
      }

      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Failed to launch onboard wizard',
      };
    }
  });

  /**
   * models:scan - 执行 openclaw models scan 并返回输出文本
   */
  ipcMain.handle('models:scan', async () => {
    try {
      const result = await runOpenClawCommand(['models', 'scan']);
      
      if (!result.success) {
        return {
          success: false,
          output: result.output,
          error: result.error || 'Failed to execute openclaw models scan',
        };
      }

      return {
        success: true,
        output: result.output,
      };
    } catch (err: any) {
      return {
        success: false,
        output: '',
        error: err.message || 'Unknown error',
      };
    }
  });

  // ── 配置读写 ──────────────────────────────────────────────────────────────
  
  /**
   * models:getConfig - 读取主模型和备用模型配置
   */
  ipcMain.handle('models:getConfig', async () => {
    try {
      const config = readConfig();
      if (!config) {
        return {
          success: false,
          error: 'Config file not found or invalid',
        };
      }

      const primary = getNestedProperty(config, 'agents.defaults.model.primary') || '';
      const fallbacks = getNestedProperty(config, 'agents.defaults.model.fallbacks') || [];

      return {
        success: true,
        primary,
        fallbacks: Array.isArray(fallbacks) ? fallbacks : [],
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Failed to read config',
      };
    }
  });

  /**
   * models:setPrimary - 设置主模型
   */
  ipcMain.handle('models:setPrimary', async (_event, model: string) => {
    try {
      const config = readConfig();
      if (!config) {
        return {
          success: false,
          error: 'Config file not found',
        };
      }

      setNestedProperty(config, 'agents.defaults.model.primary', model);

      if (!writeConfig(config)) {
        return {
          success: false,
          error: 'Failed to write config file',
        };
      }

      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Failed to set primary model',
      };
    }
  });

  /**
   * models:fallbackAdd - 添加备用模型
   */
  ipcMain.handle('models:fallbackAdd', async (_event, model: string) => {
    try {
      const config = readConfig();
      if (!config) {
        return {
          success: false,
          error: 'Config file not found',
        };
      }

      let fallbacks = getNestedProperty(config, 'agents.defaults.model.fallbacks');
      if (!Array.isArray(fallbacks)) {
        fallbacks = [];
      }

      // 幂等：如果已存在则不添加
      if (!fallbacks.includes(model)) {
        fallbacks.push(model);
        setNestedProperty(config, 'agents.defaults.model.fallbacks', fallbacks);

        if (!writeConfig(config)) {
          return {
            success: false,
            error: 'Failed to write config file',
          };
        }
      }

      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Failed to add fallback model',
      };
    }
  });

  /**
   * models:fallbackRemove - 移除备用模型
   */
  ipcMain.handle('models:fallbackRemove', async (_event, model: string) => {
    try {
      const config = readConfig();
      if (!config) {
        return {
          success: false,
          error: 'Config file not found',
        };
      }

      let fallbacks = getNestedProperty(config, 'agents.defaults.model.fallbacks');
      if (!Array.isArray(fallbacks)) {
        fallbacks = [];
      }

      const newFallbacks = fallbacks.filter((m: string) => m !== model);
      setNestedProperty(config, 'agents.defaults.model.fallbacks', newFallbacks);

      if (!writeConfig(config)) {
        return {
          success: false,
          error: 'Failed to write config file',
        };
      }

      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Failed to remove fallback model',
      };
    }
  });

  /**
   * models:fallbackClear - 清空备用模型列表
   */
  ipcMain.handle('models:fallbackClear', async () => {
    try {
      const config = readConfig();
      if (!config) {
        return {
          success: false,
          error: 'Config file not found',
        };
      }

      setNestedProperty(config, 'agents.defaults.model.fallbacks', []);

      if (!writeConfig(config)) {
        return {
          success: false,
          error: 'Failed to write config file',
        };
      }

      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Failed to clear fallback models',
      };
    }
  });

  // ── 别名管理 ──────────────────────────────────────────────────────────────
  
  /**
   * models:aliasesList - 获取所有模型别名
   * 执行 `openclaw models aliases list --json`
   */
  ipcMain.handle('models:aliasesList', async () => {
    try {
      const result = await runOpenClawCommand(['models', 'aliases', 'list', '--json']);
      
      if (!result.success) {
        return {
          success: false,
          aliases: {},
          error: result.error || 'Failed to execute openclaw models aliases list',
        };
      }

      // 尝试解析 JSON 输出
      try {
        const aliasesData = JSON.parse(result.output);
        // 假设 CLI 返回格式为 { "alias": "provider/model", ... }
        return {
          success: true,
          aliases: aliasesData,
        };
      } catch (parseErr) {
        return {
          success: false,
          aliases: {},
          error: 'Invalid JSON output from openclaw models aliases list',
        };
      }
    } catch (err: any) {
      return {
        success: false,
        aliases: {},
        error: err.message || 'Unknown error',
      };
    }
  });

  /**
   * models:aliasAdd - 添加或更新模型别名
   * 执行 `openclaw models aliases add <alias> <model>`
   */
  ipcMain.handle('models:aliasAdd', async (_event, alias: string, model: string) => {
    try {
      const result = await runOpenClawCommand(['models', 'aliases', 'add', alias, model]);
      
      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Failed to add alias',
        };
      }

      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Failed to add alias',
      };
    }
  });

  /**
   * models:aliasRemove - 移除模型别名
   * 执行 `openclaw models aliases remove <alias>`
   */
  ipcMain.handle('models:aliasRemove', async (_event, alias: string) => {
    try {
      const result = await runOpenClawCommand(['models', 'aliases', 'remove', alias]);
      
      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Failed to remove alias',
        };
      }

      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Failed to remove alias',
      };
    }
  });
}
