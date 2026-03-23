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
import { setupRuntimeIPC } from './ipc/runtime.js';
import { setupEnvironmentFixerIPC } from './ipc/environmentFixer.js';
import { setupRemoteConnectionIPC } from './ipc/remoteConnection.js';
import { setupAgentExchangeIPC } from './ipc/agentExchange.js';
import { getShellPath } from './ipc/settings.js';
import { asyncSendManager } from './ipc/asyncSendManager.js';
import { setupScreenshotIPC } from './screenshot-ipc.js';

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
  if (process.platform === 'darwin' && app.dock) {
    // macOS 优先使用完整 icns（含所有尺寸），避免 Sequoia 15.x 因缺少小尺寸回退到最大图导致图标巨大
    const icnsPath = path.join(__dirname, '../../resources/icns/icon_1024.icns');
    const dockIcon = fs.existsSync(icnsPath)
      ? nativeImage.createFromPath(icnsPath)
      : iconPath
        ? nativeImage.createFromPath(iconPath)
        : null;
    if (dockIcon) {
      app.dock.setIcon(dockIcon);
    }
  }
}

function createWindow() {
  try {
    console.log('Creating BrowserWindow...');
    const projectRoot = path.join(__dirname, '../..');
    const preloadPath = path.join(projectRoot, 'electron/preload.cjs');
    
    // macOS 窗口图标优先使用完整 icns
    const windowIcon = process.platform === 'darwin'
      ? path.join(__dirname, '../../resources/icns/icon_1024.icns')
      : iconPath;

    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      icon: windowIcon,
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
  setupRuntimeIPC(); // 注册运行时解析 IPC（三级回退策略）
  setupEnvironmentFixerIPC(); // 注册环境自动修复 IPC（扫描、修复 PATH、安装、升级）
  setupRemoteConnectionIPC(); // 注册远程 OpenClaw 连接 IPC（连接测试、连接保存）
  setupAgentExchangeIPC(); // 注册 Agent 配置加密导入/导出 IPC
  setupShellIPC();
  setupWindowIPC();
  setupScreenshotIPC();

  // 预热 Shell PATH 解析：在窗口加载期间提前完成 login shell spawn，
  // 避免用户打开第一个页面时才触发，导致首次 IPC 调用明显变慢
  getShellPath().catch(() => { /* 预热失败不影响启动 */ });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 应用退出前终止所有异步发送的 CLI 子进程，避免僵尸进程
app.on('before-quit', () => {
  asyncSendManager.killAll();
});

app.on('activate', () => {
  setupAppIcon();
  if (mainWindow === null) {
    createWindow();
  }
});
