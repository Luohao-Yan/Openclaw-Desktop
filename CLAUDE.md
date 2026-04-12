# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概览 / Project Overview

**OpenClaw Desktop** - 基于 Electron 的多智能体 AI 系统桌面管理客户端。为 OpenClaw 多智能体 AI 系统提供可视化管理界面，支持本地安装和远程连接两种模式。

- 版本：0.4.9-preview-1
- 对应 OpenClaw 运行时版本：4.9
- 许可证：AGPL-3.0

## 技术栈 / Tech Stack

| 类别 | 技术 |
|------|------|
| 运行时 | Electron 38 (TypeScript 主进程, CJS preload |
| 前端框架 | React 19 + React Router DOM 7 (HashRouter) |
| 语言 | TypeScript 5.9 |
| 构建工具 | Vite 7 (端口 51741) |
| 样式 | Tailwind CSS 4 + CSS 自定义属性主题 |
| 存储 | electron-store |
| 打包 | electron-builder |
| 测试 | Vitest 4 + fast-check |

## 常用命令 / Commands

```bash
npm run dev                  # 开发模式 - 启动 Vite + Electron 并行
npm run type-check           # TypeScript 类型检查
npm run build                # 生产构建（Vite + tsc + electron-builder
npm run pack:mac:dmg:arm64  # 打包 macOS DMG (Apple Silicon)
npm run pack:mac:dmg:x64    # 打包 macOS DMG (Intel)
npm run pack:win:nsis       # 打包 Windows 安装包
npm run pack:win:nsis:x64     # 打包 Windows x64
npm run pack:win:nsis:arm64 # 打包 Windows ARM64
```

## 项目架构 / Architecture

### 进程分离架构

```
┌─────────────────────────────────────────────────────────┐
│                     React 渲染进程                      │
│              (src/ - React 19 + TypeScript)                │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │   Pages      │  │ Components   │  │  Contexts   │ │
│  │  (路由页)      │  │  (共享组件)   │  │  (状态管理)   │ │
│  └──────────────┘  └──────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────┘
                            │ IPC (contextBridge)
                            ▼
┌─────────────────────────────────────────────────────────┐
│                   Electron 主进程                            │
│              (electron/ - TypeScript)                  │
│  ┌─────────────────────────────────────────────────┐  │
│  │  IPC 模块 (electron/ipc/) - 按领域划分        │  │
│  │  - gateway, config, agents, sessions,        │  │
│  │  - tasks, logs, skills, cron, approvals...    │  │
│  └─────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 关键文件结构

```
electron/
  main.ts                 # 应用入口、窗口创建、IPC 注册
  preload.cjs             # Context Bridge（暴露 window.electronAPI）
  ipc/                    # 按领域划分的 IPC 处理模块
    *.ts                  # 每个文件导出 setup*IPC() 函数

src/
  App.tsx                 # 根组件：Provider 嵌套、路由、Setup/Main 切换
  components/             # 共享 UI 组件
  contexts/             # React Context
  i18n/                # 国际化（I18nContext + translations.ts）
  pages/               # 页面组件（与路由 1:1 对应）
    setup/             # 引导流程页面
    settings/          # 设置子页面
    sessions/        # 会话模块

types/                   # 主进程与渲染进程共享类型
```

### IPC 模块约定

- **新增 IPC 领域**：在 `electron/ipc/` 新建文件，导出 `setup*IPC()`，在 `electron/main.ts` 注册
- **新增渲染进程 API**：扩展 `src/types/electron.ts` 和 `types/electron.ts` 类型，通过 `electron/preload.cjs` 暴露
- **页面与路由**：1:1 对应，路由定义在 `App.tsx
- **主题**：使用 CSS 自定义属性，禁止硬编码颜色
- **国际化**：字符串写入 `src/i18n/translations.ts`，组件中使用 `useI18n()` Hook

### 路由与状态流

1. **初始化流程**：
   - `SetupFlowProvider` 判断是否完成引导
   - 未完成 → `SetupRoutes`（引导流程）
   - 已完成 → `MainAppLayout`（主界面）

2. **主界面布局**：
   - `TitleBar`（macOS 隐藏式标题栏）
   - `Sidebar`（导航菜单）
   - 页面内容区（React Router 懒加载页面）

## 开发约定 / Conventions

- 代码风格遵循项目既有模式，避免重复造轮子。
