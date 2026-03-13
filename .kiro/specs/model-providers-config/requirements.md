# 需求文档

## 简介

本功能在 OpenClaw Desktop 的设置页面（Settings）中新增一个独立的"模型配置"（Models）分区，允许用户管理所有 LLM 提供商的认证状态、设置默认主模型与备用模型、管理模型别名，并通过 GUI 触发 `openclaw onboard`、`openclaw models scan` 等 CLI 命令。

该页面对应的路由为 `/settings?section=models`，遵循现有设置页面的架构约定（`sections.tsx` 注册、`constants.ts` 配色、IPC 通信）。

---

## 词汇表

- **模型配置页面（Models Section）**：Settings 页面中 id 为 `models` 的分区组件。
- **提供商（Provider）**：OpenClaw 支持的 LLM 服务商，例如 Anthropic、OpenAI、Ollama 等。
- **主模型（Primary Model）**：`agents.defaults.model.primary` 配置项，格式为 `provider/model`，如 `anthropic/claude-opus-4-6`。
- **备用模型列表（Fallbacks）**：`agents.defaults.model.fallbacks` 配置项，格式为 `provider/model` 字符串数组。
- **模型别名（Alias）**：用户自定义的模型短名，映射到完整的 `provider/model` 字符串。
- **认证状态（Auth Status）**：通过 `openclaw models status` 命令获取的各提供商认证结果。
- **Onboard 向导**：`openclaw onboard` CLI 命令，用于引导用户完成提供商认证。
- **模型扫描（Model Scan）**：`openclaw models scan` CLI 命令，用于发现当前可用模型列表。
- **IPC**：Electron 进程间通信，渲染进程通过 `window.electronAPI.*` 调用。
- **Config_Service**：负责读写 OpenClaw 配置文件的后端服务（IPC 层）。
- **Models_Section**：模型配置页面的前端 React 组件。
- **CLI_Runner**：负责在 Electron 主进程中执行 openclaw CLI 命令并返回结果的 IPC 模块。

---

## 需求列表

### 需求 1：提供商列表展示

**用户故事**：作为用户，我希望在模型配置页面看到 OpenClaw 所有支持的 LLM 提供商列表，以便了解当前系统支持哪些提供商。

#### 验收标准

1. THE Models_Section SHALL 展示以下 LLM 提供商（严格对应官网 https://docs.openclaw.ai/providers，共 23 个条目）：
   - Amazon Bedrock
   - Anthropic (API + Claude Code CLI)
   - Cloudflare AI Gateway
   - GLM models
   - Hugging Face (Inference)
   - Kilocode
   - LiteLLM (unified gateway)
   - MiniMax
   - Mistral
   - Moonshot AI (Kimi + Kimi Coding)
   - NVIDIA
   - Ollama (local models)
   - OpenAI (API + Codex)
   - OpenCode (Zen + Go)
   - OpenRouter
   - Qianfan
   - Qwen (OAuth)
   - Together AI
   - Vercel AI Gateway
   - Venice (privacy-focused)
   - vLLM (local models)
   - Xiaomi
   - Z.AI

   以���以下转录提供商（2 个）：
   - Deepgram (audio transcription)
   - Claude Max API Proxy
2. THE Models_Section SHALL 以卡片或列表形式展示每个提供商的名称与图标（或首字母占位符）。
3. WHEN 认证状态数据加载完成，THE Models_Section SHALL 在每个提供商条目上显示认证状态标识（已认证 / 未认证 / 未知）。
4. IF 提供商认证状态数据加载失败，THEN THE Models_Section SHALL 显示错误提示，并将所有提供商标记为"状态未知"。

---

### 需求 2：查看提供商认证状态

**用户故事**：作为用户，我希望在模型配置页面直接查看各提供商的认证状态，以便快速判断哪些提供商可以正常使用。

#### 验收标准

1. WHEN 用户进入模型配置页面，THE Models_Section SHALL 自动通过 IPC 调用 `openclaw models status` 命令获取认证状态。
2. WHEN `openclaw models status` 命令执行成功，THE Models_Section SHALL 将返回的每个提供商状态（已认证/未认证）渲染到对应提供商条目上。
3. WHEN 用户点击"刷新状态"按钮，THE Models_Section SHALL 重新执行 `openclaw models status` 并更新界面显示。
4. WHILE 认证状态正在加载，THE Models_Section SHALL 显示加载状态指示器，并禁用"刷新状态"按钮。
5. IF `openclaw models status` 命令返回非零退出码，THEN THE CLI_Runner SHALL 返回包含错误信息的失败响应，THE Models_Section SHALL 显示错误提示。

---

### 需求 3：运行 Onboard 向导

**用户故事**：作为用户，我希望通过 GUI 一键启动 `openclaw onboard` 向导，以便完成提供商认证而无需手动输入 CLI 命令。

#### 验收标准

1. THE Models_Section SHALL 提供"运行 Onboard 向导"按钮。
2. WHEN 用户点击"运行 Onboard 向导"按钮，THE CLI_Runner SHALL 在系统终端中启动 `openclaw onboard` 交互式命令。
3. WHILE `openclaw onboard` 正在运行，THE Models_Section SHALL 禁用"运行 Onboard 向导"按钮并显示运行状态。
4. WHEN `openclaw onboard` 命令完成（无论成功或失败），THE Models_Section SHALL 自动刷新提供商认证状态列表。
5. IF `openclaw onboard` 命令启动失败，THEN THE Models_Section SHALL 显示包含错误详情的提示信息。

---

### 需求 4：设置默认主模型

**用户故事**：作为用户，我希望在模型配置页面设置默认主模型（`agents.defaults.model.primary`），以便 OpenClaw 的智能体使用我指定的模型。

#### 验收标准

1. THE Models_Section SHALL 提供一个输入框，用于显示和编辑 `agents.defaults.model.primary` 配置值。
2. THE Models_Section SHALL 在输入框旁显示格式说明，说明格式为 `provider/model`，例如 `anthropic/claude-opus-4-6`。
3. WHEN 用户修改主模型输入框并提交，THE Config_Service SHALL 将新值写���配置文件的 `agents.defaults.model.primary` 路径。
4. IF 用户输入的值不符合 `provider/model` 格式（即不包含 `/` 分隔符，或 `/` 前后为空字符串），THEN THE Models_Section SHALL 显示格式验证错误，并阻止提交。
5. WHEN 配置写入成功，THE Models_Section SHALL 显示成功提示。
6. IF 配置写入失败，THEN THE Models_Section SHALL 显示错误提示并保留用户的输入内容。
7. WHEN 用户进入模型配置页面，THE Config_Service SHALL 读取当前 `agents.defaults.model.primary` 值并填入输入框。

---

### 需求 5：管理备用模型列表

**用户故事**：作为用户，我希望配置备用模型列表（`agents.defaults.model.fallbacks`），以便在主模型不可用时自动切换到备用模型。

#### 验收标准

1. THE Models_Section SHALL 展示 `agents.defaults.model.fallbacks` 数组中的每个模型条目，支持增加、删除操作。
2. WHEN 用户点击"添加备用模型"并输入合法的 `provider/model` 格式字符串后确认，THE Config_Service SHALL 将新条目追加到 `agents.defaults.model.fallbacks` 数组。
3. WHEN 用户点击某个备用模型条目的删除按钮并确认，THE Config_Service SHALL 从 `agents.defaults.model.fallbacks` 数组中移除该条目。
4. IF 用户输入的备用模型值不符合 `provider/model` 格式，THEN THE Models_Section SHALL 显示格式验证错误，并阻止添加。
5. IF 用户尝试添加一个在当前备用列表中已存在的 `provider/model` 值，THEN THE Models_Section SHALL 显示重复提示，并阻止添加。
6. WHEN 备用模型列表变更成功保存，THE Models_Section SHALL 刷新展示最新列表。

---

### 需求 6：模型别名管理

**用户故事**：作为用户，我希望为常用模型设置自定义别名，以便在配置中使用更简短的名称引用完整的 `provider/model`。

#### 验收标准

1. THE Models_Section SHALL 展示当前所有已配置的模型别名（键值对形式：别名 → `provider/model`）。
2. WHEN 用户点击"添加别名"并输入别名名称及目标 `provider/model` 后确认，THE Config_Service SHALL 在配置文件的别名映射中新增该条目。
3. WHEN 用户点击某个别名条目的删除按钮并确认，THE Config_Service SHALL 从配置文件的别名映射中移除该条目。
4. IF 用户输入的别名名称已存在，THEN THE Models_Section SHALL 显示重复提示并询问是否覆盖，若用户确认覆盖则执行更新。
5. IF 用户输入的目标 `provider/model` 不符合格式，THEN THE Models_Section SHALL 显示格式验证错误，并阻止保存。
6. WHEN 别名列表变更成功保存，THE Models_Section SHALL 刷新展示最新别名列表。

---

### 需求 7：模型扫描

**用户故事**：作为用户，我希望通过 GUI 触发 `openclaw models scan` 命令，以便发现当前环境中所有可用的模型。

#### 验收标准

1. THE Models_Section SHALL 提供"扫描可用模型"按钮。
2. WHEN 用户点击"扫描可用模型"按钮，THE CLI_Runner SHALL 执行 `openclaw models scan` 命令。
3. WHILE `openclaw models scan` 正在执行，THE Models_Section SHALL 显示加载状态并禁用"扫描可用模型"按钮。
4. WHEN `openclaw models scan` 命令执行成功，THE Models_Section SHALL 展示扫描结果（可用模型列表）。
5. IF `openclaw models scan` 命令执行失败，THEN THE Models_Section SHALL 显示包含错误详情的提示信息。

---

### 需求 8：模型配置页面路由注册

**用户故事**：作为开发者，我希望模型配置页面遵循现有设置页面的架构约定完成注册，以便系统路由和导航能够正确识别该分区。

#### 验收标准

1. THE Models_Section SHALL 在 `src/pages/settings/sections.tsx` 中以 id `models` 注册为一个 `SettingsSection` 条目。
2. THE Models_Section SHALL 在 `src/pages/settings/constants.ts` 的 `sectionAccentMap` 中配置对应的主题配色。
3. WHEN 用户访问 `/settings?section=models` 路由，THE Settings 页面 SHALL 渲染模型配置页面组件。
4. THE Models_Section SHALL 使用 `lucide-react` 中的图标作为分区图标，与现有分区风格保持一致。
5. THE Models_Section SHALL 支持现有 i18n 机制，通过 `useI18n()` hook 获取显示文本，相关键值在 `src/i18n/translations.ts` 中注册。
