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
   * models:getConfig - 读取主模型、备用模型和已配置的模型列表
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
      
      // 读取 agents.defaults.models（模型别名映射 / allowlist）
      const modelsConfig = getNestedProperty(config, 'agents.defaults.models') || {};
      
      // 读取 models.providers（自定义提供商配置）
      const providersConfig = getNestedProperty(config, 'models.providers') || {};

      return {
        success: true,
        primary,
        fallbacks: Array.isArray(fallbacks) ? fallbacks : [],
        configuredModels: modelsConfig, // 已配置的模型别名映射
        providers: providersConfig, // 自定义提供商配置
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

  // ── 模型管理 ──────────────────────────────────────────────────────────────
  
  /**
   * models:modelRemove - 从提供商配置中删除模型
   * @param providerId 提供商 ID（如 volcengine-plan）
   * @param modelId 模型 ID（如 kimi-k2.5）
   * 
   * 操作：
   * 1. 从 models.providers[providerId].models 数组中移除该模型
   * 2. 从 agents.defaults.models 中移除对应的别名配置（如果存在）
   * 3. 如果删除的是主模型，清空 agents.defaults.model.primary
   */
  ipcMain.handle('models:modelRemove', async (_event, providerId: string, modelId: string) => {
    try {
      const config = readConfig();
      if (!config) {
        return {
          success: false,
          error: 'Config file not found',
        };
      }

      // 1. 从 models.providers[providerId].models 中移除模型
      const providerConfig = getNestedProperty(config, `models.providers.${providerId}`);
      if (!providerConfig || !Array.isArray(providerConfig.models)) {
        return {
          success: false,
          error: `Provider ${providerId} not found or has no models`,
        };
      }

      const originalLength = providerConfig.models.length;
      providerConfig.models = providerConfig.models.filter((m: any) => m.id !== modelId);
      
      if (providerConfig.models.length === originalLength) {
        return {
          success: false,
          error: `Model ${modelId} not found in provider ${providerId}`,
        };
      }

      setNestedProperty(config, `models.providers.${providerId}.models`, providerConfig.models);

      // 2. 从 agents.defaults.models 中移除别名配置
      const fullModelId = `${providerId}/${modelId}`;
      const modelsConfig = getNestedProperty(config, 'agents.defaults.models') || {};
      if (modelsConfig[fullModelId]) {
        delete modelsConfig[fullModelId];
        setNestedProperty(config, 'agents.defaults.models', modelsConfig);
      }

      // 3. 如果删除的是主模型，清空 primary
      const primaryModel = getNestedProperty(config, 'agents.defaults.model.primary');
      if (primaryModel === fullModelId) {
        setNestedProperty(config, 'agents.defaults.model.primary', '');
      }

      // 4. 从 fallbacks 中移除（如果存在）
      let fallbacks = getNestedProperty(config, 'agents.defaults.model.fallbacks');
      if (Array.isArray(fallbacks) && fallbacks.includes(fullModelId)) {
        fallbacks = fallbacks.filter((m: string) => m !== fullModelId);
        setNestedProperty(config, 'agents.defaults.model.fallbacks', fallbacks);
      }

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
        error: err.message || 'Failed to remove model',
      };
    }
  });

  /**
   * models:modelAdd - 向提供商配置中添加模型
   * @param providerId 提供商 ID（如 volcengine-plan）
   * @param model 模型对象（至少包含 id 和 name）
   * 
   * 操作：
   * 1. 向 models.providers[providerId].models 数组中添加新模型
   * 2. 如果提供了 alias，同时在 agents.defaults.models 中添加别名配置
   */
  ipcMain.handle('models:modelAdd', async (_event, providerId: string, model: { id: string; name: string; alias?: string; [key: string]: any }) => {
    try {
      const config = readConfig();
      if (!config) {
        return {
          success: false,
          error: 'Config file not found',
        };
      }

      // 1. 确保提供商配置存在
      const providerConfig = getNestedProperty(config, `models.providers.${providerId}`);
      if (!providerConfig) {
        return {
          success: false,
          error: `Provider ${providerId} not found`,
        };
      }

      // 2. 确保 models 数组存在
      if (!Array.isArray(providerConfig.models)) {
        providerConfig.models = [];
      }

      // 3. 检查模型是否已存在
      if (providerConfig.models.some((m: any) => m.id === model.id)) {
        return {
          success: false,
          error: `Model ${model.id} already exists in provider ${providerId}`,
        };
      }

      // 4. 提取 alias 并从 model 对象中移除
      const { alias, ...modelData } = model;

      // 5. 添加模型到提供商配置
      providerConfig.models.push(modelData);
      setNestedProperty(config, `models.providers.${providerId}.models`, providerConfig.models);

      // 6. 如果提供了 alias，添加到 agents.defaults.models
      if (alias) {
        const fullModelId = `${providerId}/${model.id}`;
        const modelsConfig = getNestedProperty(config, 'agents.defaults.models') || {};
        modelsConfig[fullModelId] = { alias };
        setNestedProperty(config, 'agents.defaults.models', modelsConfig);
      }

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
        error: err.message || 'Failed to add model',
      };
    }
  });

  /**
   * models:providerConfigSave - 保存提供商配置（baseUrl、apiKey 等）
   * @param providerId 提供商 ID（如 anthropic、openai）
   * @param config 提供商配置对象（baseUrl、apiKey 等）
   * 
   * 操作：
   * 1. 如果提供商不存在，创建新的提供商配置
   * 2. 更新或添加 baseUrl、apiKey 等配置项
   * 3. 保留现有的 models 数组
   */
  ipcMain.handle('models:providerConfigSave', async (_event, providerId: string, providerConfig: { baseUrl?: string; apiKey?: string; [key: string]: any }) => {
    try {
      const config = readConfig();
      if (!config) {
        return {
          success: false,
          error: 'Config file not found',
        };
      }

      // 确保 models.providers 存在
      if (!config.models) {
        config.models = {};
      }
      if (!config.models.providers) {
        config.models.providers = {};
      }

      // 获取现有提供商配置（如果存在）
      const existingConfig = config.models.providers[providerId] || {};

      // 合并配置，保留现有的 models 数组
      const updatedConfig = {
        ...existingConfig,
        ...providerConfig,
        models: existingConfig.models || [], // 保留现有模型列表
      };

      // 移除值为 undefined 的字段
      Object.keys(updatedConfig).forEach(key => {
        if (updatedConfig[key] === undefined) {
          delete updatedConfig[key];
        }
      });

      config.models.providers[providerId] = updatedConfig;

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
        error: err.message || 'Failed to save provider config',
      };
    }
  });

  /**
   * models:modelUpdate - 更新模型配置
   * @param providerId 提供商 ID
   * @param modelId 模型 ID
   * @param updates 要更新的字段
   * 
   * 操作：
   * 1. 在 models.providers[providerId].models 中找到对应模型
   * 2. 更新模型字段
   * 3. 如果更新了 alias，同步更新 agents.defaults.models
   */
  ipcMain.handle('models:modelUpdate', async (_event, providerId: string, modelId: string, updates: { [key: string]: any }) => {
    try {
      const config = readConfig();
      if (!config) {
        return {
          success: false,
          error: 'Config file not found',
        };
      }

      // 1. 找到提供商配置
      const providerConfig = getNestedProperty(config, `models.providers.${providerId}`);
      if (!providerConfig || !Array.isArray(providerConfig.models)) {
        return {
          success: false,
          error: `Provider ${providerId} not found or has no models`,
        };
      }

      // 2. 找到模型
      const modelIndex = providerConfig.models.findIndex((m: any) => m.id === modelId);
      if (modelIndex === -1) {
        return {
          success: false,
          error: `Model ${modelId} not found in provider ${providerId}`,
        };
      }

      // 3. 提取 alias（如果有）并从 updates 中移除
      const { alias, ...modelUpdates } = updates;

      // 4. 更新模型字段
      providerConfig.models[modelIndex] = {
        ...providerConfig.models[modelIndex],
        ...modelUpdates,
      };

      setNestedProperty(config, `models.providers.${providerId}.models`, providerConfig.models);

      // 5. 如果提供了 alias，更新 agents.defaults.models
      if (alias !== undefined) {
        const fullModelId = `${providerId}/${modelId}`;
        const modelsConfig = getNestedProperty(config, 'agents.defaults.models') || {};
        
        if (alias === '' || alias === null) {
          // 删除别名
          delete modelsConfig[fullModelId];
        } else {
          // 更新或添加别名
          modelsConfig[fullModelId] = { alias };
        }
        
        setNestedProperty(config, 'agents.defaults.models', modelsConfig);
      }

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
        error: err.message || 'Failed to update model',
      };
    }
  });
}
