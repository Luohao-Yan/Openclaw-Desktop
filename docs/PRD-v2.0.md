# OpenClaw Desktop PRD v2.0 - 紧急修订版

**修订日期**: 2026-03-07  
**修订人**: CTO Development Director  
**状态**: 紧急修订 - 明日上线  

---

## 1. 问题汇总（来自用户反馈）

| 问题 | 优先级 | 状态 |
|------|--------|------|
| 无法连接本地 OpenClaw 实例 | 🔴 P0 | 待修复 |
| 使用 emoji 而非 icon 图标 | 🔴 P0 | 待修复 |
| 默认路径无法更改 | 🟡 P1 | 待实现 |
| 缺少明暗主题切换 | 🟡 P1 | 待实现 |
| 侧边栏无法折叠/缩放 | 🟡 P1 | 待实现 |

---

## 2. 修订需求详情

### 2.1 🔴 P0 - 功能修复

#### 2.1.1 Gateway 连接修复
**问题**: 应用无法检测到本地运行的 OpenClaw  
**原因分析**: 
- IPC 模块可能使用错误的路径检测逻辑
- 需要检查 `~/.openclaw/` 目录下的实际进程

**修复方案**:
```typescript
// 修复 gateway.ts IPC 模块
// 1. 检测 ~/.openclaw/gateway.pid 文件
// 2. 检查进程是否存在
// 3. 提供手动设置路径功能
```

**验收标准**:
- [ ] 能正确检测本地运行的 OpenClaw
- [ ] 显示正确的 Gateway 状态（running/stopped）
- [ ] 启动/停止按钮功能正常

#### 2.1.2 替换所有 Emoji 为 Icon
**开发准则**: 禁止使用 emoji，必须使用专业图标库

**替换清单**:
| 原 Emoji | 替换为 | 图标库 |
|----------|--------|--------|
| ▶️ | Play | Lucide React |
| ⏹️ | Square | Lucide React |
| 🔄 | RotateCw | Lucide React |
| ⚙️ | Settings | Lucide React |
| 📋 | ClipboardList | Lucide React |
| 📝 | FileText | Lucide React |
| 🔍 | Search | Lucide React |
| ✅ | Check | Lucide React |
| ❌ | X | Lucide React |
| ⚠️ | AlertTriangle | Lucide React |

**安装命令**:
```bash
npm install lucide-react
```

### 2.2 🟡 P1 - 功能增强

#### 2.2.1 可配置 OpenClaw 路径
**需求**: 允许用户设置/更改 OpenClaw 安装路径

**UI 设计**:
- Settings 页面新增 "OpenClaw 路径配置" 区域
- 显示当前检测到的路径
- 提供 "浏览" 按钮选择新路径
- 提供 "重置为默认" 按钮

**默认路径检测顺序**:
1. `~/.openclaw/` (用户目录)
2. `/usr/local/bin/openclaw` (系统安装)
3. `/opt/openclaw/` (Linux)
4. 用户手动指定路径

#### 2.2.2 明暗主题切换
**需求**: 支持浅色/深色/跟随系统三种模式

**实现方案**:
```typescript
// ThemeContext.tsx
type Theme = 'light' | 'dark' | 'system';

// 使用 CSS 变量或 Tailwind dark mode
// tailwind.config.js:
module.exports = {
  darkMode: 'class',
  // ...
}
```

**UI 位置**: Settings 页面 → 外观 → 主题选择

**配色方案**:
- 深色: bg-slate-900, text-slate-100
- 浅色: bg-white, text-slate-900

#### 2.2.3 可折叠/缩放侧边栏
**需求**: 
- 支持展开/折叠侧边栏
- 支持拖拽调整宽度
- 折叠后显示图标 + Tooltip

**实现方案**:
```typescript
// 使用 resizable panel 库
npm install react-resizable-panels
```

**交互设计**:
- 侧边栏宽度范围: 60px (折叠) ~ 300px (展开)
- 默认宽度: 200px
- 折叠按钮位于侧边栏底部
- 拖拽区域在侧边栏右边缘

---

## 3. 任务分配

### 3.1 🔴 P0 任务（今日必须完成）

| 任务 | 负责人 | 截止时间 | 验收标准 |
|------|--------|----------|----------|
| 修复 Gateway IPC 连接 | fullstack-dev | 14:00 | 能正确检测 OpenClaw 状态 |
| 替换所有 Emoji 为 Lucide Icons | fullstack-dev | 15:00 | 无 emoji，全部使用图标 |
| 添加路径配置功能 | fullstack-dev | 16:00 | 可在 Settings 配置路径 |

### 3.2 🟡 P1 任务（今日尽力完成）

| 任务 | 负责人 | 截止时间 | 验收标准 |
|------|--------|----------|----------|
| 实现主题切换 | fullstack-dev | 18:00 | 支持 light/dark/system |
| 实现可折叠侧边栏 | fullstack-dev | 20:00 | 可折叠、可拖拽调整宽度 |

### 3.3 设计支持

| 任务 | 负责人 | 截止时间 |
|------|--------|----------|
| Settings 页面设计 | ux-designer | 12:30 |
| 图标替换规范 | ux-designer | 12:30 |
| 主题配色方案 | ux-designer | 12:30 |

---

## 4. 技术实现要点

### 4.1 Gateway 连接修复

```typescript
// electron/ipc/gateway.ts
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

// 获取默认 OpenClaw 路径
function getDefaultOpenClawPath(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.openclaw');
}

// 检查 Gateway 状态
async function checkGatewayStatus(): Promise<GatewayStatus> {
  const openclawPath = getDefaultOpenClawPath();
  const pidFile = path.join(openclawPath, 'gateway.pid');
  
  try {
    const pid = await readFile(pidFile, 'utf-8');
    // 检查进程是否存在
    await execAsync(`ps -p ${pid.trim()}`);
    return { status: 'running', pid: pid.trim() };
  } catch {
    return { status: 'stopped' };
  }
}
```

### 4.2 图标替换示例

```typescript
// 修复前
<button>▶️ Start</button>

// 修复后
import { Play } from 'lucide-react';
<button><Play size={16} /> Start</button>
```

### 4.3 主题切换实现

```typescript
// src/contexts/ThemeContext.tsx
import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (theme: Theme) => void;
}>({ theme: 'system', setTheme: () => {} });

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState<Theme>('system');
  
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);
  
  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
```

---

## 5. 验收标准

### 5.1 P0 验收
- [ ] 打开应用能正确显示 Gateway 状态
- [ ] 能正常启动/停止 Gateway
- [ ] 所有 emoji 已替换为图标
- [ ] 代码中无 emoji 字符

### 5.2 P1 验收
- [ ] 可在 Settings 配置 OpenClaw 路径
- [ ] 支持浅色/深色/跟随系统主题
- [ ] 侧边栏可折叠、可拖拽调整宽度

---

## 6. 风险提示

1. **Gateway 进程检测**: 不同系统（macOS/Linux）进程检测命令可能不同，需要测试
2. **路径配置持久化**: 需要使用 electron-store 保存用户配置
3. **主题切换闪烁**: 可能出现白色闪屏，需要添加过渡动画

---

*紧急修订版 - 明日上线*
