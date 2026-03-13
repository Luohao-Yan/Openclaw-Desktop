# OpenClaw Desktop

<p align="center">
  <img src="https://github.com/openclaw/openclaw/raw/main/docs/public/logo.png" alt="OpenClaw Logo" width="120">
</p>

<h3 align="center">OpenClaw 桌面客户端</h3>
<p align="center">
  一站式本地 OpenClaw Gateway 管理工具，让你无需记忆命令行即可轻松管理 OpenClaw 服务。
</p>

<p align="center">
  <a href="https://github.com/Luohao-Yan/Openclaw-Desktop/actions">
    <img src="https://img.shields.io/github/actions/workflow/status/Luohao-Yan/Openclaw-Desktop/build.yml?branch=main" alt="Build Status">
  </a>
  <a href="https://github.com/Luohao-Yan/Openclaw-Desktop/releases">
    <img src="https://img.shields.io/github/v/release/Luohao-Yan/Openclaw-Desktop" alt="Latest Release">
  </a>
  <a href="https://github.com/Luohao-Yan/Openclaw-Desktop/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/Luohao-Yan/Openclaw-Desktop" alt="License">
  </a>
  <a href="https://github.com/Luohao-Yan/Openclaw-Desktop/stargazers">
    <img src="https://img.shields.io/github/stars/Luohao-Yan/Openclaw-Desktop" alt="Stars">
  </a>
</p>

---

## ✨ 项目简介 / 核心价值

OpenClaw Desktop 是一款基于 Electron 开发的跨平台桌面应用，专为 OpenClaw 用户打造。它将 OpenClaw Gateway 的核心能力图形化，让你：
- 🚀 无需记忆复杂的 CLI 命令，一键管理 Gateway 生命周期
- 📊 直观查看 Gateway 运行状态、任务进度、日志输出
- ⚙️ 可视化编辑配置文件，避免手动修改配置出错
- 🎯 一站式完成从 Gateway 启动到任务管理的全流程操作

无论你是 OpenClaw 新手用户还是资深开发者，都能通过桌面客户端大幅提升使用效率。

---

## 🎯 功能亮点

### 1. Dashboard 总览页
一键查看 Gateway 运行状态，快速执行启动/停止/重启操作，核心数据一目了然。

![Dashboard](https://raw.githubusercontent.com/Luohao-Yan/Openclaw-Desktop/main/public/assets/dashboard.png)

### 2. Agent 管理
查看和管理所有 Agent 实例，监控 Agent 运行状态和执行情况。

![Agent Overview](https://raw.githubusercontent.com/Luohao-Yan/Openclaw-Desktop/main/public/assets/agent-overview.png)

### 3. Session 会话管理
实时查看所有会话，支持会话查看、管理和结果导出。

![Session](https://raw.githubusercontent.com/Luohao-Yan/Openclaw-Desktop/main/public/assets/session.png)

### 4. 日志中心
聚合展示 Gateway 全量日志，支持按级别筛选、关键词搜索、一键导出，快速定位问题。

![Log Center](https://raw.githubusercontent.com/Luohao-Yan/Openclaw-Desktop/main/public/assets/logger-center.png)

### 5. Skills 技能管理
管理和配置 Agent 技能，扩展 Agent 能力。

![Skills](https://raw.githubusercontent.com/Luohao-Yan/Openclaw-Desktop/main/public/assets/skills.png)

### 6. Instance 实例管理
管理 OpenClaw 实例，监控实例运行状态。

![Instance](https://raw.githubusercontent.com/Luohao-Yan/Openclaw-Desktop/main/public/assets/instance.png)

### 7. Cron 定时任务
配置和管理定时任务，自动化执行重复性工作。

![Cron Center](https://raw.githubusercontent.com/Luohao-Yan/Openclaw-Desktop/main/public/assets/cron-center.png)

---

## 🚀 快速开始 / 安装指南

### 下载安装
你可以直接从 [Release 页面](https://github.com/Luohao-Yan/Openclaw-Desktop/releases) 下载对应系统的安装包：
- **macOS**: 下载 `.dmg` 文件，拖动到应用程序文件夹即可
- **Windows**: 下载 `.exe` 安装包，双击按向导完成安装
- **Linux**: 下载 `.AppImage` 或 `.deb` 文件，直接运行或安装

### 前置依赖
运行本应用需要本地已安装 OpenClaw CLI：
```bash
# 安装 OpenClaw CLI
npm install -g openclaw

# 验证安装
openclaw --version
```

### 首次运行
1. 启动 OpenClaw Desktop 应用
2. 应用会自动检测本地 OpenClaw 安装情况
3. 若检测成功，即可直接使用所有功能
4. 若未检测到 OpenClaw，请根据引导完成 CLI 安装

---

## 📋 核心功能说明

| 功能模块 | 核心能力 |
|---------|---------|
| **Dashboard** | 查看 Gateway 运行状态、系统概览、快速访问各功能模块 |
| **Agents** | 管理所有 Agent 实例，查看 Agent 状态、配置和执行历史 |
| **Sessions** | 查看所有会话记录，支持会话查看、管理和结果导出 |
| **Tasks** | 查看所有任务执行情况，支持任务启停、日志查看 |
| **Logs** | 实时展示 Gateway 运行日志，支持按级别筛选、关键词搜索、一键导出 |
| **Instances** | 管理 OpenClaw 实例，监控实例运行状态和资源占用 |
| **Skills** | 管理和配置 Agent 技能，扩展 Agent 能力 |
| **Cron** | 配置和管理定时任务，自动化执行重复性工作 |
| **Settings** | 自定义应用外观、配置 Gateway、管理用户信息等 |

---

## 🔧 开发指南

如果你想要本地二次开发或贡献代码，可以按照以下步骤操作：

### 环境要求
- Node.js >= 18.x
- npm >= 9.x
- macOS / Windows / Linux 系统

### 本地运行
```bash
# 克隆仓库
git clone https://github.com/Luohao-Yan/Openclaw-Desktop.git
cd openclaw-desktop

# 安装依赖
npm install

# 启动开发模式（热重载）
npm run dev
```

### 构建打包
```bash
# 构建 macOS 版本
npm run build:mac

# 构建 Windows 版本
npm run build:win

# 构建 Linux 版本
npm run build:linux

# 构建全平台版本
npm run build:all
```

### 技术栈
- **框架**: Electron 38 + React 19 + TypeScript 5.9
- **构建工具**: Vite 7
- **UI 框架**: Tailwind CSS 4
- **图标库**: Lucide React + Iconify
- **IPC 通信**: Electron IPC（类型化通道）

---

## 🤝 贡献指南

我们非常欢迎社区贡献！你可以通过以下方式参与：

### 提交 Issue
如果你发现了 Bug 或有功能建议，欢迎 [提交 Issue](https://github.com/Luohao-Yan/Openclaw-Desktop/issues/new)。提交前请先搜索是否已有相关 Issue，避免重复。

### 提交 Pull Request
1. Fork 本仓库
2. 创建你的功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交你的修改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开一个 Pull Request

### 贡献规范
- 代码需要遵循项目的 ESLint 规范，执行 `npm run lint` 检查
- 新增功能需要添加对应的测试用例
- 提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范
- PR 描述需要清晰说明修改内容和原因

---

## 👥 贡献者列表

感谢所有为 OpenClaw Desktop 做出贡献的开发者！

<a href="https://github.com/Luohao-Yan/Openclaw-Desktop/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=Luohao-Yan/Openclaw-Desktop" alt="Contributors">
</a>

本项目衍生自 [openclaw/openclaw](https://github.com/openclaw/openclaw)，感谢原项目的所有贡献者。

---

## 📄 许可证信息

本项目使用 **GNU Affero General Public License v3.0** (AGPL-3.0) 许可证。

### 核心条款说明：
- 你可以自由使用、修改、分发本项目
- 如果你修改了本项目代码并对外分发（包括作为网络服务提供给第三方使用），你需要公开修改后的源码
- 你对修改后的版本也需要使用相同的 AGPL-3.0 许可证

详细条款请参见仓库根目录下的 [LICENSE](LICENSE) 文件。

---

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=Luohao-Yan/Openclaw-Desktop&type=Date)](https://www.star-history.com/?repos=Luohao-Yan%2FOpenclaw-Desktop&type=date&legend=top-left)

---

<p align="center">
  如果你觉得这个项目对你有帮助，欢迎给个 Star ⭐ 支持我们！
</p>
