# 更新日志 / Changelog

所有重要的项目变更都将记录在此文件中。

版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/) 规范。

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
