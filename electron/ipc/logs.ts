import pkg from 'electron';
const { ipcMain } = pkg;
import { spawn } from 'child_process';
import { homedir } from 'os';

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

// IPC 设置函数
export function setupLogsIPC() {
  ipcMain.handle('logs:get', (_, lines) => logsGet(lines));
  ipcMain.handle('logs:search', (_, searchTerm) => logsSearch(searchTerm));
}