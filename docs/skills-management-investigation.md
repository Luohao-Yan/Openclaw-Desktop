# OpenClaw 技能管理调研报告

## 一、当前代码实现分析

### 1.1 整体架构

当前技能管理采用标准的 Electron IPC 三层架构：

```
Skills.tsx (UI 层)
    ↓ window.electronAPI.skills*
preload.cjs (桥接层)
    ↓ ipcRenderer.invoke('skills:*')
electron/ipc/skills.ts (IPC 处理层)
    ↓ openclaw CLI / 本地磁盘读取
OpenClaw Runtime
```

### 1.2 IPC 层 (`electron/ipc/skills.ts`)

**数据源**：
- `openclaw skills list --json` — 获取完整技能列表
- `openclaw skills list --eligible --json` — 获取可用（eligible）技能
- 本地磁盘 `~/.openclaw/skills/` — 读取已安装技能的 SKILL.md 元数据

**已实现的 IPC Handler**：

| Handler | 命令 | 说明 |
|---------|------|------|
| `skills:getAll` | `skills list --json` + `skills list --eligible --json` | 合并两个来源，去重 |
| `skills:install` | `clawhub install <id>` | 安装技能 |
| `skills:uninstall` | `clawhub uninstall <id>` | 卸载技能 |
| `skills:update` | `clawhub update <id>` | 更新技能 |
| `skills:enable` | `skills enable <id>` | 启用技能 |
| `skills:disable` | `skills disable <id>` | 禁用技能 |
| `skills:stats` | 内存计算 | 统计信息 |
| `skills:search` | 内存过滤 | 搜索技能 |

**辅助函数**：
- `readInstalledSkillsFromDisk()` — 从多个可能路径读取本地已安装技能，解析 SKILL.md 的 YAML frontmatter
- `fetchSkillsFromCLI()` — 调用 CLI 获取技能列表，回退到磁盘读取
- `fetchEligibleSkillsFromCLI()` — 获取 eligible 技能列表
- `inferSkillCategory()` — 根据名称和描述推断分类（feishu/development/productivity/ai/security 等）

**存在的问题**：
1. `fetchSkillsFromCLI()` 内部每次 map 都调用 `readInstalledSkillsFromDisk()`，性能差
2. 安装/卸载使用 `clawhub` 命令，但启用/禁用使用 `skills` 子命令，命令体系不一致
3. 没有自定义技能的创建和编辑功能
4. 没有技能详情查看（`openclaw skills info <name>`）
5. 没有技能检查功能（`openclaw skills check`）
6. 搜索仅在内存中过滤，没有利用 `clawhub search` 的向量搜索能力

### 1.3 UI 层 (`src/pages/Skills.tsx`)

**已实现功能**：
- 技能卡片网格展示（名称、描述、版本、作者、分类、状态）
- 搜索（按名称/描述/作者/分类）
- 分类过滤
- 排序（按名称/更新时间/评分/下载数）
- 统计卡片（总数/已安装/可更新/已启用）
- 操作按钮：安装、卸载、更新、启用/禁用、打开目录

**缺失功能**：
- 没有自定义技能创建入口
- 没有技能编辑器（编辑 SKILL.md）
- 没有技能详情面板（查看完整说明、依赖、配置）
- "上传技能"按钮只是 `alert('上传技能功能即将推出')`
- 没有 ClawHub 市场浏览/搜索集成
- 没有技能配置管理（apiKey、env 等）

### 1.4 类型定义

`SkillInfo` 接口定义在 `electron/ipc/skills.ts`、`src/pages/Skills.tsx`、`src/types/electron.ts`、`types/electron.ts` 四处，存在重复定义。

---

## 二、OpenClaw 官方技能系统调研

### 2.1 技能系统概述

OpenClaw 的技能（Skills）是基于 **AgentSkills 规范**的扩展机制。每个技能是一个包含 `SKILL.md` 文件的目录，通过 YAML frontmatter + Markdown 指令来教 AI agent 如何执行特定任务。

### 2.2 技能存储位置与优先级

技能从三个位置加载，优先级从高到低：

| 位置 | 路径 | 说明 |
|------|------|------|
| Workspace 技能 | `<workspace>/skills/` | 最高优先级，当前工作区 |
| 本地/托管技能 | `~/.openclaw/skills/` | 用户级别，所有 agent 共享 |
| 内置技能 | 随 OpenClaw 安装包附带 | 最低优先级 |

额外目录可通过 `skills.load.extraDirs` 配置。

### 2.3 SKILL.md 格式规范

```markdown
---
name: my-skill-name
description: 一句话描述技能功能
metadata:
  {
    "openclaw": {
      "emoji": "🔧",
      "homepage": "https://example.com",
      "requires": {
        "bins": ["python3"],
        "env": ["API_KEY"],
        "config": ["browser.enabled"]
      },
      "primaryEnv": "API_KEY",
      "install": [
        {
          "id": "brew",
          "kind": "brew",
          "formula": "my-tool",
          "bins": ["my-tool"],
          "label": "Install via Homebrew"
        }
      ]
    }
  }
---

## Instructions

当用户要求 [触发条件] 时，执行以下步骤：

1. [第一步]
2. [第二步]
3. 向用户确认完成。

## Rules

- 执行前必须确认操作
- 缺少必要输入时主动询问
```

**可选 frontmatter 字段**：
- `homepage` — 技能主页 URL
- `user-invocable` — 是否作为用户斜杠命令（默认 true）
- `disable-model-invocation` — 是否从模型提示中排除（默认 false）
- `command-dispatch` — 设为 `tool` 时斜杠命令直接调用工具
- `command-tool` — 直接调用的工具名
- `command-arg-mode` — 参数模式（默认 raw）

**metadata.openclaw 字段**：
- `always: true` — 始终包含该技能
- `emoji` — 技能图标
- `os` — 平台限制（darwin/linux/win32）
- `requires.bins` — 必须存在于 PATH 的二进制
- `requires.anyBins` — 至少一个存在于 PATH
- `requires.env` — 必须存在的环境变量
- `requires.config` — 必须为 truthy 的配置路径
- `primaryEnv` — 关联的主要环境变量
- `install` — 安装器规格数组

### 2.4 技能配置 (`~/.openclaw/openclaw.json`)

```json
{
  "skills": {
    "allowBundled": ["gemini", "peekaboo"],
    "load": {
      "extraDirs": ["~/Projects/skills"],
      "watch": true,
      "watchDebounceMs": 250
    },
    "install": {
      "preferBrew": true,
      "nodeManager": "npm"
    },
    "entries": {
      "my-skill": {
        "enabled": true,
        "apiKey": { "source": "env", "provider": "default", "id": "API_KEY" },
        "env": { "API_KEY": "xxx" },
        "config": { "endpoint": "https://example.com" }
      }
    }
  }
}
```

### 2.5 ClawHub 公共技能注册表

ClawHub（clawhub.ai）是 OpenClaw 的公共技能注册表，截至 2026 年初已有 5700+ 技能。

**CLI 命令**：

| 命令 | 说明 |
|------|------|
| `clawhub search "query"` | 向量搜索技能 |
| `clawhub install <slug>` | 安装技能 |
| `clawhub install <slug> --version <ver>` | 安装指定版本 |
| `clawhub update <slug>` | 更新单个技能 |
| `clawhub update --all` | 更新所有技能 |
| `clawhub list` | 列出已安装技能（读取 .clawhub/lock.json） |
| `clawhub publish <path>` | 发布技能 |
| `clawhub sync` | 扫描并发布新/更新的技能 |
| `clawhub delete <slug>` | 删除技能 |
| `clawhub undelete <slug>` | 恢复技能 |

**安装位置**：默认安装到 `./skills`（当前工作目录），如果配置了 OpenClaw workspace 则回退到该 workspace。

**锁文件**：已安装技能记录在 `.clawhub/lock.json`。

### 2.6 OpenClaw CLI 技能命令

| 命令 | 说明 |
|------|------|
| `openclaw skills list` | 列出所有技能（内置 + workspace + 托管） |
| `openclaw skills list --eligible` | 仅列出满足条件的技能 |
| `openclaw skills info <name>` | 查看技能详情 |
| `openclaw skills check` | 检查技能状态 |

### 2.7 插件系统与技能的关系

插件（Plugins）可以附带自己的技能目录，在 `openclaw.plugin.json` 中声明。插件技能在插件启用时加载，参与正常的优先级规则。

**插件 CLI 命令**：

| 命令 | 说明 |
|------|------|
| `openclaw plugins list` | 列出所有插件 |
| `openclaw plugins install <path-or-spec>` | 安装插件 |
| `openclaw plugins inspect <id>` | 查看插件详情 |
| `openclaw plugins enable <id>` | 启用插件 |
| `openclaw plugins disable <id>` | 禁用插件 |
| `openclaw plugins uninstall <id>` | 卸载插件 |
| `openclaw plugins update <id>` | 更新插件 |
| `openclaw plugins doctor` | 诊断插件问题 |

---

## 三、实现真实技能管理的差距分析

### 3.1 需要新增的功能

| 功能 | 优先级 | 说明 |
|------|--------|------|
| **自定义技能创建** | P0 | 通过 UI 创建 SKILL.md，写入 `~/.openclaw/skills/` |
| **自定义技能编辑** | P0 | 编辑已有技能的 SKILL.md 内容 |
| **技能详情面板** | P0 | 展示完整 SKILL.md 内容、依赖、配置、安装信息 |
| **自定义技能删除** | P0 | 删除本地自定义技能目录 |
| **ClawHub 市场搜索** | P1 | 集成 `clawhub search` 向量搜索 |
| **技能配置管理** | P1 | 管理 `skills.entries` 中的 apiKey/env/config |
| **技能检查** | P1 | 集成 `openclaw skills check` |
| **技能详情查询** | P1 | 集成 `openclaw skills info <name>` |
| **技能发布** | P2 | 集成 `clawhub publish` |
| **插件管理** | P2 | 集成 `openclaw plugins` 命令族 |

### 3.2 自定义技能创建方案

**核心流程**：
1. 用户点击"创建自定义技能"按钮
2. 弹出创建向导/表单：
   - 技能名称（kebab-case）
   - 描述
   - 可选：emoji、依赖（bins/env/config）、homepage
3. 生成 SKILL.md 模板，打开内置编辑器
4. 用户编写指令内容
5. 保存到 `~/.openclaw/skills/<skill-name>/SKILL.md`
6. 刷新技能列表

**IPC 新增**：

```typescript
// 创建自定义技能
ipcMain.handle('skills:create', async (_, payload: {
  name: string;
  description: string;
  content: string;  // 完整 SKILL.md 内容
}) => { ... });

// 读取技能内容（用于编辑）
ipcMain.handle('skills:read', async (_, skillId: string) => { ... });

// 保存技能内容（编辑后保存）
ipcMain.handle('skills:save', async (_, skillId: string, content: string) => { ... });

// 删除自定义技能
ipcMain.handle('skills:deleteCustom', async (_, skillId: string) => { ... });

// 获取技能详情（调用 openclaw skills info）
ipcMain.handle('skills:info', async (_, skillName: string) => { ... });

// ClawHub 搜索
ipcMain.handle('skills:clawHubSearch', async (_, query: string) => { ... });
```

### 3.3 自定义技能编辑方案

**方案 A：内置 Markdown 编辑器**
- 使用 `react-markdown` + `textarea` 实现简单的分屏编辑器
- 左侧编辑 SKILL.md 原文，右侧实时预览
- 优点：体验好，不离开应用
- 缺点：需要开发编辑器组件

**方案 B：调用系统编辑器**
- 使用 `shell.openPath()` 打开 SKILL.md 文件
- 优点：实现简单
- 缺点：用户体验割裂

**推荐方案 A**，配合 frontmatter 表单编辑器：
- 上半部分：表单编辑 frontmatter（name/description/metadata）
- 下半部分：Markdown 编辑器编辑指令内容

### 3.4 SKILL.md 模板

```markdown
---
name: {skill-name}
description: "{description}"
metadata:
  {
    "openclaw": {
      "emoji": "🔧"
    }
  }
---

## Instructions

当用户要求 [触发条件] 时，执行以下步骤：

1. [第一步]
2. [第二步]
3. 向用户确认完成。

## Rules

- 执行前必须确认操作。
- 缺少必要输入时主动询问。
```

---

## 四、技术实现建议

### 4.1 IPC 层改造

```
electron/ipc/skills.ts  — 扩展现有文件，新增 create/read/save/delete/info/clawHubSearch handler
```

### 4.2 UI 层新增组件

```
src/pages/Skills.tsx                    — 扩展：添加创建按钮、详情面板入口
src/pages/settings/CreateSkillDialog.tsx — 新增：创建自定义技能对话框
src/pages/settings/EditSkillDialog.tsx   — 新增：编辑技能对话框（Markdown 编辑器）
src/pages/settings/SkillDetailPanel.tsx  — 新增：技能详情侧边面板
```

### 4.3 类型统一

将 `SkillInfo` 接口统一定义在 `types/electron.ts`，其他文件引用该定义，消除重复。

### 4.4 性能优化

- `readInstalledSkillsFromDisk()` 结果缓存，避免每次 map 重复调用
- 技能列表支持增量刷新（watcher 模式）

---

## 五、参考资料

- [OpenClaw Skills 系统文档](https://cryptoclawdocs.termix.ai/tools/skills)（内容已根据合规要求改写）
- [创建自定义技能](https://cryptoclawdocs.termix.ai/tools/creating-skills)（内容已根据合规要求改写）
- [Skills 配置参考](https://claw-tw.jackle.pro/tools/skills-config)（内容已根据合规要求改写）
- [ClawHub 文档](https://molty.finna.ai/docs/tools/clawhub)（内容已根据合规要求改写）
- [OpenClaw Skills 指南 - BoilerplateHub](https://boilerplatehub.com/blog/openclaw-skills)（内容已根据合规要求改写）
