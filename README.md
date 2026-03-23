# OpenClaw Desktop

<p align="center">
  <img src="resources/app-icon.svg" width="128" height="128" alt="OpenClaw Desktop Logo">
</p>

<p align="center">
  OpenClaw 多智能体 AI 系统的桌面管理客户端
</p>

<p align="center">
  <a href="https://github.com/Luohao-Yan/Openclaw-Desktop/releases/latest"><strong>⬇️ 下载最新版本</strong></a>
</p>

<p align="center">
  <a href="https://github.com/Luohao-Yan/Openclaw-Desktop/releases/latest"><img src="https://img.shields.io/github/v/release/Luohao-Yan/Openclaw-Desktop?label=%E6%9C%80%E6%96%B0%E7%89%88%E6%9C%AC&color=blue" alt="Latest Release"></a>
  <a href="https://github.com/Luohao-Yan/Openclaw-Desktop/releases"><img src="https://img.shields.io/github/downloads/Luohao-Yan/Openclaw-Desktop/total?label=%E4%B8%8B%E8%BD%BD%E9%87%8F&color=green" alt="Downloads"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Luohao-Yan/Openclaw-Desktop?label=%E8%AE%B8%E5%8F%AF%E8%AF%81" alt="License"></a>
  <a href="https://github.com/Luohao-Yan/Openclaw-Desktop/stargazers"><img src="https://img.shields.io/github/stars/Luohao-Yan/Openclaw-Desktop?style=social" alt="Stars"></a>
</p>

<p align="center">
  <a href="#功能特性">功能特性</a> •
  <a href="#快速开始">快速开始</a> •
  <a href="#开发指南">开发指南</a> •
  <a href="#技术栈">技术栈</a> •
  <a href="#许可证">许可证</a>
</p>

---

> 📦 **立即下载**: [macOS (Apple Silicon)](https://github.com/Luohao-Yan/Openclaw-Desktop/releases/latest) · [macOS (Intel)](https://github.com/Luohao-Yan/Openclaw-Desktop/releases/latest) · [Windows](https://github.com/Luohao-Yan/Openclaw-Desktop/releases/latest)

## 简介

OpenClaw Desktop 是一款基于 Electron 的桌面应用，为 [OpenClaw](https://github.com/nicepkg/openclaw) 多智能体 AI 系统提供可视化管理界面。用户可以通过它监控和管理本地或远程运行的 AI 智能体、会话、任务、日志、实例和技能。

## 功能特性

- 🤖 智能体管理 — 创建、配置、监控 AI 智能体，支持性能分析和增强功能
- 💬 会话管理 — 实时查看和管理智能体会话，支持异步消息发送
- ⏰ Cron 定时任务 — 可视化创建和管理定时任务调度
- 📊 仪表板 — 系统状态总览，一目了然
- 🔧 配置中心 — 图形化编辑 OpenClaw 核心配置
- 🧩 技能管理 — 安装、卸载和管理智能体技能包
- 🌐 远程连接 — 支持通过 Tailscale 连接远程 OpenClaw 实例
- 🎨 主题切换 — 支持亮色/暗色/跟随系统主题
- 🌍 国际化 — 支持中文和英文界面
- 🖥️ 原生体验 — macOS 隐藏式标题栏，无边框窗口设计

## 截图

<!-- TODO: 添加应用截图 -->

## 快速开始

### 安装

从 [Releases](https://github.com/Luohao-Yan/Openclaw-Desktop/releases) 页面下载对应平台的安装包：

- macOS: `.dmg` (支持 Apple Silicon 和 Intel)
- Windows: `.exe` 安装包 或 `.zip` 便携版

### 首次使用

1. 打开应用后进入引导流程
2. 选择「本地安装」或「远程连接」模式
3. 按照引导完成 OpenClaw 运行时配置
4. 配置完成后进入主界面

### 前置条件

- 已安装 [OpenClaw](https://github.com/nicepkg/openclaw) 运行时（本地模式）
- 或可访问的远程 OpenClaw 实例（远程模式）

## 开发指南

### 环境要求

- Node.js 20+
- npm 10+

### 本地开发

```bash
# 安装依赖
npm install

# 启动开发模式（Vite + Electron 并行）
npm run dev

# 类型检查
npm run type-check
```

### 构建打包

```bash
# 生产构建
npm run build

# 打包 macOS DMG (Apple Silicon)
npm run pack:mac:dmg:arm64

# 打包 macOS DMG (Intel)
npm run pack:mac:dmg:x64

# 打包 Windows 安装包
npm run pack:win:nsis
```

### 项目结构

```
electron/               # Electron 主进程
  main.ts               # 应用入口、窗口创建、IPC 注册
  preload.ts / .cjs     # Context Bridge（暴露 window.electronAPI）
  ipc/                  # 按领域划分的 IPC 处理模块
src/                    # React 渲染进程
  components/           # 共享 UI 组件
  contexts/             # React Context（运行时、引导流程、主题）
  pages/                # 页面组件（与路由 1:1 对应）
  i18n/                 # 国际化
  types/                # TypeScript 类型定义
```

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Electron 38 + React 19 + TypeScript 5.9 |
| 构建 | Vite 7 |
| 样式 | Tailwind CSS 4 |
| 路由 | React Router DOM 7 (HashRouter) |
| 存储 | electron-store |
| 打包 | electron-builder |

## 许可证

[AGPL-3.0](LICENSE)

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
