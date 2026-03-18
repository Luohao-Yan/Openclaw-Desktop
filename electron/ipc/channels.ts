/**
 * Channels IPC 处理器
 * 负责渠道相关的 IPC 通信，包括：
 * - 渠道状态查询（openclaw channels status）
 * - 渠道列表查询（openclaw channels list）
 */

import pkg from 'electron';
const { ipcMain } = pkg;
import { spawn } from 'child_process';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { resolveOpenClawCommand, getShellPath } from './settings.js';

/**
 * 构建渠道 CLI 命令的 spawn 配置（纯函数）
 * @param args CLI 参数数组
 * @param resolvedCommand 解析后的 openclaw 可执行文件路径
 * @param shellPath 完整的 shell PATH（包含版本管理器路径）
 * @returns spawn 配置对象 { command, args, env }
 */
export function buildChannelCommandConfig(
  args: string[],
  resolvedCommand: string,
  shellPath: string,
): { command: string; args: string[]; env: Record<string, string | undefined> } {
  return {
    command: resolvedCommand,
    args,
    env: { ...process.env, PATH: shellPath },
  };
}

/**
 * 执行 openclaw CLI 命令
 * 使用 resolveOpenClawCommand() 解析可执行文件路径，
 * 并通过 getShellPath() 注入完整 PATH 环境变量
 * @param args CLI 参数数组
 * @param timeoutMs 超时时间（毫秒），默认 30 秒
 * @returns 执行结果 { success, output?, error? }
 */
async function runOpenClawCommand(
  args: string[],
  timeoutMs = 30000
): Promise<{ success: boolean; output?: string; error?: string }> {
  // 解析 openclaw 可执行文件路径和完整 shell PATH
  const resolvedCommand = resolveOpenClawCommand();
  const shellPath = await getShellPath();
  const config = buildChannelCommandConfig(args, resolvedCommand, shellPath);

  return new Promise((resolve) => {
    try {
      const child = spawn(config.command, config.args, {
        env: config.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let output = '';
      let errorOutput = '';
      let settled = false;

      const finish = (result: { success: boolean; output?: string; error?: string }) => {
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
        finish({ success: false, error: err.message });
      });

      // 超时处理：超时后终止子进程
      setTimeout(() => {
        try {
          child.kill();
        } catch {}
        finish({ success: false, output, error: 'Command timeout' });
      }, timeoutMs);
    } catch (err: any) {
      resolve({ success: false, error: err.message });
    }
  });
}

/** 设置 Channels IPC 处理器 */
export function setupChannelsIPC() {
  /**
   * channels:status - 查询渠道状态
   * 执行 `openclaw channels status`，返回输出文本
   */
  ipcMain.handle('channels:status', async () => {
    try {
      const result = await runOpenClawCommand(['channels', 'status']);

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Failed to execute openclaw channels status',
        };
      }

      return {
        success: true,
        output: result.output,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Unknown error',
      };
    }
  });

  /**
   * channels:list - 查询渠道列表
   * 执行 `openclaw channels list`，返回输出文本
   */
  ipcMain.handle('channels:list', async () => {
    try {
      const result = await runOpenClawCommand(['channels', 'list']);

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Failed to execute openclaw channels list',
        };
      }

      return {
        success: true,
        output: result.output,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Unknown error',
      };
    }
  });

  /**
   * channels:diagnose - 诊断指定渠道的连接状态
   * 执行 `openclaw channels status`，然后从输出中过滤指定渠道的信息
   */
  ipcMain.handle('channels:diagnose', async (_, channelType: string) => {
    try {
      // openclaw channels status 不支持 --channel 过滤，执行全量查询后在输出中匹配
      const result = await runOpenClawCommand([
        'channels',
        'status',
      ]);

      if (!result.success) {
        return {
          success: false,
          error: result.error || `Failed to diagnose channel: ${channelType}`,
        };
      }

      // 从完整输出中提取目标渠道相关行
      const lines = (result.output || '').split('\n');
      const channelLines = lines.filter(
        (line) => line.toLowerCase().includes(channelType.toLowerCase())
      );

      return {
        success: true,
        output: channelLines.length > 0
          ? channelLines.join('\n')
          : result.output,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Unknown error',
      };
    }
  });

  /**
   * channels:pairingList - 查询指定渠道的待审批 DM 配对请求
   * 直接读取 ~/.openclaw/credentials/<channel>-pairing.json 文件
   * 同时扫描 <channel>-<accountId>-pairing.json 获取所有账号的配对请求
   * 返回结构化的待审批请求列表
   */
  ipcMain.handle('channels:pairingList', async (_, channel: string) => {
    try {
      const credDir = join(homedir(), '.openclaw', 'credentials');
      const requests: Array<{
        senderId: string;
        code: string;
        accountId: string;
        createdAt?: string;
        expiresAt?: string;
      }> = [];

      // 读取默认账号的配对文件
      const defaultFile = join(credDir, `${channel}-pairing.json`);
      try {
        const raw = await readFile(defaultFile, 'utf-8');
        const data = JSON.parse(raw);
        if (Array.isArray(data.requests)) {
          for (const req of data.requests) {
            requests.push({
              senderId: req.senderId || req.sender || req.from || '',
              code: req.code || req.pairingCode || '',
              accountId: 'default',
              createdAt: req.createdAt || req.created || '',
              expiresAt: req.expiresAt || req.expires || '',
            });
          }
        }
      } catch {
        // 文件不存在或解析失败，忽略
      }

      // 扫描非默认账号的配对文件（格式：<channel>-<accountId>-pairing.json）
      try {
        const { readdir } = await import('fs/promises');
        const files = await readdir(credDir);
        const pattern = new RegExp(`^${channel}-(.+)-pairing\\.json$`);
        for (const file of files) {
          const match = file.match(pattern);
          if (!match) continue;
          const accountId = match[1];
          try {
            const raw = await readFile(join(credDir, file), 'utf-8');
            const data = JSON.parse(raw);
            if (Array.isArray(data.requests)) {
              for (const req of data.requests) {
                requests.push({
                  senderId: req.senderId || req.sender || req.from || '',
                  code: req.code || req.pairingCode || '',
                  accountId,
                  createdAt: req.createdAt || req.created || '',
                  expiresAt: req.expiresAt || req.expires || '',
                });
              }
            }
          } catch {
            // 单个文件解析失败，跳过
          }
        }
      } catch {
        // 目录读取失败，忽略
      }

      return { success: true, requests };
    } catch (err: any) {
      return { success: false, error: err.message || 'Unknown error', requests: [] };
    }
  });

  /**
   * channels:pairingApprove - 审批指定渠道的 DM 配对请求
   * 执行 `openclaw pairing approve <channel> <code>`，批准配对码
   */
  ipcMain.handle('channels:pairingApprove', async (_, channel: string, code: string) => {
    try {
      const result = await runOpenClawCommand(['pairing', 'approve', channel, code]);
      if (!result.success) {
        return {
          success: false,
          error: result.error || `Failed to approve pairing code ${code}`,
        };
      }
      return { success: true, output: result.output };
    } catch (err: any) {
      return { success: false, error: err.message || 'Unknown error' };
    }
  });

  /**
   * channels:reconnect - 重新连接指定渠道
   * 执行 `openclaw channels login --channel <channelType>`，尝试重新建立连接
   * 注意：openclaw channels reconnect 不存在，使用 login 代替
   */
  ipcMain.handle('channels:reconnect', async (_, channelType: string) => {
    try {
      const result = await runOpenClawCommand([
        'channels',
        'login',
        '--channel',
        channelType,
      ]);

      if (!result.success) {
        return {
          success: false,
          error: result.error || `Failed to reconnect channel: ${channelType}`,
        };
      }

      return {
        success: true,
        output: result.output,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Unknown error',
      };
    }
  });

  /**
   * channels:add - 添加渠道到 OpenClaw 系统
   * 根据渠道类型和字段值构建 CLI 参数，执行 openclaw channels add 命令
   */
  ipcMain.handle('channels:add', async (
    _,
    channelType: string,
    fieldValues: Record<string, string>
  ): Promise<{ success: boolean; output?: string; error?: string }> => {
    try {
      // 构建基础参数
      const args = ['channels', 'add', '--channel', channelType];

      // 遍历字段值，将 camelCase 字段 ID 转换为 --kebab-case CLI flag
      for (const [fieldId, value] of Object.entries(fieldValues)) {
        if (value && value.trim()) {
          const flag = '--' + fieldId.replace(/([A-Z])/g, '-$1').toLowerCase();
          args.push(flag, value.trim());
        }
      }

      const result = await runOpenClawCommand(args);
      return result;
    } catch (err: any) {
      return { success: false, error: err.message || 'Unknown error' };
    }
  });
}
