import { app, BrowserWindow } from 'electron';
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
import { setupRuntimeIPC } from './ipc/runtime.js';
import { setupEnvironmentFixerIPC } from './ipc/environmentFixer.js';
import { setupRemoteConnectionIPC } from './ipc/remoteConnection.js';
import { setupAgentExchangeIPC } from './ipc/agentExchange.js';
import { getShellPath } from './ipc/settings.js';
import { asyncSendManager } from './ipc/asyncSendManager.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appName = 'OpenClaw Desktop';

// 运行环境判断
const isDevelopment = process.env.NODE_ENV === 'development';
// 开发服务器地址（端口 51741，与 vite.config.ts 保持一致）
const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:51741';

// preload.cjs 路径（跨平台动态解析，无需文件复制）
// 开发模式：__dirname = dist-electron/electron/，回溯到源码目录
// 生产模式：打包后 preload.cjs 与 main.js 同目录
const preloadPath = isDevelopment
  ? path.join(__dirname, '../../electron/preload.cjs')
  : path.join(__dirname, './preload.cjs');

// 应用图标候选路径
const iconCandidates = [
  path.join(__dirname, '../../resources/app-icon.svg'),
  path.join(__dirname, '../../resources/icon_128.png'),
  path.join(__dirname, '../../resources/icon_32.png'),
  path.join(__dirname, '../../resources/icon.png'),
  path.join(__dirname, '../../resources/icon_512.ico'),
];
const iconPath = iconCandidates.find((c) => fs.existsSync(c));

let mainWindow: BrowserWindow | null = null;
app.setName(appName);

// 设置 macOS Dock 图标
function setupAppIcon() {
  if (process.platform === 'darwin' && app.dock) {
    const dockIconPath = path.join(__dirname, '../../resources/icon_128.png');
    if (fs.existsSync(dockIconPath)) {
      app.dock.setIcon(dockIconPath);
    }
  }
}

// 创建主窗口
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
    },
    icon: iconPath || undefined,
  });

  // 设置 Content-Security-Policy，消除 Electron 安全警告
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          isDevelopment
            ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://localhost:* http://localhost:*; img-src 'self' data: https:;"
            : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;"
        ],
      },
    });
  });

  // 加载页面
  if (isDevelopment) {
    mainWindow.loadURL(devServerUrl).catch(err => {
      console.error('Failed to load development server:', err);
    });
  } else {
    const indexPath = path.join(__dirname, '../../dist/index.html');
    mainWindow.loadFile(indexPath).catch(err => {
      console.error('Failed to load production build:', err);
    });
  }

  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.on('ready-to-show', () => { mainWindow?.show(); mainWindow?.focus(); });
  mainWindow.webContents.on('did-finish-load', () => { console.log('Page finished loading'); });
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.log('Page failed to load:', errorCode, errorDescription);
  });
}

// 初始化应用程序
app.whenReady().then(() => {
  console.log('Electron app ready');
  setupAppIcon();

  // 注册所有 IPC 处理模块
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
  setupRuntimeIPC();
  setupEnvironmentFixerIPC();
  setupRemoteConnectionIPC();
  setupAgentExchangeIPC();
  getShellPath().catch(error => {
    console.error('Failed to get shell path:', error);
  });

  createWindow();
});

// 所有窗口关闭时退出（macOS 除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// macOS 点击 Dock 图标时重新创建窗口
app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// 退出前清理异步发送管理器
app.on('before-quit', () => {
  if (asyncSendManager) {
    asyncSendManager.killAll();
  }
});
