import { ipcMain } from 'electron';
import Store from 'electron-store';
import { spawn } from 'child_process';

const store = new Store();

/**
 * 设置应用配置相关的 IPC 处理器
 */
export function setupAppConfigIPC() {
  // 清除应用配置（重置到初始状态）
  ipcMain.handle('app-config:reset', async () => {
    try {
      store.clear();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // 重装 openclaw
  ipcMain.handle('app-config:reinstall-openclaw', async () => {
    try {
      const result = await new Promise<{ success: boolean; output: string; error?: string }>((resolve) => {
        const cmd = process.platform === 'win32'
          ? 'pip install --upgrade --force-reinstall openclaw'
          : 'pip3 install --upgrade --force-reinstall openclaw';
        
        const child = spawn(cmd, { shell: true });
        let output = '';
        let errorOutput = '';

        child.stdout?.on('data', (data) => { output += data.toString(); });
        child.stderr?.on('data', (data) => { errorOutput += data.toString(); });
        
        child.on('close', (code) => {
          if (code === 0) {
            resolve({ success: true, output });
          } else {
            resolve({ success: false, output, error: errorOutput || `退出码 ${code}` });
          }
        });

        child.on('error', (err) => {
          resolve({ success: false, output: '', error: err.message });
        });
      });

      return result;
    } catch (error: any) {
      return { success: false, output: '', error: error.message };
    }
  });
}
