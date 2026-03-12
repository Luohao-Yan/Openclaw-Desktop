import pkg from 'electron';
const { ipcMain } = pkg;
import Store from 'electron-store';
import { spawn } from 'child_process';
import os from 'os';
import path from 'path';
import { existsSync, statSync } from 'fs';
import fs from 'fs/promises';

interface AppSettings {
  // General Settings
  autoStart?: boolean;
  startMinimized?: boolean;
  appearance?: 'system' | 'light' | 'dark';
  glassEffect?: boolean;
  language?: string;
  showTrayIcon?: boolean;
  trayIconAction?: 'openWindow' | 'showMenu';
  
  // Existing Settings
  openclawPath?: string;
  openclawRootDir?: string;
  theme?: 'light' | 'dark' | 'system';
  sidebarCollapsed?: boolean;
  sidebarWidth?: number;
}

interface OpenClawRootDiagnostic {
  rootDir: string;
  exists: boolean;
  openclawPath: string;
  hasOpenClawJson: boolean;
  hasNodeJson: boolean;
  entries: string[];
  error?: string;
}

const store = new Store<AppSettings>({
  defaults: {
    // General Settings Defaults
    autoStart: false,
    startMinimized: false,
    appearance: 'system',
    glassEffect: true,
    language: 'system',
    showTrayIcon: true,
    trayIconAction: 'openWindow',
    
    // Existing Settings Defaults
    openclawPath: '',
    openclawRootDir: '',
    theme: 'system',
    sidebarCollapsed: false,
    sidebarWidth: 200,
  },
});

export function getSettings(): AppSettings {
  return store.store;
}

export function updateSettings(updates: Partial<AppSettings>): void {
  store.set(updates);
}

export function getOpenClawPath(): string {
  const customPath = store.get('openclawPath');
  if (customPath && typeof customPath === 'string' && customPath.trim() !== '') {
    return customPath.trim();
  }
  
  return '';
}

export function getOpenClawRootDir(): string {
  const customRootDir = store.get('openclawRootDir');
  if (customRootDir && typeof customRootDir === 'string' && customRootDir.trim() !== '') {
    return customRootDir.trim();
  }

  return path.join(os.homedir(), '.openclaw');
}

export function resolveOpenClawCommand(): string {
  const customPath = getOpenClawPath();
  if (!customPath) {
    return 'openclaw';
  }

  try {
    const stats = statSync(customPath);
    if (stats.isFile()) {
      return customPath;
    }
  } catch {
  }

  return 'openclaw';
}

async function diagnoseOpenClawRoot(): Promise<OpenClawRootDiagnostic> {
  const rootDir = getOpenClawRootDir();
  try {
    await fs.access(rootDir);
    const entries = (await fs.readdir(rootDir)).sort((a, b) => a.localeCompare(b));
    return {
      rootDir,
      exists: true,
      openclawPath: getOpenClawPath(),
      hasOpenClawJson: entries.includes('openclaw.json'),
      hasNodeJson: entries.includes('node.json'),
      entries,
    };
  } catch (error) {
    return {
      rootDir,
      exists: false,
      openclawPath: getOpenClawPath(),
      hasOpenClawJson: false,
      hasNodeJson: false,
      entries: [],
      error: String(error),
    };
  }
}

// 检测 OpenClaw 安装路径
async function detectOpenClawInstallation(): Promise<{ path: string; type: 'executable' | 'directory' | 'not-found' }> {
  const platforms = {
    darwin: '/usr/local/bin/openclaw',  // macOS (Homebrew)
    linux: '/usr/bin/openclaw',         // Linux
    win32: 'C:\\Program Files\\openclaw\\openclaw.exe', // Windows
  };

  // 1. 首先检查用户配置的路径
  const userConfiguredPath = getOpenClawPath();
  if (userConfiguredPath) {
    try {
      await fs.access(userConfiguredPath);
      const stat = await fs.stat(userConfiguredPath);
      return { 
        path: userConfiguredPath, 
        type: stat.isDirectory() ? 'directory' : 'executable' 
      };
    } catch {
      // 配置的路径无效，继续其他检测方式
    }
  }

  // 2. 检查常见安装路径
  const defaultPath = platforms[process.platform as keyof typeof platforms];
  if (defaultPath) {
    try {
      await fs.access(defaultPath);
      return { path: defaultPath, type: 'executable' };
    } catch {
      // 默认路径不存在
    }
  }

  // 3. 检查 PATH 环境变量
  const pathDetection = await new Promise<{ path: string; type: 'executable' | 'directory' }>((resolve) => {
    try {
      const whichProcess = spawn('which', ['openclaw']);
      let output = '';
      
      whichProcess.stdout.on('data', (data) => {
        output += data.toString().trim();
      });
      
      whichProcess.on('close', (code) => {
        if (code === 0 && output) {
          resolve({ path: output, type: 'executable' });
        } else {
          // 抛出错误让 catch 块处理
          throw new Error('not found in PATH');
        }
      });
      
      whichProcess.on('error', () => {
        // 抛出错误让 catch 块处理
        throw new Error('failed to run which command');
      });
    } catch {
      // 如果 which 命令失败或未找到
      resolve({ path: '', type: 'directory' });
    }
  }).catch(() => ({ path: '', type: 'directory' as const }));

  if (pathDetection.path) {
    return pathDetection;
  }

  // 4. 检查默认的 OpenClaw 主目录（~/.openclaw）
  const homeDir = os.homedir();
  const defaultOpenClawDir = getOpenClawRootDir();
  try {
    await fs.access(defaultOpenClawDir);
    // 检查目录中是否有关键文件
    const files = await fs.readdir(defaultOpenClawDir);
    const hasConfig = files.includes('openclaw.json') || files.includes('config.json');
    const hasAgentsDir = files.includes('agents');
    
    console.log(`OpenClaw directory found at: ${defaultOpenClawDir}`);
    console.log(`Files in directory: ${files.join(', ')}`);
    console.log(`Has config: ${hasConfig}, Has agents dir: ${hasAgentsDir}`);
    
    if (hasConfig || hasAgentsDir) {
      return { path: defaultOpenClawDir, type: 'directory' };
    } else {
      console.log('OpenClaw directory exists but does not contain expected files');
    }
  } catch (error) {
    console.log(`OpenClaw directory not found at ${defaultOpenClawDir}: ${error}`);
  }

  // 5. 返回检测失败的结果
  return { 
    path: `Not found. Please install OpenClaw or configure the path manually. 
    
Common locations:
- macOS (Homebrew): /usr/local/bin/openclaw
- Linux: /usr/bin/openclaw or /usr/local/bin/openclaw
- Windows: C:\\Program Files\\openclaw\\openclaw.exe
- Default directory: ${path.join(homeDir, '.openclaw')}
    
Check if OpenClaw is installed by running 'openclaw --version' in your terminal.`,
    type: 'not-found' as const
  };
}

// IPC 设置
export function setupSettingsIPC() {
  ipcMain.handle('settings:get', async () => {
    try {
      const settings = {
        ...getSettings(),
        openclawRootDir: getOpenClawRootDir(),
      };
      return { success: true, settings };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('settings:set', async (_, updates: Partial<AppSettings>) => {
    try {
      updateSettings(updates);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('settings:getOpenClawPath', async () => {
    try {
      const path = getOpenClawPath();
      return { success: true, path };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('settings:getOpenClawRootDir', async () => {
    try {
      const rootDir = getOpenClawRootDir();
      return { success: true, rootDir };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('detect:openclawPath', async () => {
    try {
      const detection = await detectOpenClawInstallation();
      if (detection.type === 'not-found') {
        return { success: false, error: detection.path };
      }
      return { success: true, path: detection.path };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('settings:diagnoseOpenClawRoot', async () => {
    try {
      const diagnostic = await diagnoseOpenClawRoot();
      return { success: true, diagnostic };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
}