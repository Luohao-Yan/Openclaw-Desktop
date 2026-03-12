import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { setupGatewayIPC } from './ipc/gateway.js';
import { setupConfigIPC } from './ipc/config.js';
import { setupTasksIPC } from './ipc/tasks.js';
import { setupLogsIPC } from './ipc/logs.js';
import { setupSettingsIPC } from './ipc/settings.js';
import { setupAgentsIPC } from './ipc/agents.js';
import { setupSystemIPC } from './ipc/system.js';
import { setupSessionsIPC } from './ipc/sessions.js';
import { setupInstancesIPC } from './ipc/instances.js';
import { setupSkillsIPC } from './ipc/skills.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDevelopment = process.env.NODE_ENV === 'development';
const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5174';

let mainWindow: BrowserWindow | null = null;

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
      titleBarStyle: 'hiddenInset',
      show: true,
      autoHideMenuBar: false,
      title: 'OpenClaw Desktop',
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
  setupGatewayIPC();
  setupConfigIPC();
  setupTasksIPC();
  setupLogsIPC();
  setupSettingsIPC();
  setupAgentsIPC();
  setupSystemIPC();
  setupSessionsIPC();
  setupInstancesIPC();
  setupSkillsIPC();
  setupWindowIPC();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});