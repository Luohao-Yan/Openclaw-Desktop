# 实现计划：model-providers-config

## 概述

按照设计文档，逐步实现模型配置页面。从类型定义和工具函数开始，到 IPC 层，再到前端组件，最后完成路由注册和国际化接入。每个任务均可独立验证，通过检查点确保增量正确性。

## 当前进度

已完成：
- ✅ 类型定义（`src/types/electron.ts` 和 `types/electron.ts`）
- ✅ 提供商静态配置（`src/config/providers.ts`）

待实现：
- 格式校验工具函数
- Electron IPC 层
- 前端 UI 组件
- 路由注册与国际化

## 任务列表

- [x] 1. 创建类型定义与提供商静态配置
  - [x] 1.1 在 `src/types/electron.ts` 和 `types/electron.ts` 中新增 models 相关返回类型
    - 新增 `ProviderAuthStatus`、`ModelsStatusResult`、`ModelsScanResult`、`ModelsConfigResult`、`ModelsAliasesListResult`、`ModelAlias` 类型
    - 在 `ElectronAPI` 接口中新增全部 11 个 `models*` 方法签名
    - _需求：4.1、4.3、5.1、6.1、2.1_
  - [x] 1.2 为类型定义编写单元测试（类型可分配性检查）
    - 验证 `ProviderAuthStatus` 只接受合法值
    - _需求：2.2、4.4_

- [x] 2. 实现提供商静态列表与格式校验工具函数
  - [x] 2.1 创建 `src/config/providers.ts`，定义 `ProviderDefinition` 接口和 `PROVIDER_LIST` 常量
    - 包含全部 23 个 LLM 提供商和 2 个转录提供商，字段：`id`、`name`、`category`、`description`
    - 已实现 `mergeProviderStatuses` 辅助函数用于合并静态列表与运行时状态
    - _需求：1.1、1.2_
  - [x] 2.2 为 `PROVIDER_LIST` 编写属性测试（Property 1）
    - **Property 1：提供商列表字段完整性**
    - **Validates: Requirements 1.1, 1.2**
    - 测试文件：`src/config/__tests__/providers.pbt.test.ts`
    - 使用 fast-check，numRuns: 100
  - [x] 2.3 创建 `src/utils/modelFormat.ts`，实现 `isValidModelFormat`、`addFallback`、`removeFallback` 纯函数
    - `isValidModelFormat`：校验 `provider/model` 格式（含 `/`，前后非空）
    - `addFallback`：若已存在则返回原列表（幂等），否则追加
    - `removeFallback`：移除指定条目，返回新列表
    - _需求：4.4、5.2、5.3、5.5_
  - [x] 2.4 为格式校验和备用模型纯函数编写属性测试（Property 4、6、7、8）
    - **Property 4：`provider/model` 格式校验**
    - **Property 6：备用模型添加后列表包含该条目**
    - **Property 7：备用模型删除后列表不含该条目**
    - **Property 8：备用模型去重（幂等添加）**
    - **Validates: Requirements 4.4, 5.2, 5.3, 5.5**
    - 测试文件：`src/utils/__tests__/modelFormat.pbt.test.ts`
    - 使用 fast-check，numRuns: 100

- [x] 3. 检查点 — 确保所有测试通过
  - 确保所有测试通过，如有疑问请向用户��认。

- [x] 4. 实现 Electron IPC 层
  - [x] 4.1 创建 `electron/ipc/models.ts`，实现 `setupModelsIPC()` 并注册全部 11 个 handler
    - `models:status` — 执行 `openclaw models status`，解析 JSON 返回各提供商认证状态
    - `models:onboard` — 在系统终端启动 `openclaw onboard`（交互式）
    - `models:scan` — 执行 `openclaw models scan`，返回输出文本
    - `models:getConfig` — 读取 `agents.defaults.model.primary` 和 `agents.defaults.model.fallbacks`
    - `models:setPrimary` — 写入 `agents.defaults.model.primary`
    - `models:fallbackAdd` / `models:fallbackRemove` / `models:fallbackClear` — 备用模型列表增删清
    - `models:aliasesList` / `models:aliasAdd` / `models:aliasRemove` — 别名管理
    - 所有 handler 遵循 `{ success: boolean, ...data }` 或 `{ success: false, error: string }` 约定
    - CLI 非零退出码、JSON 解析失败、文件读写异常均需捕获并返回 `success: false`
    - _需求：2.1、2.5、3.2、3.5、4.3、4.7、5.2、5.3、6.2、6.3、7.2、7.5_
  - [x] 4.2 在 `electron/main.ts` 中导入并调用 `setupModelsIPC()`
    - 遵循现有 IPC 注册模式
    - _需求：8.1_

- [x] 5. 暴露 Context Bridge API
  - [x] 5.1 在 `electron/preload.ts` 和 `electron/preload.cjs` 中暴露全部 11 个 `models*` 方法到 `window.electronAPI`
    - 方法名与类型定义中的签名一一对应
    - _需求：2.1、3.2、4.3、5.2、6.2、7.2_

- [x] 6. 实现国际化键值与路由注册
  - [x] 6.1 在 `src/i18n/translations.ts` 的 `en` 和 `zh` 对象中新增约 40 个 `settings.models.*` 键值
    - 覆盖：分区入口、提供商列表、Onboard/Scan 操作、主模型、备用模型、别名各区块的全部文案
    - _需求：8.5_
  - [x] 6.2 在 `src/pages/settings/constants.ts` 的 `sectionAccentMap` 中新增 `models` 配色条目
    - 使用设计文档中指定的 indigo 色系（`bg`、`icon`、`glow`）
    - _需求：8.2_
  - [x] 6.3 在 `src/pages/settings/sections.tsx` 中注册 `models` 分区条目
    - 导入 `Bot` 图标（lucide-react）和 `SettingsModels` 组件
    - 填写 `id`、`name`、`description`、`icon`、`component`、`translateKey` 字段
    - _需求：8.1、8.3、8.4_

- [x] 7. 实现 SettingsModels 主组件
  - [x] 7.1 创建 `src/pages/SettingsModels.tsx`，实现页面级状态管理与并行数据加载
    - 页面挂载时并行调用 `modelsStatus()`、`modelsGetConfig()`、`modelsAliasesList()`
    - 维护 `SettingsModelsState` 中定义的全部状态字���
    - 将加载状态、数据、操作回调分发给各子区块
    - _需求：1.3、2.1、4.7、5.1、6.1_
  - [x] 7.2 实现 `ProvidersSection` 子区块
    - 使用 `PROVIDER_LIST` 与运行时 `providerStatuses` 合并渲染提供商卡片列表
    - 按 `category` 分组（LLM / 转录），显示认证状态徽章
    - 提供"刷新状态"按钮，加载中时禁用
    - 加载失败时显示错误 banner，所有提供商标记为"状态未知"
    - _需求：1.1、1.2、1.3、1.4、2.2、2.3、2.4、2.5_
  - [x] 7.3 实现 `OnboardSection` 子区块
    - "运行 Onboard 向导"按钮：运行中禁用，完成后自动刷新认证状态
    - "扫描可用模型"按钮：扫描中禁用，成功后展示扫描结果文本
    - 失败时显示包含错误详情的提示（4 秒后自动消失）
    - _需求：3.1、3.2、3.3、3.4、3.5、7.1、7.2、7.3、7.4、7.5_
  - [x] 7.4 实现 `PrimaryModelSection` 子区块
    - 输入框显示当前 `agents.defaults.model.primary` 值，旁边显示格式说明
    - 提交前校验 `isValidModelFormat`，不合法时显示行内错误，阻止提交
    - 保存成功显示成功提示，失败时保留用户输入并显示错误
    - _需求：4.1、4.2、4.3、4.4、4.5、4.6、4.7_
  - [x] 7.5 实现 `FallbacksSection` 子区块
    - 列表展示 `fallbacks` 数组，支持添加和删除操作
    - 添加时校验格式（`isValidModelFormat`）和重复（`addFallback` 幂等逻辑）
    - 删除时调用 `modelsFallbackRemove`，成功后刷新列表
    - _需求：5.1、5.2、5.3、5.4、5.5、5.6_
  - [x] 7.6 实现 `AliasesSection` 子区块
    - 键值对形式展示别名列表，支持添加和删除
    - 添加时校验目标格式，别名已存在时弹出覆盖确认
    - 删除时调用 `modelsAliasRemove`，成功后刷新列表
    - _需求：6.1、6.2、6.3、6.4、6.5、6.6_
  - [x] 7.7 为 SettingsModels 编写单元测试
    - 验证路由注册（sections 数组含 `models` 条目，sectionAccentMap 含 `models` 键）
    - 验证页面挂载后各按钮存在性与初始禁用状态
    - 验证 `modelsStatus` 失败时所有提供商状态为 `unknown`
    - 验证 Onboard/扫描失败时显示错误信息
    - 验证配置写入失败时保留用户输入
    - 测试文件：`src/pages/__tests__/SettingsModels.unit.test.tsx`
    - _需求：2.4、2.5、3.3、3.5、4.6、7.3、7.5、8.1、8.2_

- [x] 8. 最终检查点 — 确保所有测试通过
  - 确保所有测试通过，如有疑问请向用户确认。

## 备注

- 标有 `*` 的子任务为可选项，可在 MVP 阶段跳过
- 每个任务均引用了具体需求条目以保证可追溯性
- 检查点确保增量验证，避免集成阶段出现大量问题
- 属性测试验证普遍性规则，单元测试验证具体示例和边界情况
- 所有 IPC handler 遵循 `{ success: boolean }` 统一约定
