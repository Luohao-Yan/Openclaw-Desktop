# OpenClaw Desktop - Electron Mac 桌面端

## 项目信息
- **project-name**: `openclaw-desktop`
- **代码目录**: `/Users/yanluohao/.openclaw/workspace-shared/projects/openclaw-desktop/`
- **技术栈**: Electron + React + TypeScript
- **平台**: macOS (优先), 后续可扩展 Windows/Linux

---

## 产品定位

一个轻量级的 OpenClaw 桌面管理工具，让用户可以：
1. **可视化配置** - 图形界面管理 OpenClaw 配置
2. **任务监控** - 实时查看所有运行中的任务/子代理
3. **日志查看** - 便捷的日志浏览和搜索

**非目标**: 不替代命令行，不做复杂编排，保持简洁实用。

---

## 核心功能模块

### 1. 首页仪表板 (Dashboard)
- OpenClaw 服务状态指示（运行中/停止）
- 快捷操作：启动/停止/重启 Gateway
- 最近任务列表（最近5个）
- 系统健康概览

### 2. 配置管理 (Config)
- 读取/编辑 `~/.openclaw/config.yaml`
- 关键配置项表单化：
  - Gateway 端口设置
  - 默认模型配置
  - 渠道配置（Telegram/Discord/等）
  - 日志级别
- 配置验证和保存
- 配置备份/恢复

### 3. 任务监控 (Tasks)
- 实时任务列表（来自 `openclaw status`）
- 任务状态：运行中、已完成、失败
- 支持操作：查看详情、终止任务
- 子代理列表管理
- 会话历史浏览

### 4. 日志中心 (Logs)
- 实时日志流（WebSocket 或轮询）
- 日志级别过滤
- 关键词搜索
- 日志导出
- 历史日志文件浏览

### 5. 设置 (Settings)
- 应用主题（浅色/深色/跟随系统）
- 启动时自动启动 OpenClaw
- 通知设置
- 快捷键配置
- 关于/版本信息

---

## 技术架构

```
┌─────────────────────────────────────────┐
│           Electron Main Process         │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐  │
│  │  Tray   │ │  Menu   │ │ IPC API  │  │
│  └─────────┘ └─────────┘ └──────────┘  │
└─────────────────┬───────────────────────┘
                  │ IPC
┌─────────────────▼───────────────────────┐
│         Electron Renderer Process       │
│  ┌─────────────────────────────────┐    │
│  │      React SPA (React Router)    │    │
│  │  ┌────────┬────────┬───────────┐ │    │
│  │  │ Dashboard │ Config │ Tasks  │ │    │
│  │  │   Logs    │ Settings        │ │    │
│  │  └────────┴────────┴───────────┘ │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│         Node.js Child Process           │
│      (OpenClaw CLI Wrapper)             │
│  - openclaw status                      │
│  - openclaw gateway start/stop          │
│  - openclaw logs                        │
│  - 配置文件的读写                        │
└─────────────────────────────────────────┘
```

### 技术选型

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron 28+ |
| UI 框架 | React 18 + TypeScript |
| 样式方案 | Tailwind CSS + shadcn/ui |
| 状态管理 | Zustand |
| 路由 | React Router v6 |
| 图标 | Lucide React |
| 打包 | electron-builder |

---

## 界面设计

### 整体布局

```
┌────────────────────────────────────────┐
│  🐾 OpenClaw Desktop    ─ □ ✕         │  ← 标题栏 (自定义, Mac 风格)
├────────┬───────────────────────────────┤
│        │                               │
│  🏠    │      内容区域                  │
│ 配置   │      (根据导航切换)            │
│ 任务   │                               │
│ 日志   │                               │
│ ─────  │                               │
│ 设置   │                               │
│        │                               │
└────────┴───────────────────────────────┘
       ↑
   侧边导航 (宽 200px, 可折叠)
```

### 配色方案

- **主色**: `#3B82F6` (蓝色) - OpenClaw 品牌色
- **背景**: `#0F172A` (深色模式) / `#FFFFFF` (浅色模式)
- **侧边栏**: `#1E293B` (深色) / `#F8FAFC` (浅色)
- **文字**: `#F1F5F9` (深色主文字) / `#0F172A` (浅色主文字)
- **成功**: `#22C55E`, **警告**: `#F59E0B`, **错误**: `#EF4444`

### 关键界面原型

#### 1. Dashboard 仪表板

```
┌─────────────────────────────────────────────┐
│  仪表板                              [刷新]  │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─────────────┐  ┌─────────────┐          │
│  │  🟢 运行中   │  │   5 任务   │          │
│  │  Gateway   │  │   运行中   │          │
│  │            │  │            │          │
│  │ [停止] [重启]│  │ [查看全部] │          │
│  └─────────────┘  └─────────────┘          │
│                                             │
│  最近任务                                    │
│  ┌─────────────────────────────────────┐   │
│  │ ● 任务名称      状态      时间       │   │
│  │ code-review-1   🟢 运行   2分钟前   │   │
│  │ deploy-prod     ✅ 完成   15分钟前  │   │
│  │ ...                                  │   │
│  └─────────────────────────────────────┘   │
│                                             │
└─────────────────────────────────────────────┘
```

#### 2. 配置管理

```
┌─────────────────────────────────────────────┐
│  配置管理                           [保存]  │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │ Gateway 设置                         │   │
│  │ ─────────────────────────────────── │   │
│  │ 端口:  [3000        ]                │   │
│  │ 主机:  [localhost   ]                │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │ 默认模型                             │   │
│  │ ─────────────────────────────────── │   │
│  │ 模型:  [gpt-4o    ▼]                 │   │
│  │ 思考:  [关闭      ▼]                 │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  [打开配置文件]  [备份]  [恢复默认]          │
│                                             │
└─────────────────────────────────────────────┘
```

#### 3. 任务监控

```
┌─────────────────────────────────────────────┐
│  任务监控                           [刷新]  │
├─────────────────────────────────────────────┤
│                                             │
│  [全部] [运行中] [已完成] [失败]            │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │ 任务ID      类型     状态    操作    │   │
│  │ ─────────────────────────────────── │   │
│  │ sub-abc123  agent    🟢 运行  [详情]│   │
│  │ sess-xyz789 session  ✅ 完成  [日志]│   │
│  │ ...                                 │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  页码: < 1 2 3 ... 10 >                     │
│                                             │
└─────────────────────────────────────────────┘
```

#### 4. 日志查看

```
┌─────────────────────────────────────────────┐
│  日志中心  [INFO ▼] [搜索...    ] [导出]    │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │ [2024-03-06 10:23:45] [INFO] ...    │   │
│  │ [2024-03-06 10:23:46] [DEBUG] ...   │   │
│  │ [2024-03-06 10:23:47] [ERROR] ...   │ ← 自动滚动
│  │ ...                                 │   │
│  │                                     │   │
│  │                                     │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  [⏸ 暂停] [⏹ 停止] [🗑 清空]                │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 文件结构

```
openclaw-desktop/
├── electron/                    # Electron 主进程
│   ├── main.ts                  # 入口
│   ├── preload.ts               # 预加载脚本
│   ├── ipc/                     # IPC 处理器
│   │   ├── config.ts            # 配置相关
│   │   ├── gateway.ts           # Gateway 控制
│   │   ├── tasks.ts             # 任务管理
│   │   └── logs.ts              # 日志获取
│   └── utils/
│       └── openclaw.ts          # OpenClaw CLI 封装
├── src/                         # React 前端
│   ├── components/              # 组件
│   │   ├── ui/                  # shadcn 组件
│   │   ├── Sidebar.tsx          # 侧边导航
│   │   ├── Header.tsx           # 顶部栏
│   │   └── StatusBadge.tsx      # 状态徽章
│   ├── pages/                   # 页面
│   │   ├── Dashboard.tsx
│   │   ├── Config.tsx
│   │   ├── Tasks.tsx
│   │   ├── Logs.tsx
│   │   └── Settings.tsx
│   ├── hooks/                   # 自定义 Hooks
│   │   ├── useOpenClaw.ts
│   │   ├── useGateway.ts
│   │   └── useLogs.ts
│   ├── stores/                  # Zustand 状态
│   │   └── appStore.ts
│   ├── types/                   # TypeScript 类型
│   │   └── index.ts
│   ├── App.tsx
│   └── main.tsx
├── resources/                   # 静态资源
│   ├── icon.png
│   └── icon.icns
├── package.json
├── electron-builder.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.js
```

---

## API 设计 (Electron IPC)

```typescript
// 配置相关
ipcRenderer.invoke('config:get') -> ConfigObject
ipcRenderer.invoke('config:set', config) -> boolean
ipcRenderer.invoke('config:validate', config) -> ValidationResult

// Gateway 控制
ipcRenderer.invoke('gateway:status') -> Status
ipcRenderer.invoke('gateway:start') -> boolean
ipcRenderer.invoke('gateway:stop') -> boolean
ipcRenderer.invoke('gateway:restart') -> boolean

// 任务管理
ipcRenderer.invoke('tasks:list') -> Task[]
ipcRenderer.invoke('tasks:get', id) -> Task
ipcRenderer.invoke('tasks:kill', id) -> boolean

// 日志
ipcRenderer.invoke('logs:get', options) -> LogEntry[]
ipcRenderer.invoke('logs:stream:start') -> void  // 开始推送
ipcRenderer.on('logs:stream:data', callback)     // 接收日志
ipcRenderer.invoke('logs:stream:stop') -> void   // 停止推送
ipcRenderer.invoke('logs:export', path) -> boolean
```

---

## 开发计划

### Phase 1: 基础架构 (2天)
- [ ] Electron + React + TypeScript 项目初始化
- [ ] 构建配置 (electron-builder)
- [ ] 基础 UI 框架 (Tailwind + shadcn)
- [ ] 侧边导航和路由

### Phase 2: 核心功能 (3天)
- [ ] Dashboard 仪表板
- [ ] Gateway 状态控制和显示
- [ ] 配置读取和编辑
- [ ] 配置文件 YAML 解析

### Phase 3: 任务与日志 (2天)
- [ ] 任务列表和状态显示
- [ ] 任务终止功能
- [ ] 日志实时流显示
- [ ] 日志搜索和过滤

### Phase 4:  polish (1天)
- [ ] 主题切换
- [ ] 快捷键支持
- [ ] 自动更新检查
- [ ] DMG 打包

**总计: 8 天**

---

## 后续扩展 (v2)

- 多 OpenClaw 实例管理
- 插件市场浏览
- 技能管理
- 更深度的日志分析
- Windows/Linux 支持

---

## 参考命令

```bash
# 初始化项目
cd /Users/yanluohao/.openclaw/workspace-shared/projects/
electron-vite openclaw-desktop --template react-ts

# 开发
npm run dev

# 打包
npm run build:mac

# 安装依赖参考
npm install electron zustand react-router-dom
npm install -D electron-builder @types/node
npm install tailwindcss postcss autoprefixer
npx shadcn-ui@latest init
```
