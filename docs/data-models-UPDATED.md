# OpenClaw Desktop 数据模型文档
## 更新时间：2026年3月23日
## 状态：与当前代码实现一致

---

## 1. 核心TypeScript接口定义

### 1.1 Agent相关接口
```typescript

// Agent信息接口（从OpenClaw CLI获取）

interface AgentInfo {
  id: string;                 // Agent唯一标识
  name: string;               // Agent名称
  workspace: string;          // 工作空间路径
  model: string | {           // 模型配置
    primary: string;          // 主模型
    fallbacks?: string[];     // 备用模型列表
  };

  agentDir?: string;          // Agent目录路径（可选）

  workspaceRoot?: string;     // 工作空间根目录（可选）

  agentConfigRoot?: string;   // Agent配置根目录（可选）

  configSource?: 'workspace' | 'agents' | 'workspace+agents' | 'config-only';

}



// Agent性能指标

interface AgentPerformanceMetrics {
  cpuUsage: number;          // CPU使用率（0-100%）

  memoryUsage: number;       // 内存使用量（MB）

  tokensPerSecond: number;   // Token处理速度（tokens/秒）

  responseTime: number;      // 平均响应时间（秒）

  errorRate: number;         // 错误率（0-100%）

  uptime: number;            // 运行时间（秒）

  sessionCount: number;      // 活跃会话数

  totalMessages: number;     // 总消息数

  lastUpdated: string;       // 最后更新时间（ISO 8601）

}



// Agent增强功能

interface AgentEnhancementFeature {
  id: string;                                    // 增强功能唯一标识
  name: string;                                  // 显示名称

  type: 'performance' | 'security' | 'monitoring' | 'integration' | 'automation' | 'utility';
  description: string;                           // 功能描述

  enabled: boolean;                              // 是否启用

  settings: Record<string, any>;                 // 功能设置参数

  status: 'active' | 'inactive' | 'error';       // 运行状态

  dependencies?: string[];                       // 依赖的其他增强功能ID

}
```



### 1.2 渠道配置接口
```typescript

// 渠道配置字段

interface ChannelField {
  id: string;                 // 字段唯一标识
  label: string;              // 字段显示标签

  placeholder: string;        // 输入框占位提示

  type: 'password' | 'text' | 'info';  // 输入类型

  required: boolean;          // 是否必填

}



// 渠道配置

interface ChannelConfig<F extends readonly ChannelField[] = ChannelField[]> {
  key: string;                // 渠道唯一标识

  label: string;              // 渠道显示名称

  hint: string;               // 配置提示信息

  tokenLabel: string;         // Token输入框标签（兼容旧逻辑）

  enabled: boolean;           // 是否启用该渠道

  token: string;              // 渠道凭证Token（兼容旧逻辑）

  fieldValues: Record<F[number]['id'], string>;  // 渠道各字段的值映射

  fields: F;                  // 渠道专属输入字段定义

  testStatus: 'idle' | 'testing' | 'ok' | 'error';  // 连接测试状态

  testError?: string;         // 连接测试失败时的错误信息

  cliHint?: string;           // CLI添加命令模板

}



// 渠道添加结果

interface ChannelAddResult {
  channelKey: string;         // 渠道标识

  channelLabel: string;       // 渠道显示名称

  success: boolean;           // CLI命令是否执行成功

  output?: string;            // CLI标准输出

  error?: string;             // 错误信息

  accountId?: string;         // 对应的Account_ID

}
```



### 1.3 任务和Cron作业接口
```typescript

// Cron调度计划

interface CronScheduleAt {
  kind: 'at';

  at: string;

  tz?: string;

}



interface CronScheduleEvery {
  kind: 'every';

  every: string;

}



interface CronScheduleCron {
  kind: 'cron';

  cron: string;

  tz?: string;

  stagger?: string;

}



type CronScheduleDraft = CronScheduleAt | CronScheduleEvery | CronScheduleCron;



// Cron作业负载

interface CronPayloadSystemEvent {
  kind: 'systemEvent';

  text: string;

  mode?: 'now' | 'next-heartbeat';

}



interface CronPayloadAgentTurn {
  kind: 'agentTurn';

  message: string;

  model?: string;

  thinking?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

  timeoutSeconds?: number;

  channel?: string;

  to?: string;

  deliver?: boolean;

  announce?: boolean;

  lightContext?: boolean;

  sessionId?: string;

  bestEffort?: boolean;

}



type CronPayloadDraft = CronPayloadSystemEvent | CronPayloadAgentTurn;



// Cron作业草稿

interface CronJobDraft {
  name: string;

  description?: string;

  agentId?: string | null;

  enabled?: boolean;

  sessionTarget?: 'main' | 'isolated';

  wakeMode?: 'now' | 'next-heartbeat';

  deleteAfterRun?: boolean;

  schedule: CronScheduleDraft;

  payload: CronPayloadDraft;

}
```



### 1.4 技能管理接口
```typescript

// 技能信息

interface SkillInfo {
  id: string;                 // 技能唯一标识

  name: string;               // 技能显示名称

  description: string;        // 技能描述

  version: string;            // 版本号

  author: string;             // 作者



  category: string;           // 分类



  status: 'installed' | 'available' | 'updatable' | 'error';  // 技能状态



  installedAt?: string;       // 安装时间

  updatedAt?: string;         // 更新时间

  size?: number;              // 文件大小

  dependencies?: string[];    // 依赖列表

  rating?: number;            // 评分

  downloads?: number;         // 下载数

  enabled: boolean;           // 是否启用

  path?: string;              // 技能目录路径

  eligible?: boolean;         // 是否满足安装条件

  missingRequirements?: string[];  // 缺失的依赖项



  source?: 'custom' | 'clawhub' | 'bundled' | 'plugin';  // 技能来源



  emoji?: string;             // Emoji图标



  isCustom?: boolean;         // 是否为自定义技能

}



// 插件信息

interface PluginInfo {
  id: string;
  name: string;
  version: string;
  status: 'enabled' | 'loaded' | 'disabled' | 'error';  // 插件状态

  description?: string;
  path?: string;
  skills?: string[];
  origin?: 'bundled' | 'global' | string;  // 插件来源

}
```



### 1.5 模型配置接口
```typescript

// 提供商认证状态

type ProviderAuthStatus = 'authenticated' | 'unauthenticated' | 'unknown';



// 模型状态结果

interface ModelsStatusResult {
  success: boolean;
  providers: Record<string, ProviderAuthStatus>;  // 提供商认证状态

  error?: string;
}



// 模型配置结果

interface ModelsConfigResult {
  success: boolean;
  primary?: string;  // 当前主模型（provider/model格式）



  fallbacks?: string[];  // 备用模型列表



  configuredModels?: Record<string, { alias?: string; [key: string]: any }>;  // 已配置的模型

  providers?: Record<string, {  // 自定义提供商配置

    baseUrl?: string;

    apiKey?: string;

    api?: string;

    models?: Array<{ id: string; name: string; [key: string]: any }>;

    [key: string]: any;

  }>;

  error?: string;
}



// 模型别名

interface ModelAlias {
  alias: string;     // 别名名称

  target: string;    // 目标provider/model

}
```



---

## 2. IPC通信流程



### 2.1 Agent管理流程

```
1. UI发起请求 (React Component)

   ↓

2. IPC调用 (ipcRenderer.send)

   ↓

3. Main进程处理 (electron/ipc/agents.ts)

   ↓

4. 执行CLI命令 (child_process.spawn)

   ↓

5. 解析CLI输出

   ↓

6. 包装为结构响应

   ↓

7. IPC返回结果

   ↓

8. UI更新状态
```



### 2.2 渠道连接流程
```
1. 用户输入渠道配置

   ↓

2. 启动连接测试

   ↓

3. 调用 openclaw channels test

   ↓

4. 解析测试结果

   ↓

5. 显示连接状态
```



---

## 3. 数据验证规则



### 3.1 Agent配置验证（OpenClaw CLI层面）

- `name`: 必填，长度3-50字符，只允许字母、数字、连字符

- `workspace`: 必须是有效路径，可写权限

- `model`: 必须符合 OpenClaw 模型格式（provider/model）

- `configFiles`: 配置文件路径必须存在



### 3.2 渠道配置验证（IPC层面）

- `key`: 必须是支持的渠道类型（telegram、discord、slack等）

- `fieldValues`: 根据字段定义验证必填字段

- `token`: 渠道凭证格式验证（如Bot Token格式）



### 3.3 输入验证（UI层面）

- 路径输入验证（是否存在、是否可写）

- API密钥格式验证（长度、字符集）

- 模型选择验证（可用性、权限）

- 表单数据完整性检查



---

## 4. 配置管理策略



### 4.1 OpenClaw配置管理

- **核心配置**: `openclaw.json` 管理（通过 coreConfig IPC）

- **Agent配置**: 每个Agent的独立配置文件和工作区

- **应用配置**: `electron-store` 存储桌面应用设置



### 4.2 版本兼容性

- **OpenClaw CLI版本**: 检查兼容性，处理版本差异

- **配置文件格式**: 支持向后兼容的配置迁移

- **环境变量**: 运行时环境变量管理



### 4.3 备份和恢复

- **配置导出**: 支持Agent配置导出为加密文件（.ocagent）

- **配置导入**: 导入加密配置，自动安装依赖

- **工作区备份**: Agent工作区文件备份和恢复

- **迁移支持**: 跨版本和跨环境的配置迁移



---

## 5. 性能考虑



### 5.1 CLI命令执行优化

- **异步执行**: 非阻塞的CLI命令执行

- **超时控制**: 设置合理的命令执行超时

- **输出缓冲**: 流式读取CLI输出，避免内存溢出

- **并发限制**: 控制同时执行的CLI命令数量



### 5.2 缓存策略

- **配置缓存**: OpenClaw配置的本地缓存

- **状态缓存**: Agent、Gateway等状态的缓存

- **模型缓存**: 模型列表和状态的缓存

- **技能缓存**: 技能信息的缓存



### 5.3 响应优化

- **增量更新**: 只更新发生变化的数据

- **懒加载**: 按需加载资源和数据

- **预加载**: 预测性数据预加载

- **分页处理**: 大数据集的分页加载



---

## 6. 安全考虑



### 6.1 敏感数据保护

- **API密钥**: 通过OpenClaw的安全机制存储

- **环境变量**: 安全的进程环境变量管理

- **配置文件**: 权限控制和加密选项

- **传输安全**: IPC通信的安全传输



### 6.2 访问控制

- **文件系统权限**: 限制对敏感路径的访问

- **CLI命令限制**: 验证和执行安全的CLI命令

- **环境隔离**: 不同Agent的环境隔离

- **沙箱执行**: CLI命令的安全执行环境



### 6.3 审计和日志

- **操作审计**: 记录所有关键操作

- **错误跟踪**: 详细的错误日志和调试信息

- **安全事件**: 记录安全相关事件

- **性能监控**: 监控系统性能和安全状态



---

## 附录：代码实现位置



### A.1 核心TypeScript类型定义

- **位置**: `src/types/`

- **关键文件**:

  - `electron.ts` - Electron IPC 接口定义

  - `setup.ts` - 引导流程类型定义

  - `desktopRuntime.ts` - 运行时信息接口



### A.2 IPC模块实现

- **位置**: `electron/ipc/`

- **关键模块**:

  - `agents.ts` - Agent 管理 (L94,295)

  - `channels.ts` - 渠道管理 (L124,095)

  - `models.ts` - 模型配置管理 (L122,818)

  - `coreConfig.ts` - 核心配置管理 (L289,132)

  - `gateway.ts` - Gateway 管理 (L141,088)



### A.3 前端页面组件

- **位置**: `src/pages/`

- **关键组件**:

  - `Dashboard.tsx` - 仪表板

  - `Agents.tsx` - Agent 管理页面

  - `Settings.tsx` - 设置页面

  - `Tasks.tsx` - 任务管理页面

  - `Logs.tsx` - 日志查看页面



### A.4 配置管理实现

- **应用配置**: `electron-store` (在 `electron/ipc/settings.ts` 中管理)

- **核心配置**: `openclaw.json` (通过 `electron/ipc/coreConfig.ts` 管理)

- **Agent配置**: 通过 `openclaw agents` 命令和 `electron/ipc/agents.ts` 管理