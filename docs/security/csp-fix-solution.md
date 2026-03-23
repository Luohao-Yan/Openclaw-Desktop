# Electron CSP 安全警告修复方案

## 问题定位
当前项目存在的CSP不安全点：
1. 完全没有配置Content-Security-Policy，导致Electron抛出安全警告
2. 缺少对资源加载、脚本执行的安全限制，存在XSS攻击风险
3. 未明确禁止`unsafe-eval`，违反Electron官方安全规范

## 修复方案
我们将采用双重CSP配置策略，确保安全的同时不影响现有功能：
1. 在HTML入口文件添加meta标签级别的CSP配置
2. 在Electron主进程添加HTTP头级别的CSP配置（更安全，无法被前端绕过）

### 方案优势
- 符合Electron官方安全规范，彻底解决安全警告
- 保留所有现有功能：动态代码执行（通过可信来源）、IPC通信、资源加载、热重载等
- 双重防护，即使前端配置被篡改，主进程的HTTP头配置仍然生效

---

## 具体修改示例

### 1. 修改 index.html 添加meta标签CSP
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="./app-icon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>OpenClaw Desktop</title>
    <!-- 新增CSP配置 -->
    <meta http-equiv="Content-Security-Policy" content="
      default-src 'self';
      script-src 'self' 'unsafe-inline' http://localhost:* ws://localhost:*;
      style-src 'self' 'unsafe-inline';
      img-src 'self' data: blob: http: https:;
      font-src 'self' data:;
      connect-src 'self' http://localhost:* ws://localhost:* https:;
      media-src 'self' data: blob:;
      worker-src 'self' blob:;
      frame-src 'self';
      object-src 'none';
      base-uri 'self';
      form-action 'self';
    ">
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./src/main.tsx"></script>
  </body>
</html>
```

### 2. 修改 electron/main.ts 添加主进程CSP配置
在`createWindow`函数中，窗口创建后添加以下代码：
```typescript
import { app, BrowserWindow, ipcMain, nativeImage, session } from 'electron'; // 新增导入session

// ... 其他代码 ...

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

    // ========== 新增CSP配置开始 ==========
    // 配置CSP HTTP响应头，比meta标签更安全，无法被前端绕过
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const cspPolicy = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' http://localhost:* ws://localhost:*",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: http: https:",
        "font-src 'self' data:",
        "connect-src 'self' http://localhost:* ws://localhost:* https:",
        "media-src 'self' data: blob:",
        "worker-src 'self' blob:",
        "frame-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'"
      ].join('; ');

      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [cspPolicy]
        }
      });
    });
    // ========== 新增CSP配置结束 ==========

    console.log('BrowserWindow created, loading URL...');

    // ... 剩余代码保持不变 ...
}
```

---

## 配置说明
| 指令 | 配置值 | 说明 |
|------|--------|------|
| `default-src` | `'self'` | 默认所有资源只能从本地加载 |
| `script-src` | `'self' 'unsafe-inline' http://localhost:* ws://localhost:*` | 允许本地脚本、内联脚本（React需要）、开发环境的本地服务和WebSocket热重载 |
| `style-src` | `'self' 'unsafe-inline'` | 允许本地样式和内联样式（CSS-in-JS需要） |
| `img-src` | `'self' data: blob: http: https:` | 允许本地图片、base64图片、blob图片和所有HTTP/HTTPS图片 |
| `connect-src` | `'self' http://localhost:* ws://localhost:* https:` | 允许API请求、开发环境本地请求、WebSocket和所有HTTPS请求 |
| `object-src` | `'none'` | 禁止加载插件（如Flash），符合安全规范 |
| `base-uri` | `'self'` | 限制base标签只能指向本地，防止URL劫持 |

### 关键安全保障
1. **完全禁止`unsafe-eval`**：从根源解决安全警告，符合Electron安全规范
2. **最小权限原则**：只开放必要的资源加载权限
3. **双重防护**：meta标签 + 主进程HTTP头双重配置，防止绕过

---

## 生产环境优化建议
如果需要在生产环境进一步收紧CSP，可以移除开发环境相关的配置：
```typescript
const cspPolicy = isDevelopment ? [
  // 开发环境配置
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' http://localhost:* ws://localhost:*",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: http: https:",
  "font-src 'self' data:",
  "connect-src 'self' http://localhost:* ws://localhost:* https:",
  "media-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ') : [
  // 生产环境配置（更严格）
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'", // 如果能使用nonce/hash可以移除'unsafe-inline'
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "media-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ');
```

---

## 验收标准验证
1. 修复后启动开发环境，Electron控制台不会出现"Insecure Content-Security-Policy"警告
2. 所有现有功能正常：
   - React页面正常加载
   - IPC通信正常
   - 资源（图片、样式、字体）正常加载
   - 开发环境热重载正常
   - 网络请求正常发送
3. 配置符合Electron官方安全规范：
   - 已配置明确的CSP策略
   - 已禁止`unsafe-eval`
   - 已禁用不必要的插件加载
