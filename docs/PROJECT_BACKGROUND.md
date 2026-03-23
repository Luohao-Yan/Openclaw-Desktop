# OpenClaw Desktop 项目背景文档

本文档为 OpenClaw Desktop 项目标准化参考资料，供所有团队成员作为任务下发、开发、测试的统一参考。

## 1. 项目总体架构

### 1.1 技术栈
| 层级 | 技术选型 | 版本 | 说明 |
|------|----------|------|------|
| 桌面端框架 | Electron | 38.0.0 | 跨平台桌面应用框架，支持macOS/Windows |
| 前端框架 | React | 19.2.4 | UI开发框架 |
| 前端路由 | React Router | 7.13.1 | 单页应用路由管理 |
| 构建工具 | Vite | 7.3.1 | 前端项目构建与开发服务 |
| 编程语言 | TypeScript | 5.9.3 | 类型安全的JavaScript超集 |
| UI样式 | Tailwind CSS | 4.2.1 | 原子化CSS框架 |
| 打包工具 | Electron Builder | 26.8.1 | 桌面应用打包与分发 |
| 本地存储 | Electron Store | 11.0.2 | Electron本地持久化存储 |
| WebSocket | ws | 8.20.0 | 与OpenClaw Gateway通信 |

### 1.2 分层架构
本项目采用经典的Electron三层架构：
1. **主进程层 (Main Process)**：运行在Node.js环境，负责系统级操作、窗口管理、IPC通信、本地资源访问
2. **预加载层 (Preload)**：为主进程和渲染进程提供安全的通信桥梁，暴露受控API给渲染进程
3. **渲染进程层 (Renderer Process)**：运行React前端应用，负责用户界面展示、交互逻辑处理

### 1.3 核心依赖说明
| 依赖包 | 用途 |
|--------|------|
| react-resizable-panels | 可调整大小的面板组件，用于构建多栏布局 |
| react-markdown + remark-gfm | Markdown内容渲染，支持GFM语法 |
| lucide-react | 图标库，提供统一风格的UI图标 |
| adm-zip | ZIP文件压缩/解压，用于SKILL包安装处理 |
| js-yaml | YAML文件解析，用于配置文件读取 |
| electron-store | 应用配置持久化存储 |
| ws | WebSocket客户端，与OpenClaw Gateway实时通信 |

## 2. 项目目录结构

```
openclaw-desktop/
├── .github/                # GitHub相关配置（CI/CD、Issue模板等）
├── .vscode/                # VSCode编辑器配置
├── build/                  # 构建配置文件
│   └── electron-builder.*.json # 不同平台的Electron打包配置
├── dist/                   # Vite构建输出目录
├── dist-electron/          # Electron主进程编译输出目录
├── docs/                   # 项目文档目录（所有文档统一存放于此）
├── electron/               # Electron主进程代码
│   ├── config/             # 主进程配置文件
│   └── ipc/                # IPC通信接口实现
├── node_modules/           # 第三方依赖包
├── public/                 # 静态资源文件（无需编译的资源）
├── release-artifacts/      # 打包后的安装包输出目录
│   ├── mac-*/              # macOS各架构安装包
│   └── win-*/              # Windows各架构安装包
├── resources/              # 应用资源文件
│   ├── bin/                # 内置二进制工具
│   ├── icns/               # macOS应用图标
│   ├── node/               # 内置Node.js运行时
│   └── win/                # Windows应用图标
├── scripts/                # 项目脚本目录
│   └── *.js/*.sh           # 开发、构建、部署相关脚本
├── src/                    # 前端渲染进程代码
│   ├── components/         # 通用UI组件
│   ├── config/             # 前端配置文件
│   ├── contexts/           # React Context全局状态
│   ├── hooks/              # 自定义React Hooks
│   ├── i18n/               # 国际化多语言资源
│   ├── pages/              # 页面级组件
│   ├── services/           # API服务封装
│   ├── stores/             # 状态管理
│   ├── styles/             # 全局样式文件
│   ├── types/              # TypeScript类型定义
│   └── utils/              # 通用工具函数
├── tests/                  # 测试用例目录
└── types/                  # 全局TypeScript类型定义
```

## 3. 核心模块说明

| 模块名称 | 职责 | 代码位置 |
|----------|------|----------|
| 主进程入口 | 应用启动、窗口创建、生命周期管理 | `electron/main.ts` |
| IPC通信层 | 主进程与渲染进程之间的通信接口实现 | `electron/ipc/` |
| 预加载脚本 | 安全暴露主进程API给渲染进程，上下文隔离 | `electron/preload.cjs` |
| 前端应用入口 | React应用根组件，路由配置 | `src/App.tsx` |
| 组件库 | 通用可复用UI组件（按钮、卡片、表单等） | `src/components/` |
| 页面模块 | 各功能页面实现（首页、SKILL管理、设置等） | `src/pages/` |
| 服务层 | 与后端Gateway、本地存储的API封装 | `src/services/` |
| 工具函数 | 通用工具方法（日期处理、字符串处理、文件操作等） | `src/utils/` |
| 国际化模块 | 多语言支持与切换逻辑 | `src/i18n/` |
| 配置管理 | 应用全局配置读取与更新 | `src/config/`、`electron/config/` |

## 4. 文档索引

所有项目文档统一存放于 `docs/` 目录下，索引如下：

### 4.1 需求与设计文档
| 文档名称 | 路径 | 说明 |
|----------|------|------|
| 产品需求文档 | `docs/PRD-openclaw-desktop*.md` | 产品需求说明，包含功能范围、用户场景 |
| 系统架构文档 | `docs/system-architecture*.md` | 整体系统架构设计说明 |
| 最终架构报告 | `docs/final-architecture-report.md` | 架构评审通过的最终方案 |
| IPC接口文档 | `docs/ipc-interfaces.md` | 主进程与渲染进程IPC接口定义 |
| 数据模型文档 | `docs/data-models*.md` | 核心数据结构定义 |
| 设计系统文档 | `docs/design-system.md` | UI设计规范与组件库说明 |
| 设计文档目录 | `docs/design/` | 详细技术设计文档集合 |

### 4.2 功能与指南文档
| 文档名称 | 路径 | 说明 |
|----------|------|------|
| SKILL安装指南 | `docs/SKILLS_INSTALLATION_GUIDE.md` | 通用SKILL安装操作指南 |
| 自定义SKILL安装指南 | `docs/CUSTOM_SKILL_INSTALLATION_GUIDE.md` | 第三方自定义SKILL安装流程 |
| 用户SKILL安装指南 | `docs/USER_SKILL_INSTALLATION_GUIDE.md` | 面向最终用户的SKILL安装说明 |
| 初始化流程文档 | `docs/setup-flow.md` | 应用首次启动初始化流程 |
| 核心配置说明 | `docs/core-config-gateway-nodehost-agents.md` | Gateway、节点、Agent核心配置说明 |
| Avatar优化实现文档 | `docs/avatar-optimization-implementation.md` | Avatar功能优化实现说明 |

### 4.3 测试与质量文档
| 文档名称 | 路径 | 说明 |
|----------|------|------|
| UI验收标准 | `docs/UI-ACCEPTANCE-STANDARD.md` | UI开发与测试验收规范 |
| QA测试报告 | `docs/QA-REPORT-*.md` | 各功能模块测试报告 |
| 版本控制规范 | `docs/VERSIONING.md` | 版本号命名与发布规则 |
| 代码评审报告 | `docs/REVIEW_REPORT_*.md` | 代码评审记录与结果 |

### 4.4 项目管理文档
| 文档名称 | 路径 | 说明 |
|----------|------|------|
| 进度跟踪文档 | `docs/PROGRESS*.md` | 项目开发进度记录 |
| 任务完成报告 | `docs/TASK_COMPLETION_REPORT_*.md` | 各迭代任务完成情况报告 |
| 功能清单总结 | `docs/功能清单总结.md` | 所有已实现功能汇总 |
| CHANGELOG | `CHANGELOG.md` | 版本变更日志（项目根目录） |

### 4.5 安全文档
| 文档名称 | 路径 | 说明 |
|----------|------|------|
| 安全规范文档 | `docs/security/` | 应用安全相关规范与报告 |

## 5. 快速入门指南

### 5.1 环境搭建
**前置依赖：**
- Node.js >= 20.x
- npm >= 9.x
- macOS / Windows 开发环境

**步骤：**
1. 克隆项目代码到本地
   ```bash
   git clone <repository-url>
   cd openclaw-desktop
   ```
2. 安装依赖
   ```bash
   npm install
   ```

### 5.2 开发运行
启动开发模式（同时启动Vite开发服务、Electron主进程热重载）：
```bash
npm run dev
```
该命令会自动打开Electron应用窗口，并支持热更新，修改代码后自动刷新。

### 5.3 生产构建
**构建所有平台安装包：**
```bash
npm run build
```

**分平台构建：**
```bash
# macOS ARM64 DMG安装包
npm run pack:mac:dmg:arm64

# macOS x64 DMG安装包
npm run pack:mac:dmg:x64

# Windows ARM64安装包
npm run pack:win:nsis

# Windows x64安装包
npm run pack:win:nsis:x64
```
构建完成的安装包会输出到 `release-artifacts/` 目录下对应子目录中。

### 5.4 调试说明
1. **渲染进程调试**：在Electron窗口中按 `Cmd+Opt+I` (macOS) / `Ctrl+Shift+I` (Windows) 打开开发者工具
2. **主进程调试**：使用VSCode的Electron调试配置，在 `electron/main.ts` 中打断点调试
3. **日志查看**：
   - macOS: `~/Library/Logs/OpenClaw Desktop/`
   - Windows: `%APPDATA%\OpenClaw Desktop\logs\`

### 5.5 代码检查与类型校验
```bash
# TypeScript类型检查
npm run type-check

# 运行测试用例
npm run test
```

---
**文档版本：v1.0**
**最后更新：2026-03-24**
**维护者：technical-writer**
