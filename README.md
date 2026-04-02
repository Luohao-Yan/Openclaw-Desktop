<div align="center">

<img src="resources/app-icon.svg" width="128" height="128" alt="OpenClaw Desktop - AI Agent Management Dashboard">

# OpenClaw Desktop

**A desktop management client for the OpenClaw multi-agent AI system**

OpenClaw 多智能体 AI 系统的桌面管理客户端 — 可视化管理 AI 智能体、会话、定时任务、技能和日志

[![Latest Release](https://img.shields.io/github/v/release/Luohao-Yan/Openclaw-Desktop?include_prereleases&label=latest&color=blue)](https://github.com/Luohao-Yan/Openclaw-Desktop/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/Luohao-Yan/Openclaw-Desktop/total?label=downloads&color=green)](https://github.com/Luohao-Yan/Openclaw-Desktop/releases)
[![License](https://img.shields.io/github/license/Luohao-Yan/Openclaw-Desktop)](LICENSE)
[![Stars](https://img.shields.io/github/stars/Luohao-Yan/Openclaw-Desktop?style=social)](https://github.com/Luohao-Yan/Openclaw-Desktop/stargazers)

[Download](#安装) · [Features](#功能特性) · [Development](#开发指南) · [Structure](#项目结构) · [Changelog](CHANGELOG.md)

**Keywords:** `AI agent` `multi-agent` `desktop app` `electron` `chatbot management` `LLM` `openclaw` `feishu bot` `telegram bot` `cron scheduler` `agent orchestration`

</div>

---

## 🌟 愿景 / Vision

> **让每一个用户都能以最简单的方式，享受 AI 科技带来的福利。**
> 
> **Make AI accessible to everyone through the simplest possible experience.**

我们相信 AI 不应该只属于技术专家。OpenClaw Desktop 致力于将复杂的多智能体 AI 系统包装成人人可用的桌面工具，降低使用门槛，让普通用户也能轻松部署和管理自己的 AI 智能体。

## 简介 / About

OpenClaw Desktop is an Electron-based desktop application that provides a visual management dashboard for the [OpenClaw](https://github.com/nicepkg/openclaw) multi-agent AI system. Monitor and manage AI agents, chat sessions, scheduled tasks, logs, instances, and skills — locally or remotely.

OpenClaw Desktop 是一款基于 Electron 的桌面应用，为 [OpenClaw](https://github.com/nicepkg/openclaw) 多智能体 AI 系统提供可视化管理界面。支持本地安装和远程连接两种模式，内置零基础引导流程。

### 零基础入门

即使你从未接触过 OpenClaw，也不用担心。应用内置了完整的零基础安装引导，从环境检测、运行时安装、渠道配置到智能体创建，全程图形化向导，一步步带你完成所有配置。

<table>
  <tr>
    <td align="center"><img src="public/setup/setup-01.png" width="280" alt="引导步骤 1"><br><sub>欢迎页</sub></td>
    <td align="center"><img src="public/setup/setup-02.png" width="280" alt="引导步骤 2"><br><sub>模式选择</sub></td>
    <td align="center"><img src="public/setup/setup-03.png" width="280" alt="引导步骤 3"><br><sub>环境检测</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="public/setup/setup-04.png" width="280" alt="引导步骤 4"><br><sub>运行时安装</sub></td>
    <td align="center"><img src="public/setup/setup-05.png" width="280" alt="引导步骤 5"><br><sub>渠道配置</sub></td>
    <td align="center"><img src="public/setup/setup-06.png" width="280" alt="引导步骤 6"><br><sub>智能体创建</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="public/setup/setup-07.png" width="280" alt="引导步骤 7"><br><sub>配置验证</sub></td>
    <td align="center"><img src="public/setup/setup-08.png" width="280" alt="引导步骤 8"><br><sub>完成就绪</sub></td>
    <td></td>
  </tr>
</table>

## 截图

<table>
  <tr>
    <td align="center"><img src="public/assets/dashboard.png" width="400" alt="仪表板"><br><sub>仪表板</sub></td>
    <td align="center"><img src="public/assets/agent-overview.png" width="400" alt="智能体总览"><br><sub>智能体管理</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="public/assets/agent-overview-01.png" width="400" alt="智能体详情"><br><sub>智能体详情</sub></td>
    <td align="center"><img src="public/assets/agent-01.png" width="400" alt="智能体工作区"><br><sub>智能体工作区</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="public/assets/session.png" width="400" alt="会话聊天"><br><sub>会话聊天</sub></td>
    <td align="center"><img src="public/assets/skills.png" width="400" alt="技能管理"><br><sub>技能管理</sub></td>
  </tr>
    <td align="center"><img src="public/assets/cron-center.png" width="400" alt="定时任务"><br><sub>Cron 定时任务</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="public/assets/logger-center.png" width="400" alt="日志中心"><br><sub>日志中心</sub></td>
    <td align="center"><img src="public/assets/instance.png" width="400" alt="实例管理"><br><sub>实例管理</sub></td>
  </tr>
</table>

## 功能特性 / Features


| 模块 | Module | 说明 |
|------|--------|------|
| 🤖 智能体管理 | Agent Management | 创建、配置、监控 AI 智能体，支持性能分析、配置加密导入/导出、克隆 |
| 💬 会话管理 | Session Management | 实时查看和管理智能体会话，支持异步消息发送和对话记录回放 |
| ⏰ 定时任务 | Scheduled Tasks | 可视化创建和管理定时任务调度（Cron / Interval / One-time） |
| 📊 仪表板 | Dashboard | 系统状态总览，健康检查、CPU/内存/运行时长监控 |
| 🔧 配置中心 | Config Center | 图形化编辑 OpenClaw 核心配置，渠道路由、广播群组、配对管理 |
| 🧩 技能管理 | Skills Management | 安装、卸载和管理智能体技能包，支持 ClawHub 市场搜索 |
| 🌐 远程连接 | Remote Connection | 支持通过 SSH / Tailscale 连接远程 OpenClaw 实例 |
| 🎨 主题切换 | Theme | 亮色 / 暗色 / 跟随系统 |
| 🌍 国际化 | i18n | 中文和英文界面完整覆盖 |
| 🖥️ 原生体验 | Native UX | macOS 隐藏式标题栏、无边框窗口 |

## 安装

从 [Releases](https://github.com/Luohao-Yan/Openclaw-Desktop/releases/latest) 页面下载对应平台的安装包：

| 平台 | 架构 | 格式 |
|------|------|------|
| macOS | Apple Silicon (arm64) | `.dmg` |
| macOS | Intel (x64) | `.dmg` |
| Windows | x64 | `.exe` 安装包 / `.zip` 便携版 |

### 前置条件

- 本地模式：已安装 [OpenClaw](https://github.com/nicepkg/openclaw) 运行时
- 远程模式：可访问的远程 OpenClaw 实例

### 首次使用

1. 打开应用，进入引导流程
2. 选择「本地安装」或「远程连接」模式
3. 按照引导完成运行时配置、渠道添加、智能体创建
4. 配置完成后进入主界面

## 技术栈

| 类别 | 技术 |
|------|------|
| 运行时 | Electron 38 (TypeScript 主进程, CJS preload) |
| 前端框架 | React 19 + React Router DOM 7 (HashRouter) |
| 语言 | TypeScript 5.9 |
| 构建工具 | Vite 7 |
| 样式 | Tailwind CSS 4 + CSS 自定义属性主题 |
| 存储 | electron-store |
| 打包 | electron-builder |
| 图标 | lucide-react + @iconify/react |
| Markdown | react-markdown + remark-gfm |
| 测试 | Vitest 4 + fast-check (属性测试) |

## 开发指南

### 环境要求

- Node.js >= 20
- npm >= 10

### 本地开发

```bash
# 克隆仓库
git clone https://github.com/Luohao-Yan/Openclaw-Desktop.git
cd Openclaw-Desktop

# 安装依赖
npm install

# 启动开发模式（Vite + Electron 并行）
npm run dev
```

### 常用命令

```bash
npm run dev                  # 开发模式
npm run type-check           # 类型检查
npm run build                # 生产构建（Vite + tsc + electron-builder）
npm run pack:mac:dmg:arm64   # 打包 macOS DMG (Apple Silicon)
npm run pack:mac:dmg:x64     # 打包 macOS DMG (Intel)
npm run pack:win:nsis        # 打包 Windows 安装包（当前架构）
npm run pack:win:nsis:x64    # 打包 Windows 安装包 (x64)
npm run pack:win:nsis:arm64  # 打包 Windows 安装包 (ARM64)
```

### 构建产物

| 目录 | 说明 |
|------|------|
| `dist/` | Vite 渲染进程构建输出 |
| `dist-electron/` | tsc 主进程编译输出 |
| `release-artifacts/` | electron-builder 打包产物 |

## 项目结构

```
electron/                  # Electron 主进程
  main.ts                  # 应用入口、窗口创建、IPC 注册
  preload.ts / .cjs        # Context Bridge（暴露 window.electronAPI）
  ipc/                     # 按领域划分的 IPC 处理模块
  config/                  # 运行时清单配置

src/                       # React 渲染进程
  App.tsx                  # 根组件：Provider 嵌套、路由、Setup/Main 切换
  components/              # 共享 UI 组件（Sidebar, TitleBar, GlassCard 等）
  contexts/                # React Context（DesktopRuntime, SetupFlow, Theme）
  i18n/                    # 国际化（I18nContext + translations.ts）
  help-docs/               # 帮助文档（USER_GUIDE.md, FEATURE_LIST.md）
  pages/                   # 页面组件（与路由 1:1 对应）
    setup/                 # 引导流程页面
    settings/              # 设置子页面
    sessions/              # 会话模块（列表、聊天面板、统计卡片）
  services/                # 非 IPC 业务逻辑
  types/                   # TypeScript 类型定义

types/                     # 主进程与渲染进程共享类型
resources/                 # 应用图标（png, svg, ico, icns）
```

### 开发约定

- 页面与路由 1:1 对应，路由定义在 `App.tsx`
- 新增 IPC 领域：在 `electron/ipc/` 新建文件，导出 `setup*IPC()`，在 `electron/main.ts` 注册
- 新增渲染进程 API：扩展 `src/types/electron.ts` 和 `types/electron.ts` 类型，通过 `electron/preload.ts` 暴露
- 主题值使用 CSS 自定义属性，禁止硬编码颜色
- 国际化字符串写入 `src/i18n/translations.ts`，组件中使用 `useI18n()` Hook

## 版本说明

- `0.3.24.x` 系列对应 OpenClaw 3.24 运行时
- `0.3.13.x` 系列对应 OpenClaw 3.13 运行时
- `0.3.8.x` 系列对应 OpenClaw 3.8 运行时
- `preview` 标识表示预览版本
- 版本格式：`0.主版本.次版本-preview-预览号`

详细更新记录请查看 [CHANGELOG.md](CHANGELOG.md)。

## 贡献

欢迎提交 Issue 和 Pull Request。

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/your-feature`)
3. 提交更改 (`git commit -m 'feat: add some feature'`)
4. 推送到分支 (`git push origin feature/your-feature`)
5. 创建 Pull Request

## 贡献者

<a href="https://github.com/Luohao-Yan/Openclaw-Desktop/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=Luohao-Yan/Openclaw-Desktop" alt="Contributors" />
</a>

## 许可证

本项目基于 [AGPL-3.0](LICENSE) 许可证开源。

## 特别鸣谢

本项目基于 [OpenClaw](https://github.com/nicepkg/openclaw) 开源项目构建。感谢 OpenClaw 团队打造了如此出色的多智能体 AI 系统，让我们能够在此基础上为用户提供更友好的桌面管理体验。

- [OpenClaw](https://github.com/nicepkg/openclaw) — 多智能体 AI 系统核心框架
- [nicepkg](https://github.com/nicepkg) — OpenClaw 开源组织

## 相关项目

- [OpenClaw](https://github.com/nicepkg/openclaw) — 多智能体 AI 系统核心

## Star History

<p align="center">
  <a href="https://star-history.com/#Luohao-Yan/Openclaw-Desktop&Date">
    <img src="https://api.star-history.com/svg?repos=Luohao-Yan/Openclaw-Desktop&type=Date" alt="Star History Chart" width="600">
  </a>
</p>

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/Luohao-Yan">Luohao Yan</a>
</p>
