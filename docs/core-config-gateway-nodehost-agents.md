# Core Config 实施清单：Gateway、Node Host、Agents

## 目标

本文档用于登记 `SettingsCoreConfig.tsx` 中 `Gateway`、`Node Host`、`Agents` 三个核心配置项的真实生产实现范围。

要求：

- 前端字段必须绑定真实 `draft` 字段
- 后端必须通过 `electron/ipc/coreConfig.ts` 的 manifest 读写链路接入 `openclaw.json`
- 字段命名优先以当前仓库内真实消费代码为准
- 未经代码证实的字段先标记为 `待确认`，禁止直接当作最终 schema 落地

## 已确认代码来源

### Gateway

已确认真实消费代码：

- `electron/ipc/gateway.ts`
- `electron/ipc/coreConfig.ts`
- `electron/config/openclaw-manifests/3.8.json`

已确认真实字段：

- `gateway.port`
- `gateway.mode`
- `gateway.bind`
- `gateway.host`
- `gateway.url`
- `gateway.token`
- `gateway.auth.mode`
- `gateway.auth.token`
- `gateway.remote.url`
- `gateway.remote.token`

已确认关联逻辑：

- `resolveGatewayTarget()` 会同时读取 `openclaw.json` 与 `node.json`
- 本地模式依赖：`gateway.host`、`gateway.bind`、`gateway.port`
- 远程模式依赖：`gateway.mode === "remote"`、`gateway.remote.url`、`gateway.remote.token`
- 认证判断依赖：`gateway.auth.mode`、`gateway.auth.token`、`gateway.token`、`gateway.remote.token`
- 兼容性错误提示依赖：非 loopback bind + 缺少 auth 时会触发拒绝连接提示

### Node Host

已确认真实消费代码：

- `electron/ipc/gateway.ts`

已确认真实字段：

- `node.json -> gateway.host`
- `node.json -> gateway.port`

当前结论：

- `Node Host` 目前不是 `openclaw.json` 单独 section 的稳定 schema
- 现有仓库明确消费的是 `node.json` 中的 `gateway.host` / `gateway.port`
- 截图中的 `Node Browser Proxy` 及其子项，当前仓库代码里还没有找到稳定消费代码
- 这部分需要先做“字段登记 + 读写支撑”，再逐步补消费侧或与 CLI 真实 schema 对齐

### Agents

已确认真实消费代码：

- `electron/ipc/agents.ts`
- `electron/ipc/coreConfig.ts`
- `src/pages/SettingsChannels.tsx`

已确认真实根字段：

- `agents.defaults`
- `agents.list`

已确认真实字段和结构：

- `agents.defaults.model.primary`
- `agents.defaults.model.fallbacks`
- `agents.defaults.subagents.maxConcurrent`
- `agents.list[].id`
- `agents.list[].name`
- `agents.list[].workspace`
- `agents.list[].agentDir`
- `agents.list[].model`
- `agents.list[].subagents.allowAgents`

已确认关联逻辑：

- `agents:getAll` 直接读取 `config.agents.list`
- `getAgentModelSummary()` 会优先读单 agent 的 `model`，否则回退到 `agents.defaults.model.primary`
- `buildWorkspaceDetails()` 会读取：
  - `agent.subagents.allowAgents`
  - `agents.defaults.subagents.maxConcurrent`
  - `commands.nativeSkills`
  - `tools.profile`
- `bindings[]` 会按 `binding.agentId === agent.id` 聚合到 agent 详情中

## 实施顺序

### 阶段 1：Gateway

第一批按已确认真实字段落地：

- `gateway.mode`
- `gateway.bind`
- `gateway.host`
- `gateway.port`
- `gateway.auth.mode`
- `gateway.auth.token`
- `gateway.remote.url`
- `gateway.remote.token`
- `gateway.url`
- `gateway.token`

前端要求：

- 右侧详情页分组与截图一致
- 所有字段接入真实 `draft`
- 禁止仅保留占位按钮

后端要求：

- 在 `3.8.json` 中增加/完善 `gateway` 字段定义
- 保证 `buildDraftFromManifest()` 正确回填
- 保证 `buildPatchedConfig()` 正确写回 `openclaw.json`
- 不破坏 `electron/ipc/gateway.ts` 现有读取逻辑

### 阶段 2：Node Host

第一批先实现“已确认字段 + 最小可用支撑”：

- `node.json.gateway.host`
- `node.json.gateway.port`

说明：

- 由于当前 `coreConfig.ts` 只处理 `openclaw.json`，Node Host 需要新增专门的读写链路，不能硬塞进现有 `openclaw.json` manifest path
- `Node Browser Proxy` 相关字段暂列为 `待确认 schema`

待确认字段：

- `nodeHost.browserProxy.enabled`
- `nodeHost.browserProxy.allowedProfiles`

这些名称仅用于登记，不作为最终 schema 直接落地，必须先找到真实 CLI / 配置消费依据

### 阶段 3：Agents

`Agents` 必须按功能点逐项实现，不允许整体糊成一个 textarea。

#### 3.1 已确认可先落地的 defaults 字段

- `agents.defaults.model.primary`
- `agents.defaults.model.fallbacks`
- `agents.defaults.subagents.maxConcurrent`

#### 3.2 已确认可先落地的 list 字段

- `agents.list[].id`
- `agents.list[].name`
- `agents.list[].workspace`
- `agents.list[].agentDir`
- `agents.list[].model`
- `agents.list[].subagents.allowAgents`

#### 3.3 与截图对应但尚待逐项确认的功能块

以下功能块已从截图观察到，但需要继续对齐真实 schema 后逐项落地：

- Agent Defaults
- Agent List
- Bootstrap Max Chars
- Bootstrap Prompt Truncation Warning
- Bootstrap Total Max Chars
- CLI Backends
- Compaction
- Compaction Memory Flush
- Post-Compaction Context Sections
- Compaction Quality Guard
- Embedded Pi
- Envelope Elapsed
- Envelope Timestamp
- Envelope Timezone
- Heartbeat Direct Policy
- Heartbeat Suppress Tool Error Warnings
- Human Delay Max / Min / Mode
- Image Max Dimension
- Memory Search
- Memory Search Provider / Model / Fallback / Rerank / Decay / Limits
- Remote Embedding
- Memory Search Sources / Index Path / Session Delta / Watch
- Models
- PDF Max Size / Pages
- Repo Root
- Sandbox Browser / Docker / Network
- Workspace
- Subagent limits / nesting / children

这些项后续必须按以下步骤处理：

1. 先确认真实 path
2. 再确认数据类型
3. 再确认是否属于 `agents.defaults` 或 `agents.list[]`
4. 最后实现结构化编辑 UI

## 当前禁止事项

- 禁止把未确认 schema 的复杂对象直接硬编码成最终结构
- 禁止把数组/对象字段统一降级成“演示用 Add 按钮”就算完成
- 禁止删除已有未编辑内容
- 禁止把 `node.json` 字段误写进 `openclaw.json`

## 下一步执行

1. 实现 Gateway 第一批真实字段
2. 新增 Node Host 专用读写链路
3. 继续登记并实现 Agents 第一批已确认字段
