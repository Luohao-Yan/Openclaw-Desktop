import { app, BrowserWindow, ipcMain, nativeImage } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { setupGatewayIPC } from './ipc/gateway.js';
import { setupConfigIPC } from './ipc/config.js';
import { setupCoreConfigIPC } from './ipc/coreConfig.js';
import { setupNodeConfigIPC } from './ipc/nodeConfig.js';
import { setupTasksIPC } from './ipc/tasks.js';
import { setupLogsIPC } from './ipc/logs.js';
import { setupSettingsIPC } from './ipc/settings.js';
import { setupTailscaleIPC } from './ipc/tailscale.js';
import { setupAgentsIPC } from './ipc/agents.js';
import { setupSystemIPC } from './ipc/system.js';
import { setupSessionsIPC } from './ipc/sessions.js';
import { setupInstancesIPC } from './ipc/instances.js';
import { setupSkillsIPC } from './ipc/skills.js';
import { setupCronIPC } from './ipc/cron.js';
import { setupApprovalsIPC } from './ipc/approvals.js';
import { setupAppConfigIPC } from './ipc/appConfig.js';
import { setupModelsIPC } from './ipc/models.js';
import { setupChannelsIPC } from './ipc/channels.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appName = 'OpenClaw Desktop';

const isDevelopment = process.env.NODE_ENV === 'development';
const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5174';
const iconCandidates = [
  path.join(__dirname, '../../resources/app-icon.svg'),
  path.join(__dirname, '../../resources/icon_128.png'),
  path.join(__dirname, '../../resources/icon_32.png'),
  path.join(__dirname, '../../resources/icon.png'),
  path.join(__dirname, '../../resources/icon_512.ico'),
];
const iconPath = iconCandidates.find((candidate) => fs.existsSync(candidate));

let mainWindow: BrowserWindow | null = null;

app.setName(appName);

function setupAppIcon() {
  if (!iconPath) {
    return;
  }

  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(nativeImage.createFromPath(iconPath));
  }
}

function createWindow() {
  try {
    console.log('Creating BrowserWindow...');
    const projectRoot = path.join(__dirname, '../..');
    const preloadPath = path.join(projectRoot, 'electron/preload.cjs');
    
    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      icon: iconPath,
      titleBarStyle: 'hiddenInset',
      show: true,
      autoHideMenuBar: false,
      title: appName,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: preloadPath,
      },
    });

    console.log('BrowserWindow created, loading URL...');

    // 开发环境优先加载 Vite dev server，避免始终读取旧的 dist 构建产物
    if (isDevelopment) {
      console.log('Loading development server:', devServerUrl);
      mainWindow.loadURL(devServerUrl);
    } else {
      const prodPath = path.join(projectRoot, 'dist/index.html');
      console.log('Loading production file:', prodPath);
      console.log('File exists:', fs.existsSync(prodPath));
      console.log('Using preload file:', preloadPath, fs.existsSync(preloadPath));

      // 使用 file:// 协议加载文件，确保相对路径正确解析
      mainWindow.loadURL(`file://${prodPath}`);
    }
    
    // 监听页面加载事件
    mainWindow.webContents.on('did-finish-load', () => {
      console.log('Page finished loading');
    });
    
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.log('Page failed to load:', errorCode, errorDescription);
    });
    
    // 打开DevTools以便调试
    console.log('Opening DevTools...');
    // mainWindow.webContents.openDevTools(); // 注释掉，避免自动打开开发者工具

    // 确保窗口显示
    console.log('Showing and focusing window...');
    mainWindow.show();
    mainWindow.focus();

    mainWindow.on('closed', () => {
      console.log('Main window closed');
      mainWindow = null;
    });

    mainWindow.on('ready-to-show', () => {
      console.log('Window ready to show');
    });

    // 调试信息
    console.log('OpenClaw Desktop window created successfully');
    return mainWindow;
  } catch (error) {
    console.error('Error creating window:', error);
    return null;
  }
}

// shell 工具 IPC
function setupShellIPC() {
  ipcMain.handle('shell:openPath', async (_event, targetPath: string) => {
    const { shell } = await import('electron');
    const err = await shell.openPath(targetPath);
    return { success: !err, error: err || undefined };
  });
}

// 窗口控制IPC设置
function setupWindowIPC() {
  ipcMain.handle('window:minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });
  
  ipcMain.handle('window:maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });
  
  ipcMain.handle('window:close', () => {
    if (mainWindow) mainWindow.close();
  });
}

// IPC 设置
app.whenReady().then(() => {
  setupAppIcon();
  setupGatewayIPC();
  setupConfigIPC();
  setupCoreConfigIPC();
  setupNodeConfigIPC();
  setupTasksIPC();
  setupLogsIPC();
  setupSettingsIPC();
  setupTailscaleIPC();
  setupAgentsIPC();
  setupSystemIPC();
  setupSessionsIPC();
  setupInstancesIPC();
  setupSkillsIPC();
  setupCronIPC();
  setupApprovalsIPC();
  setupAppConfigIPC();
  setupModelsIPC();
  setupChannelsIPC();
  setupShellIPC();
  setupWindowIPC();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  setupAppIcon();
  if (mainWindow === null) {
    createWindow();
  }
});