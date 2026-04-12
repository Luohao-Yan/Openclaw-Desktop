import pkg from 'electron';
const { ipcMain, shell } = pkg;
import { spawn } from 'child_process';
import { homedir } from 'os';
import { getShellPath, resolveOpenClawCommand } from './settings.js';
import { isRemoteMode } from './remoteApiProxy.js';
import { remoteRpc } from './remoteRpcProxy.js';
import { mapLogs } from './remoteResponseMapper.js';

const LOG_PATH = `${homedir()}/.openclaw/logs/gateway.log`;

export async function logsGet(lines: number = 100): Promise<{ success: boolean; logs?: any[]; error?: string }> {
  return new Promise((resolve) => {
    try {
      // 修复命令注入：使用 spawn 代替 execSync
      const tail = spawn('tail', ['-n', String(lines), LOG_PATH]);

      let output = '';
      let errorOutput = '';

      tail.stdout.on('data', (data) => {
        output += data.toString();
      });

      tail.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      tail.on('close', (code) => {
        if (code === 0 || output.trim()) {
          const logs = output.split('\n')
            .filter(line => line.trim() && line !== '')
            .map((line, index) => {
              // 解析日志级别
              let level = 'info';
              if (line.includes('ERROR') || line.includes('error')) level = 'error';
              else if (line.includes('WARN') || line.includes('warning')) level = 'warn';
              else if (line.includes('DEBUG') || line.includes('debug')) level = 'debug';

              return {
                id: `log-${Date.now()}-${index}`,
                raw: line,
                level,
                timestamp: Date.now() - (output.length - index) * 1000 // 模拟时间戳
              };
            });

          resolve({ success: true, logs });
        } else {
          // 日志文件不存在或为空
          resolve({
            success: true,
            logs: [{ id: 'no-logs', raw: '日志文件不存在或为空', level: 'info' }]
          });
        }
      });

      tail.on('error', (error) => {
        resolve({
          success: false,
          error: `Failed to get logs: ${error.message}`,
          logs: [{ id: 'error', raw: `Error: ${error.message}`, level: 'error' }]
        });
      });

      // 设置超时
      setTimeout(() => {
        try {
          tail.kill();
        } catch (e) {
          // ignore
        }
        resolve({
          success: false,
          error: 'Log read timeout',
          logs: [{ id: 'timeout', raw: 'Log read timeout', level: 'error' }]
        });
      }, 5000);

    } catch (error: any) {
      resolve({
        success: false,
        error: `Failed to get logs: ${error.message}`,
        logs: [{ id: 'error', raw: `Error: ${error.message}`, level: 'error' }]
      });
    }
  });
}

export async function logsSearch(searchTerm: string): Promise<{ success: boolean; logs?: any[]; error?: string }> {
  return new Promise((resolve) => {
    try {
      // 修复命令注入：使用 spawn 并传递参数
      const grep = spawn('grep', ['-i', searchTerm, LOG_PATH]);

      let output = '';
      let errorOutput = '';

      grep.stdout.on('data', (data) => {
        output += data.toString();
      });

      grep.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      grep.on('close', (code) => {
        if (output.trim()) {
          const logs = output.split('\n')
            .filter(line => line.trim())
            .map((line, index) => ({
              id: `log-search-${Date.now()}-${index}`,
              raw: line,
              level: line.includes('ERROR') ? 'error' : line.includes('WARN') ? 'warn' : 'info',
              timestamp: Date.now()
            }));

          resolve({ success: true, logs });
        } else {
          resolve({
            success: true,
            logs: [{ id: 'no-match', raw: '未找到匹配项', level: 'info' }]
          });
        }
      });

      grep.on('error', (error) => {
        resolve({ success: false, error: error.message });
      });

      // 设置超时
      setTimeout(() => {
        try {
          grep.kill();
        } catch (e) {
          // ignore
        }
        resolve({
          success: false,
          error: 'Search timeout'
        });
      }, 5000);

    } catch (error: any) {
      resolve({ success: false, error: error.message });
    }
  });
}

export async function openGatewayLog(): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    const error = await shell.openPath(LOG_PATH);
    if (error) {
      return {
        success: false,
        error,
        path: LOG_PATH,
      };
    }

    return {
      success: true,
      path: LOG_PATH,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      path: LOG_PATH,
    };
  }
}

/**
 * 按过滤条件查询日志
 * 通过 spawn 执行 `openclaw logs --filter <filter>`，返回过滤后的日志列表
 * 使用 getShellPath() 确保 Electron 主进程能找到 openclaw 命令
 * @param filter 过滤条件字符串，如 `channel=feishu`
 * @returns 过滤后的日志结果 { success, logs?, error? }
 */
export async function logsFilter(filter: string): Promise<{ success: boolean; logs?: any[]; error?: string }> {
  try {
    // 获取完整 shell PATH，确保 Electron 主进程能找到 openclaw 命令
    const shellPath = await getShellPath();
    return new Promise((resolve) => {
      try {
        const child = spawn(resolveOpenClawCommand(), ['logs', '--filter', filter], {
          env: { ...process.env, PATH: shellPath },
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        let output = '';
        let errorOutput = '';
        let settled = false;

        const finish = (result: { success: boolean; logs?: any[]; error?: string }) => {
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
          if (code === 0 || output.trim()) {
            // 解析日志输出为结构化数组
            const logs = output
              .split('\n')
              .filter((line) => line.trim() && line !== '')
              .map((line, index) => {
                // 解析日志级别
                let level = 'info';
                if (line.includes('ERROR') || line.includes('error')) level = 'error';
                else if (line.includes('WARN') || line.includes('warning')) level = 'warn';
                else if (line.includes('DEBUG') || line.includes('debug')) level = 'debug';

                return {
                  id: `log-filter-${Date.now()}-${index}`,
                  raw: line,
                  level,
                  timestamp: Date.now() - (output.length - index) * 1000,
                };
              });

            finish({ success: true, logs });
          } else {
            finish({
              success: false,
              error: errorOutput.trim() || `Command exited with code ${code}`,
            });
          }
        });

        child.on('error', (err) => {
          finish({ success: false, error: `Failed to filter logs: ${err.message}` });
        });

        // 超时处理：30 秒后终止子进程
        setTimeout(() => {
          try { child.kill(); } catch { /* ignore */ }
          finish({ success: false, error: 'Log filter timeout' });
        }, 30000);
      } catch (error: any) {
        resolve({ success: false, error: `Failed to filter logs: ${error.message}` });
      }
    });
  } catch (error: any) {
    return { success: false, error: `Failed to filter logs: ${error.message}` };
  }
}

// IPC 设置函数
export function setupLogsIPC() {
  ipcMain.handle('logs:get', async (_, lines) => {
    // 远程模式：通过 WebSocket RPC logs.tail 获取日志
    // 官方 WS RPC 方法，非 HTTP REST（/api/v1/logs 不存在）
    if (isRemoteMode()) {
      const result = await remoteRpc<unknown>('logs.tail', { limit: lines || 100 });
      if (!result.success) return { success: false, logs: [], error: result.error };
      return mapLogs(result.data);
    }
    return logsGet(lines);
  });

  ipcMain.handle('logs:search', async (_, searchTerm) => {
    // 远程模式：通过 WebSocket RPC logs.tail 带关键词搜索
    // 官方 WS RPC 方法，非 HTTP REST（/api/v1/logs?search= 不存在）
    if (isRemoteMode()) {
      const result = await remoteRpc<unknown>('logs.tail', { limit: 200, search: searchTerm });
      if (!result.success) return { success: false, logs: [], error: result.error };
      return mapLogs(result.data);
    }
    return logsSearch(searchTerm);
  });

  ipcMain.handle('logs:openGatewayLog', async () => {
    // 远程模式不支持打开本地日志文件
    if (isRemoteMode()) {
      return { success: false, error: '远程模式不支持打开本地日志文件' };
    }
    return openGatewayLog();
  });

  // 按过滤条件查询日志（用于渠道故障排查）
  ipcMain.handle('logs:filter', async (_, filter) => {
    // 远程模式：通过 WebSocket RPC logs.tail 带 filter 参数
    // 官方 WS RPC 方法，非 HTTP REST（/api/v1/logs?filter= 不存在）
    if (isRemoteMode()) {
      const result = await remoteRpc<unknown>('logs.tail', { limit: 200, filter });
      if (!result.success) return { success: false, logs: [], error: result.error };
      return mapLogs(result.data);
    }
    return logsFilter(filter);
  });
}
