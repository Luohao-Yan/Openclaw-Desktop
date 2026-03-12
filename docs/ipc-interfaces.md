# OpenClaw Desktop IPC接口文档

## 1. IPC架构概述

### 1.1 通信模式
- **主进程（Main Process）**: Electron主进程，负责UI渲染和IPC路由
- **渲染进程（Renderer Process）**: 每个窗口的UI进程，通过IPC与主进程通信
- **Agent进程（Agent Process）**: 每个Agent独立子进程，通过IPC与主进程通信
- **文件系统**: 通过主进程访问本地文件系统

### 1.2 IPC协议
使用Electron的`ipcMain`/`ipcRenderer`，基于事件驱动：
```typescript
// 请求格式
interface IpcRequest {
  id: string;            // 请求ID（用于响应匹配）
  channel: string;       // IPC通道
  action: string;        // 操作类型
  payload: any;          // 请求负载
  timestamp: number;     // 时间戳
}

// 响应格式
interface IpcResponse {
  id: string;            // 对应请求ID
  success: boolean;      // 是否成功
  data?: any;            // 响应数据（成功时）
  error?: string;        // 错误信息（失败时）
  timestamp: number;     // 响应时间戳
}
```

## 2. Agent管理接口

### 2.1 Agent CRUD操作
```typescript
// agent:create - 创建Agent
interface CreateAgentRequest {
  name: string;
  model: string;
  openclawPath: string;
  configFiles: {
    agents: string;
    bootstrap: string;
    heartbeat: string;
    identity: string;
    soul: string;
    tools: string;
    user: string;
  };
  channels?: Channel[];
}

interface CreateAgentResponse {
  agent: Agent;
}

// agent:delete - 删除Agent
interface DeleteAgentRequest {
  agentId: string;
  force?: boolean;      // 是否强制删除运行中的Agent
}

interface DeleteAgentResponse {
  deleted: boolean;
}

// agent:list - 列出所有Agent
interface ListAgentsRequest {
  filters?: {
    status?: Agent['status'];
    name?: string;
    model?: string;
  };
  pagination?: {
    page: number;
    pageSize: number;
  };
}

interface ListAgentsResponse {
  agents: AgentSummary[];
  total: number;
  page: number;
  pageSize: number;
}

// agent:get - 获取Agent详情
interface GetAgentRequest {
  agentId: string;
}

interface GetAgentResponse {
  agent: Agent;
}

// agent:update - 更新Agent
interface UpdateAgentRequest {
  agentId: string;
  updates: Partial<Omit<Agent, 'id' | 'createdAt'>>;
}

interface UpdateAgentResponse {
  agent: Agent;
}
```

### 2.2 Agent生命周期控制
```typescript
// agent:start - 启动Agent
interface StartAgentRequest {
  agentId: string;
  options?: {
    waitForReady?: boolean;    // 是否等待Agent完全就绪
    timeout?: number;          // 超时时间（毫秒）
  };
}

interface StartAgentResponse {
  pid: number;
  status: Agent['status'];
}

// agent:stop - 停止Agent
interface StopAgentRequest {
  agentId: string;
  options?: {
    force?: boolean;          // 是否强制停止
    timeout?: number;         // 超时时间（毫秒）
  };
}

interface StopAgentResponse {
  stopped: boolean;
  previousStatus: Agent['status'];
}

// agent:restart - 重启Agent
interface RestartAgentRequest {
  agentId: string;
  options?: {
    waitForReady?: boolean;
    timeout?: number;
  };
}

interface RestartAgentResponse {
  pid: number;
  status: Agent['status'];
}

// agent:status - 获取Agent状态
interface AgentStatusRequest {
  agentId: string;
}

interface AgentStatusResponse {
  status: Agent['status'];
  pid?: number;
  uptime?: number;           // 运行时长（毫秒）
  memoryUsage?: number;      // 内存使用量（MB）
  cpuUsage?: number;         // CPU使用率（%）
}
```

### 2.3 Agent配置管理
```typescript
// agent:configGet - 获取配置文件内容
interface ConfigGetRequest {
  agentId: string;
  configType: keyof Agent['configFiles'];
}

interface ConfigGetResponse {
  content: string;
  filePath: string;
  lastModified: Date;
}

// agent:configSet - 设置配置文件内容
interface ConfigSetRequest {
  agentId: string;
  configType: keyof Agent['configFiles'];
  content: string;
  options?: {
    backup?: boolean;        // 是否创建备份
    validate?: boolean;      // 是否验证内容
  };
}

interface ConfigSetResponse {
  success: boolean;
  filePath: string;
  backupPath?: string;       // 备份文件路径
}

// agent:configValidate - 验证配置
interface ConfigValidateRequest {
  agentId: string;
  configType: keyof Agent['configFiles'];
  content: string;
}

interface ConfigValidateResponse {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}
```

### 2.4 Agent渠道管理
```typescript
// agent:channelGet - 获取渠道配置
interface ChannelGetRequest {
  agentId: string;
  channelId?: string;      // 不传则获取所有渠道
  channelType?: Channel['type'];
}

interface ChannelGetResponse {
  channels: Channel[];
}

// agent:channelSet - 设置渠道配置
interface ChannelSetRequest {
  agentId: string;
  channel: Channel | Channel[];
}

interface ChannelSetResponse {
  updatedChannels: Channel[];
}

// agent:channelEnable - 启用/禁用渠道
interface ChannelEnableRequest {
  agentId: string;
  channelId: string;
  enabled: boolean;
}

interface ChannelEnableResponse {
  channel: Channel;
}

// agent:channelTest - 测试渠道连接
interface ChannelTestRequest {
  agentId: string;
  channelId: string;
}

interface ChannelTestResponse {
  connected: boolean;
  latency?: number;        // 延迟（毫秒）
  error?: string;
}
```

## 3. 任务管理接口

### 3.1 任务CRUD操作
```typescript
// task:create - 创建任务
interface TaskCreateRequest {
  agentId: string;
  name: string;
  description?: string;
  input?: Record<string, any>;
  options?: {
    priority?: number;
    tags?: string[];
    timeout?: number;
  };
}

interface TaskCreateResponse {
  task: Task;
}

// task:delete - 删除任务
interface TaskDeleteRequest {
  taskId: string;
  force?: boolean;      // 是否强制删除运行中的任务
}

interface TaskDeleteResponse {
  deleted: boolean;
}

// task:list - 列出任务
interface TaskListRequest {
  filters?: {
    agentId?: string;
    status?: Task['status'];
    name?: string;
    tags?: string[];
    createdAfter?: Date;
    createdBefore?: Date;
  };
  pagination?: {
    page: number;
    pageSize: number;
  };
  sort?: {
    field: 'createdAt' | 'priority' | 'name';
    order: 'asc' | 'desc';
  };
}

interface TaskListResponse {
  tasks: Task[];
  total: number;
  page: number;
  pageSize: number;
  stats: TaskStats;
}

// task:get - 获取任务详情
interface TaskGetRequest {
  taskId: string;
}

interface TaskGetResponse {
  task: Task;
  logs?: LogEntry[];     // 关联日志
}

// task:update - 更新任务
interface TaskUpdateRequest {
  taskId: string;
  updates: Partial<Omit<Task, 'id' | 'createdAt'>>;
}

interface TaskUpdateResponse {
  task: Task;
}
```

### 3.2 任务生命周期控制
```typescript
// task:start - 启动任务
interface TaskStartRequest {
  taskId: string;
  options?: {
    waitForCompletion?: boolean;  // 是否等待任务完成
    timeout?: number;             // 超时时间（毫秒）
  };
}

interface TaskStartResponse {
  task: Task;
}

// task:stop - 停止任务
interface TaskStopRequest {
  taskId: string;
  options?: {
    force?: boolean;              // 是否强制停止
    timeout?: number;
  };
}

interface TaskStopResponse {
  stopped: boolean;
  task: Task;
}

// task:pause - 暂停任务
interface TaskPauseRequest {
  taskId: string;
}

interface TaskPauseResponse {
  paused: boolean;
  task: Task;
}

// task:resume - 恢复任务
interface TaskResumeRequest {
  taskId: string;
}

interface TaskResumeResponse {
  resumed: boolean;
  task: Task;
}
```

### 3.3 任务监控
```typescript
// task:progress - 获取任务进度
interface TaskProgressRequest {
  taskId: string;
}

interface TaskProgressResponse {
  progress: number;
  estimatedRemaining?: number;  // 预计剩余时间（毫秒）
}

// task:output - 获取任务输出
interface TaskOutputRequest {
  taskId: string;
  options?: {
    offset?: number;            // 输出偏移量
    limit?: number;             // 输出限制
  };
}

interface TaskOutputResponse {
  output: any;
  truncated?: boolean;          // 是否被截断
}

// task:subscribe - 订阅任务更新
interface TaskSubscribeRequest {
  taskId: string;
  events?: ('progress' | 'status' | 'output' | 'log')[];
}

// 这是一个流式接口，返回Observable或EventEmitter
```

## 4. 记忆/日志接口

### 4.1 记忆管理
```typescript
// memory:search - 搜索记忆
interface MemorySearchRequest {
  agentId?: string;           // 不传则搜索所有Agent
  query?: string;             // 搜索关键词
  filters?: {
    type?: Memory['type'];
    tags?: string[];
    createdAfter?: Date;
    createdBefore?: Date;
    minImportance?: number;
  };
  options?: {
    includeContent?: boolean;  // 是否包含完整内容
    limit?: number;
    offset?: number;
  };
}

interface MemorySearchResponse {
  memories: Memory[];
  total: number;
  suggestedQueries?: string[];
}

// memory:get - 获取记忆详情
interface MemoryGetRequest {
  memoryId: string;
}

interface MemoryGetResponse {
  memory: Memory;
  relatedMemories?: Memory[];  // 相关记忆
}

// memory:create - 创建记忆
interface MemoryCreateRequest {
  agentId: string;
  title: string;
  content: string;
  type: Memory['type'];
  tags?: string[];
  importance?: number;
  taskId?: string;
}

interface MemoryCreateResponse {
  memory: Memory;
}

// memory:update - 更新记忆
interface MemoryUpdateRequest {
  memoryId: string;
  updates: Partial<Omit<Memory, 'id' | 'createdAt'>>;
}

interface MemoryUpdateResponse {
  memory: Memory;
}

// memory:delete - 删除记忆
interface MemoryDeleteRequest {
  memoryId: string;
}

interface MemoryDeleteResponse {
  deleted: boolean;
}
```

### 4.2 日志管理
```typescript
// log:search - 搜索日志
interface LogSearchRequest {
  filters?: {
    level?: LogEntry['level'][];
    source?: LogEntry['source'][];
    agentId?: string;
    channelId?: string;
    taskId?: string;
    component?: string;
    operation?: string;
    startTime?: Date;
    endTime?: Date;
    messageContains?: string;
  };
  options?: {
    limit?: number;
    offset?: number;
    sortBy?: 'timestamp' | 'level';
    sortOrder?: 'asc' | 'desc';
  };
}

interface LogSearchResponse {
  logs: LogEntry[];
  total: number;
  stats?: {
    byLevel: Record<LogEntry['level'], number>;
    bySource: Record<LogEntry['source'], number>;
    byHour?: Record<string, number>;  // 按小时统计
  };
}

// log:stream - 实时日志流
interface LogStreamRequest {
  filters?: {
    level?: LogEntry['level'][];
    source?: LogEntry['source'][];
    agentId?: string;
    component?: string;
  };
  options?: {
    bufferSize?: number;      // 缓冲区大小
    follow?: boolean;        // 是否持续跟随
  };
}

// 这是一个流式接口，返回Observable或EventEmitter
```

// log:export - 导出日志
interface LogExportRequest {
  filters?: LogSearchRequest['filters'];
  format?: 'json' | 'csv' | 'text';
  options?: {
    includeHeaders?: boolean;  // CSV导出时包含表头
    pretty?: boolean;         // JSON格式化
  };
}

interface LogExportResponse {
  filePath: string;
  format: string;
  size: number;
}

// log:cleanup - 清理日志
interface LogCleanupRequest {
  retentionDays?: number;     // 保留天数，默认30
  maxEntries?: number;        // 最大条数限制
}

interface LogCleanupResponse {
  deletedCount: number;
  retainedCount: number;
  freedSpace?: number;        // 释放空间（字节）
}
```

## 5. 系统管理接口

### 5.1 文件监控
```typescript
// file:watch - 监听文件变化
interface FileWatchRequest {
  agentId: string;
  configType: keyof Agent['configFiles'];
  options?: {
    debounceMs?: number;      // 防抖延迟（毫秒）
    ignoreInitial?: boolean;  // 忽略初始变化
  };
}

// 这是一个事件接口，返回文件变化事件
interface FileChangeEvent {
  type: 'created' | 'modified' | 'deleted' | 'renamed';
  filePath: string;
  timestamp: Date;
  content?: string;           // 文件内容（如果可读）
  previousContent?: string;   // 之前的内容
}

// file:unwatch - 取消文件监听
interface FileUnwatchRequest {
  agentId: string;
  configType?: keyof Agent['configFiles'];  // 不传则取消所有监听
}

interface FileUnwatchResponse {
  unwatched: number;          // 取消监听的路径数
}

// file:sync - 同步文件到UI
interface FileSyncRequest {
  agentId: string;
  configType: keyof Agent['configFiles'];
}

interface FileSyncResponse {
  content: string;
  filePath: string;
  lastModified: Date;
  hash: string;              // 文件哈希，用于检测变化
}
```

### 5.2 系统状态
```typescript
// system:health - 系统健康检查
interface SystemHealthRequest {
  components?: ('agents' | 'channels' | 'database' | 'filesystem')[];
}

interface SystemHealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  components: {
    agents: {
      status: 'healthy' | 'degraded' | 'unhealthy';
      running: number;
      total: number;
      errors?: string[];
    };
    channels: {
      status: 'healthy' | 'degraded' | 'unhealthy';
      connected: number;
      total: number;
      errors?: string[];
    };
    database: {
      status: 'healthy' | 'degraded' | 'unhealthy';
      size: number;
      connection: boolean;
      error?: string;
    };
    filesystem: {
      status: 'healthy' | 'degraded' | 'unhealthy';
      freeSpace: number;
      totalSpace: number;
      error?: string;
    };
  };
  uptime: number;            // 系统运行时间（毫秒）
  timestamp: Date;
}

// system:metrics - 系统指标
interface SystemMetricsRequest {
  timeRange?: {
    start: Date;
    end: Date;
  };
  interval?: 'minute' | 'hour' | 'day';
}

interface SystemMetricsResponse {
  cpu: {
    usage: number;           // CPU使用率（%）
    processes: number;
  };
  memory: {
    used: number;            // 已用内存（MB）
    total: number;           // 总内存（MB）
    usage: number;           // 内存使用率（%）
  };
  disk: {
    used: number;            // 已用磁盘（GB）
    total: number;           // 总磁盘（GB）
    iops?: number;           // IOPS
  };
  network: {
    sent: number;            // 发送数据量（KB）
    received: number;        // 接收数据量（KB）
  };
  agents: {
    active: number;
    tasks: {
      pending: number;
      running: number;
      completed: number;
      failed: number;
    };
  };
  timestamp: Date;
}

// system:backup - 系统备份
interface SystemBackupRequest {
  type: 'full' | 'incremental';
  destination?: string;      // 备份目标路径
  options?: {
    includeLogs?: boolean;
    includeConfigs?: boolean;
    includeData?: boolean;
    compress?: boolean;
    password?: string;       // 加密密码
  };
}

interface SystemBackupResponse {
  backupId: string;
  filePath: string;
  size: number;
  timestamp: Date;
  type: string;
}

// system:restore - 系统恢复
interface SystemRestoreRequest {
  backupId: string;
  options?: {
    password?: string;       // 解密密码
    dryRun?: boolean;        // 仅模拟恢复
  };
}

interface SystemRestoreResponse {
  restored: boolean;
  backup: SystemBackupResponse;
  warnings?: string[];
}
```

## 6. 错误处理与验证

### 6.1 错误代码
```typescript
enum ErrorCode {
  // Agent相关错误
  AGENT_NOT_FOUND = 'AGENT_NOT_FOUND',
  AGENT_ALREADY_RUNNING = 'AGENT_ALREADY_RUNNING',
  AGENT_NOT_RUNNING = 'AGENT_NOT_RUNNING',
  AGENT_START_FAILED = 'AGENT_START_FAILED',
  AGENT_STOP_FAILED = 'AGENT_STOP_FAILED',
  
  // Channel相关错误
  CHANNEL_NOT_FOUND = 'CHANNEL_NOT_FOUND',
  CHANNEL_CONFIG_INVALID = 'CHANNEL_CONFIG_INVALID',
  CHANNEL_CONNECTION_FAILED = 'CHANNEL_CONNECTION_FAILED',
  
  // Task相关错误
  TASK_NOT_FOUND = 'TASK_NOT_FOUND',
  TASK_ALREADY_RUNNING = 'TASK_ALREADY_RUNNING',
  TASK_NOT_RUNNING = 'TASK_NOT_RUNNING',
  TASK_CREATE_FAILED = 'TASK_CREATE_FAILED',
  TASK_EXECUTION_FAILED = 'TASK_EXECUTION_FAILED',
  
  // 配置相关错误
  CONFIG_NOT_FOUND = 'CONFIG_NOT_FOUND',
  CONFIG_INVALID = 'CONFIG_INVALID',
  CONFIG_WRITE_FAILED = 'CONFIG_WRITE_FAILED',
  
  // 文件系统错误
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  FILE_READ_FAILED = 'FILE_READ_FAILED',
  FILE_WRITE_FAILED = 'FILE_WRITE_FAILED',
  
  // 系统错误
  DATABASE_ERROR = 'DATABASE_ERROR',
  IPC_ERROR = 'IPC_ERROR',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  
  // 资源错误
  RESOURCE_BUSY = 'RESOURCE_BUSY',
  RESOURCE_LIMIT_EXCEEDED = 'RESOURCE_LIMIT_EXCEEDED',
  TIMEOUT = 'TIMEOUT',
}
```

### 6.2 输入验证
所有接口都需要进行输入验证：
- 类型检查
- 必填字段检查
- 格式验证（如UUID、路径、URL）
- 范围验证（如进度0-100）
- 业务规则验证

### 6.3 错误响应格式
```typescript
interface ErrorResponse {
  code: ErrorCode;
  message: string;
  details?: Record<string, any>;
  timestamp: Date;
  requestId: string;
}
```

## 7. 性能优化建议

### 7.1 批量操作
支持批量创建/更新/删除操作，减少IPC调用次数。

### 7.2 缓存策略
- 配置文件内容缓存
- Agent状态缓存
- 频繁查询结果缓存

### 7.3 流式响应
对于大量数据的接口（如日志搜索），支持分页和流式响应。

### 7.4 异步处理
长时间运行的操作（如备份、恢复）支持异步处理，提供进度反馈。

## 8. 安全性考虑

### 8.1 输入消毒
所有用户输入都需要消毒，防止注入攻击。

### 8.2 权限验证
检查当前用户是否有权限执行操作。

### 8.3 敏感数据保护
API密钥等敏感数据在传输和存储时加密。

### 8.4 速率限制
防止API滥用，实现请求速率限制。