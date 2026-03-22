# 更新日志 / Changelog

所有重要的项目变更都将记录在此文件中。

版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/) 规范。

---

## [0.3.13-preview-8] - 2026-03-22

### ✨ 新增 (Features)

- **Skills 管理完整功能**：Skills 页面全面重构，新增技能详情面板（SkillDetailPanel）、技能配置编辑器（SkillConfigEditor）、创建/编辑/删除对话框（CreateSkillDialog / EditSkillDialog / DeleteSkillConfirm）、插件 Tab（PluginsTab）、诊断面板（DiagnosticsPanel）
- **AppModal 通用弹窗组件**：新增统一模态对话框组件，支持 default/danger/info/success/warning 五种语义变体、自定义头部图标、底部操作栏、Escape 关闭、遮罩关闭、焦点陷阱等
- **AppBadge 徽章组件**：新增通用徽章/标签组件，统一替换各页面散落的状态标签
- **Skills IPC 完整实现**：`skillsLogic.ts` 新增技能增删改查、插件管理、诊断检查等完整 IPC 逻辑，配套 PBT 属性测试和单元测试
- **AppConfig IPC 扩展**：`appConfig.ts` 新增应用配置读写相关 IPC 处理器
- **Channels IPC 扩展**：`channels.ts` 新增渠道相关 IPC 处理器
- **i18n 大幅扩充**：`translations.ts` 新增 Skills 管理、模型提供商、会话、Agent 工作区等模块的中英文翻译条目（约 289 行新增）

### 🎨 界面优化 (UI/UX)

- **AgentWorkspace 大幅重构**：Agent 工作区页面重构，优化布局与交互体验
- **多页面 UI 统一升级**：Agents、Instances、Logs、Sessions、Tasks、Skills 等页面顶部卡片、统计区域、操作栏统一升级为玻璃液态风格
- **ExportAgentDialog / ImportAgentDialog 精简重构**：导出/导入对话框代码大幅精简，改用 AppModal 组件
- **ExportHistoryPanel 重构**：导出历史面板改用 AppModal 组件，优化列表展示
- **CreateAgentWizard 优化**：创建 Agent 向导流程优化
- **SetupCreateAgentPage 重构**：Setup 流程中创建 Agent 页面重构
- **Sessions 页面优化**：CreateSessionModal、SessionChatPanel 交互优化
- **Settings 子页面优化**：AddChannelModal、BroadcastGroupsConfig、ChannelConfigModal、ChannelRoutingConfig、GroupsManager、LocationParsingConfig、PairingManager、SettingsHomeView 等多个设置子页面 UI 优化
- **AppButton 增强**：新增更多交互状态和样式变体支持
- **GlobalLoading 优化**：进一步优化加载动画细节

### 🔧 重构 (Refactor)

- **IPC 类型定义扩展**：`src/types/electron.ts` 和 `types/electron.ts` 新增 Skills、AppConfig 等模块的完整类型定义
- **preload.cjs 扩展**：新增 Skills、AppConfig、Channels 相关 API 暴露
- **tsconfig.node.json 调整**：编译配置优化
- **agentCreation 工具函数补充**：`agentCreation.ts` 补充工具函数

### 🧪 测试 (Tests)

- 新增 `skillsLogic.pbt.test.ts` 属性测试（技能 CRUD、插件管理、诊断逻辑等正确性属性）
- 新增 `skillsLogic.unit.test.ts` 单元测试（完整技能管理流程覆盖）

---

## [0.3.13-preview-7] - 2026-03-21

### 🎨 界面优化 (UI/UX)

- **Dashboard 玻璃液态卡片升级**：健康统计卡片（服务状态/CPU/内存/运行时长）改为玻璃液态风格，每张卡片使用各自 accent 色半透明渐变背景 + `backdrop-blur` + 右上角装饰光晕
- **Dashboard 快捷操作卡片升级**：三个快捷操作按钮（日志/Agent/渠道）改为玻璃液态风格，图标圆圈使用各自 accent 色渐变（蓝/紫/青），右上角加装饰光晕
- **GlassCard 组件全局升级**：`default` variant 改为半透明渐变背景 + `backdrop-blur-xl`，`elevated` variant 加强渐变与阴影，`status`/`gradient` variant 保留彩色渐变并加右上角装饰光晕
- **Tasks 页面全宽列表 + 右侧抽屉详情**：主内容区从左右分栏改为全宽任务列表，点击行从右侧滑入详情抽屉（含渐变头部、基本信息、Payload、运行历史）
- **Tasks 页面统计卡片合并**：4 个独立统计卡片合并到顶部渐变卡片内，改为 inline pill tag 样式
- **Skills 页面 Tab 换成 SegmentedTabs 胶囊样式**：将下划线式 tab 替换为胶囊样式分段控件
- **插件 Tab 操作栏迁移**：PluginsTab 内部操作栏移到 Skills 页面顶部卡片右侧按钮组，通过 trigger 计数器 props 控制子组件刷新
- **GlobalLoading 内联模式优化**：`overlay=false` 模式只显示旋转光环，不渲染文字和跳动圆点
- **Sessions 页面 loading 替换**：初始加载态替换为 `GlobalLoading` 内联模式
- **SkillDetailPanel loading 替换**：抽屉内加载态替换为 `GlobalLoading` 内联模式
- **各页面顶部卡片渐变风格统一**：Agents/Instances/Skills/Logs/Sessions 页面顶部卡片统一为渐变设计，各页面使用不同颜色调
- **Agents 页面顶部卡片布局重构**：改为左右两列布局，右侧按钮组顺序「更多 → 刷新 → 新增智能体」，更多下拉菜单包含「导入配置」和「导出历史」

---

## [0.3.13-preview-6] - 2026-03-20

### ✨ 新增 (Features)

- **Agent 配置加密导入/导出**：新增完整的 Agent 配置导入导出功能，支持 AES-256-GCM 加密打包（含 7 个 workspace markdown 文件 + 渠道绑定 + 技能清单），导入时自动创建 Agent、写入配置、安装依赖并绑定渠道，失败自动回滚
- **导出对话框**（ExportAgentDialog）：支持设置加密密钥，导出为 `.ocagent` 加密文件
- **导入对话框**（ImportAgentDialog）：支持选择文件、输入密钥解密，实时显示分步导入进度
- **导出历史面板**（ExportHistoryPanel）：查看历史导出记录，支持复制密钥和删除记录
- **Agent 详细统计**：Agents 页面新增每个 Agent 的会话数、消息数、Token 估算、平均响应时间统计（通过 `sessions:agentDetailedStats` IPC）
- **全局 GlobalLoading 组件**：品牌色蓝绿渐变旋转光环 + 跳动圆点动画，支持 overlay/inline 模式和 sm/md/lg 三档尺寸，自动适配深色/浅色主题
- **Agent 配置导入/导出 i18n**：中英文翻译条目完整覆盖导出、导入、历史面板所有文案

### 🔧 重构 (Refactor)

- **Agents 页面重构**：集成导出/导入/历史面板入口，移除废弃的 copyToClipboard/copyAgentPath 方法，新增 agentStats 统计展示
- **Tasks 页面视觉优化**：顶部渐变卡片改为紫蓝色调，统计卡片改为一行四列紧凑布局，每个卡片带独立 accent 色圆形图标
- **页面级 Loading 统一**：Skills、Agents、Instances、AgentEnhancer、SetupBindChannelsPage 5 处原生 RefreshCw/Loader2 spinner 全部替换为 GlobalLoading 组件
- **App 初始化加载屏**：AppLoadingScreen 替换为 GlobalLoading 组件（overlay=false, size=lg）

### 🧪 测试 (Tests)

- 新增 agentExchangeLogic 属性测试（加密/解密/序列化/敏感字段剥离等）
- 新增 agentExchangeLogic 单元测试（完整导入导出流程覆盖）

---

## [0.3.13-preview-5] - 2026-03-19

### ✨ 新增 (Features)

- **渠道多账户支持**：SetupChannelsPage 重构为多账户版，同一 provider 下可添加多个账户实例，每个账户有独立的 accountId 和凭证字段
- **渠道账户字段定义**：新增 `channelAccountFields.ts`，定义每种渠道的账户配置字段和平台配置指导信息
- **渠道-Agent 绑定页面**：新增 `SetupBindChannelsPage`，引导用户在创建 Agent 后绑定渠道账户
- **智能体删除功能**：Agents 页面新增删除智能体功能，通过 `agents:delete` IPC 调用 CLI 正式删除
- **操作结果 Toast 提示**：Agents 页面新增 toast 提示组件，操作成功/失败自动消失

### 🔧 重构 (Refactor)

- **bindings.match Schema 迁移**：coreConfig 新增 `migrateBindingsSchema` 纯函数，读写配置时自动移除废弃字段（dmScope/guildId/teamId）和空 peer
- **Agent 目录自动修复**：agents IPC 创建流程新增 `needsAgentDirRepair`/`planAgentDirRepair` 防御性检查，CLI 未创建 agentDir 时自动补建
- **渠道添加逻辑优化**：SetupFlowContext 中 `addEnabledChannels` 重构为按账户维度逐个调用 CLI，新增 config warning 噪音过滤
- **SetupPages 精简**：移除冗余 SetupActionBar 组件，优化远程配置表单
- **SetupLayout 优化**：调整引导流程布局组件样式与结构

### 🐛 修复 (Fixes)

- **渠道账户状态管理**：SetupFlowContext 新增 `channelAccounts` 状态，修复多账户场景下状态丢失问题
- **导航图扩展**：setupNavigationGraph 新增 `/setup/local/bind-channels` 路由节点

### 🧪 测试 (Tests)

- 新增 channelAccountBindingFix/channelAccountBindingPreservation/channelAccountFlow 属性测试
- 新增 migrateBindingsSchema 单元测试
- 新增 setupConfigPersistence 属性测试
- 新增 channelAccountFlow 前端属性测试

---

## [0.3.13-preview-4] - 2026-03-18

### ✨ 新增 (Features)

- **远程连接增强**：支持自签名证书检测与跳过验证选项（skipCertVerification）
- **网关健康检查**：gateway IPC 新增健康检查、自动重连与修复逻辑
- **运行时管理增强**：runtime IPC 新增环境诊断与版本检测能力
- **渠道管理**：channels IPC 新增渠道操作接口
- **设置扩展**：settings IPC 新增配置项支持

### 🔧 重构 (Refactor)

- **远程连接逻辑拆分**：将网络错误映射、证书检测、版本解析等提取到 remoteConnectionLogic 纯函数模块
- **运行时逻辑拆分**：新增 runtimeLogic 纯函数模块
- **验证链逻辑**：新增 verifyChainLogic/verifyLogic 验证链纯函数模块
- **诊断逻辑**：新增 doctorLogic 环境诊断纯函数模块
- **进程管理**：新增 spawnHelper/spawnHelperLogic 子进程管理模块
- **状态转换**：新增 stateTransitionLogic 引导流程状态转换纯函数模块
- **引导流程**：优化 SetupFlowContext 与 setupReducer 状态管理
- **实例管理页面**：优化 Instances 页面布局，修复顶部卡片吸顶问题

### 🐛 修复 (Fixes)

- **ESM 模块解析**：修复 remoteConnection.ts 中 import 缺少 .js 扩展名导致的 ERR_MODULE_NOT_FOUND 错误

### 🧪 测试 (Tests)

- 新增 remoteConnection/pathResolver 属性测试
- 新增 doctorLogic 单元测试与 doctorOutput 属性测试
- 新增 networkError/regressionDetect/runtimeTier/spawnHelper/verifyChain/zodErrorParse 属性测试
- 新增 setupWizardValidationFixes/stateTransition 属性测试

---

## [0.3.13-preview-3] - 2026-03-17

### 🔧 重构 (Refactor)

- **引导流程状态管理**：提取 setupReducer/setupActions/setupNavigationGraph/setupFallback/setupSelectors 为独立模块
- **引导流程组件**：新增 SetupSkeleton/VirtualChannelList 组件，优化 SetupLayout
- **渠道字段配置**：新增 channelFieldDefinitions 渠道字段定义
- **IPC 逻辑拆分**：新增 agentCreateLogic/modelTestLogic/environmentFixerLogic

### 🐛 修复 (Fixes)

- **实例管理**：修正实例定义，仅展示真正的运行时进程（Gateway/LaunchAgent），移除错误的 workspace 目录扫描
- **类型修复**：修复 setupIntegration 测试中 EnvironmentCheckResult 判别联合类型错误

### 🧪 测试 (Tests)

- 新增 setupReducer/setupNavigation/setupFallback/setupErrors/setupChannelConfig/setupIpcResult 属性测试
- 新增 setupIntegration 集成属性测试

---

## [0.3.13-preview-2] - 2026-03-16

### ✨ 新增功能 (Features)

#### Setup 引导流程补全
- **渠道 CLI 添加**：Setup 渠道配置步骤新增 CLI 自动添加功能，点击"继续"时自动执行 `openclaw channels add` 命令
- **创建 Agent 步骤**：新增 `SetupCreateAgentPage`，引导用户在 Setup 流程中创建第一个智能体
- **完成页增强**：完成页新增初始化摘要卡片（运行模式、已添加渠道、已创建 Agent）和后续操作引导卡片
- **渠道 IPC 扩展**：新增 `channels:add` IPC Handler，支持通过 CLI 添加渠道
- **纯函数工具**：新增 `fieldIdToCliFlag`、`buildChannelAddArgs` 纯函数，用于构建 CLI 参数

### 🐛 问题修复 (Bug Fixes)

- **AgentWorkspace 重复键修复**：修复 `AgentWorkspace.tsx` 中对象字面量 `agentId` 和 `match` 重复键导致的 Vite 编译警告

### 🔧 技术改进 (Technical)

- **SetupFlowContext 扩展**：新增 `addEnabledChannels`、`channelAddResults`、`createdAgent` 状态管理
- **属性测试**：新增 5 个属性测试覆盖渠道过滤、结果映射、步骤回退、完成页摘要等逻辑
- **路由注册**：新增 `/setup/local/create-agent` 路由

---

## [0.3.13-preview-1] - 2026-03-16

### ✨ 新增功能 (Features)

#### 渠道管理系统
- **渠道配置页面重构**：`SettingsChannels` 页面全面重写，支持多渠道多账号管理
- **渠道配置弹窗**：新增 `ChannelConfigModal`，三段式布局（Tab 切换 + 滚动内容 + 底部操作栏）
- **添加渠道/账号**：新增 `AddChannelModal`、`AddAccountModal`，网格式渠道类型选择
- **渠道路由配置**：新增 `ChannelRoutingConfig`，按优先级管理消息路由规则
- **广播群组配置**：新增 `BroadcastGroupsConfig`，支持多目标消息推送
- **群组管理**：新增 `GroupsManager`，管理已知群组及其配置
- **群消息配置**：新增 `GroupMessagesConfig`，管理群消息处理策略（触发条件、渠道级覆盖）
- **位置解析配置**：新增 `LocationParsingConfig`，支持正则和预定义格式两种解析模式
- **配对管理**：新增 `PairingManager`，DM 配对审批和节点配对列表管理
- **故障排查面板**：新增 `TroubleshootingPanel`，渠道诊断、日志查看和重新连接
- **渠道 IPC 接口**：新增 `electron/ipc/channels.ts`，支持渠道状态查询、列表、诊断、重连、配对审批

#### 智能体创建向导
- **多步骤创建流程**：新增 `CreateAgentWizard`，四步向导（基础信息 → 模板选择 → Identity 配置 → 确认创建）
- **Identity 更新接口**：新增 `agents:updateIdentity` IPC，支持写入智能体名称、主题、Emoji、头像
- **智能体增强功能**：扩展 agents IPC，新增性能监控、安全检查、配置导出/导入、克隆、重启等接口

#### 会话管理重构
- **会话页面拆分**：将单文件 `Sessions.tsx` 拆分为模块化子组件目录 `src/pages/sessions/`
  - `Sessions.tsx` — 主组件（状态管理 + 紧凑工具栏布局）
  - `SessionList.tsx` — 左侧会话列表（卡片式、选中高亮）
  - `SessionChatPanel.tsx` — 右侧对话面板（transcript 显示 + 消息输入）
  - `SessionStatCards.tsx` — 统计卡片组件
  - `CreateSessionModal.tsx` — 新建会话弹窗
  - `types.ts` — 共享类型与工具函数
- **对话记录加载**：从 `.jsonl` 文件读取真实对话记录，支持 `sessionsGet` + `sessionsTranscript` 双接口
- **紧凑布局重设计**：顶部从三层（标题+统计+搜索）压缩为两行工具栏，统计数字内联 pill 显示，最大化对话区域
- **消息发送**：支持在会话面板中直接发送消息，乐观 UI 更新

#### 日志增强
- **日志过滤接口**：新增 `logsFilter` IPC，支持按条件过滤查询日志

### 🎨 界面优化 (UI/UX)

- **AppSelect 组件重写**：优化下拉选择组件的样式和交互体验
- **JsonFormEditor 优化**：改进 JSON 表单编辑器
- **侧边栏优化**：调整 `Sidebar` 组件布局和样式
- **智能体页面增强**：`Agents.tsx` 和 `AgentWorkspace.tsx` 界面优化
- **国际化扩展**：新增渠道管理、智能体创建、会话管理等模块的中英文翻译（约 200+ 条）

### 🔧 技术改进 (Technical)

- **升级至 OpenClaw 3.13**：新增 `openclaw-manifests/3.13.json` 配置清单，版本号跟随 3.13
- **Manifest 版本集中管理**：新增 `electron/config/manifest-version.ts`
- **纯函数工具集**：提取 `agentCreation.ts`、`channelOps.ts`、`bindingOps.ts` 纯函数模块，便于测试
- **属性测试**：新增 `agentCreation.pbt.test.ts`、`channelOps.pbt.test.ts`、`bindingOps.pbt.test.ts` 等属性测试和单元测试
- **类型定义扩展**：`src/types/electron.ts` 和 `types/electron.ts` 大幅扩展，覆盖渠道、会话、智能体增强等新接口
- **Preload 扩展**：`preload.cjs` 新增渠道管理、配对、日志过滤等 API 暴露

### 🗑️ 清理 (Cleanup)

- 删除根目录临时文件 `AVATAR_OPTIMIZATION_SUMMARY.md`、`IMPLEMENTATION_SUMMARY.md`
- 从 git 跟踪中移除 `.kiro` 目录
- 更新 `.gitignore` 规则

---

## [0.3.8-preview-2] - 2026-03-14

### ✨ 新增功能 (Features)

#### 模型提供商配置增强
- **自定义提供商管理**：支持添加、编辑和删除自定义模型提供商
- **提供商详情页面**：新增独立的提供商详情和配置页面
- **提供商列表视图**：优化模型设置页面，采用列表+详情的双栏布局
- **表单输入组件**：新增 `AppInput` 组件，提供统一的表单输入体验
- **模型 IPC 扩展**：扩展 models IPC 接口，支持完整的 CRUD 操作
  - `getProviders` - 获取所有提供商列表
  - `getProvider` - 获取单个提供商详情
  - `addProvider` - 添加自定义提供商
  - `updateProvider` - 更新提供商配置
  - `deleteProvider` - 删除自定义提供商
  - `resetProvider` - 重置提供商到默认配置

#### 定时器清理优化
- **组件卸载清理**：新增定时刷新清理函数，确保组件卸载时正确销毁定时器
- **内存泄漏防护**：防止页面切换时定时器持续运行导致的内存泄漏

### 🐛 问题修复 (Bug Fixes)

- **TypeScript 类型错误修复**：
  - 修复 `Tasks.tsx` 中的类型错误
  - 修复 `SetupFlowContext.tsx` 中的类型定义问题
- **按钮组件优化**：修复 `AppButton` 组件的样式和交互问题

### 🎨 界面优化 (UI/UX)

- **模型设置页面重构**：
  - 采用响应式双栏布局（列表 + 详情）
  - 优化提供商卡片展示效果
  - 改进表单交互体验
- **国际化支持**：新增模型配置相关的中英文翻译

### 🔧 技术改进 (Technical)

- **代码结构优化**：
  - 将模型设置拆分为独立的子组件（`ProvidersList`、`ProviderDetail`）
  - 提升代码可维护性和可测试性
- **类型定义完善**：
  - 扩展 `electron.ts` 类型定义
  - 更新测试用例以匹配新的 API

### 📝 文档更新 (Documentation)

- 修复 README 中的图片路径和功能描述
- 添加功能实现总结文档

### 🔄 性能优化 (Performance)

- 文件操作异步化：将同步文件操作替换为异步操作，提升应用性能

---

## [0.3.8-preview-1] - 2026-03-XX

### ✨ 新增功能
- 初始版本发布
- 基础的 OpenClaw Desktop 管理界面
- 支持 Agent、Session、Task、Log、Instance、Skill 管理
- 首次运行设置向导
- 明暗主题切换
- 中英文国际化支持

---

## 版本说明

- **0.3.13.x** 系列版本对应 OpenClaw 3.13 运行时
- **0.3.8.x** 系列版本对应 OpenClaw 3.8 运行时
- **preview** 标识表示预览版本，可能包含实验性功能
- 版本号格式：`0.主版本.次版本-preview-预览版本号`
