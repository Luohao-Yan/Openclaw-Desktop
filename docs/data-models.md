# OpenClaw Desktop 数据模型文档

## 1. 核心实体定义

### 1.1 Agent 实体
```typescript
interface Agent {
  // 基础信息
  id: string;                    // UUID v4
  name: string;                 // Agent名称（如：fullstack-dev）
  description?: string;         // 可选描述
  
  // 状态管理
  status: 'running' | 'stopped' | 'error' | 'starting' | 'stopping';
  pid?: number;                 // 进程ID（运行时）
  lastHeartbeat?: Date;         // 最后心跳时间
  errorMessage?: string;        // 错误信息（status为error时）
  
  // AI模型配置
  model: string;                // 模型标识（如：dashscope/deepseek-v3.2）
  modelConfig: {
    temperature?: number;       // 温度参数
    maxTokens?: number;         // 最大token数
    topP?: number;             // Top-P采样
    systemPrompt?: string;      // 系统提示词
    apiKey?: string;           // API密钥（加密存储）
  };
  
  // 路径配置
  openclawPath: string;         // OpenClaw安装路径
  workspacePath: string;        // 工作空间路径
  
  // 配置文件
  configFiles: {
    agents: string;            // AGENTS.md路径
    bootstrap: string;         // BOOTSTRAP.md路径
    heartbeat: string;         // HEARTBEAT.md路径
    identity: string;          // IDENTITY.md路径
    soul: string;              // SOUL.md路径
    tools: string;             // TOOLS.md路径
    user: string;              // USER.md路径
  };
  
  // 渠道配置
  channels: Channel[];
  
  // 元数据
  createdAt: Date;
  updatedAt: Date;
  version: number;             // 版本号，用于乐观锁
}

// 扩展：Agent配置概览（用于列表展示）
interface AgentSummary {
  id: string;
  name: string;
  status: Agent['status'];
  model: string;
  channels: string[];         // 启用的渠道类型
  createdAt: Date;
  lastActivity?: Date;
}
```

### 1.2 Channel 实体
```typescript
interface Channel {
  id: string;                 // 渠道唯一ID
  type: 'telegram' | 'discord' | 'slack' | 'feishu' | 'wechat' | 'email';
  name: string;              // 渠道显示名称
  enabled: boolean;          // 是否启用
  
  // 渠道配置（类型安全）
  config: {
    // 通用配置
    token?: string;          // API Token（加密）
    webhookUrl?: string;     // Webhook URL
    apiUrl?: string;         // API端点
    
    // Telegram特定
    telegram?: {
      botToken: string;
      chatId?: string;
    };
    
    // Discord特定
    discord?: {
      botToken: string;
      guildId?: string;
      channelId?: string;
    };
    
    // Slack特定
    slack?: {
      botToken: string;
      signingSecret?: string;
      channel?: string;
    };
    
    // 飞书特定
    feishu?: {
      appId: string;
      appSecret: string;
      verificationToken?: string;
      encryptKey?: string;
    };
    
    // 微信特定
    wechat?: {
      appId: string;
      appSecret: string;
      token?: string;
      encodingAESKey?: string;
    };
    
    // Email特定
    email?: {
      smtpHost: string;
      smtpPort: number;
      username: string;
      password: string;
      fromAddress: string;
      toAddresses: string[];
    };
  };
  
  // 连接状态
  connectionStatus: 'connected' | 'disconnected' | 'error';
  lastConnected?: Date;
  
  // 元数据
  createdAt: Date;
  updatedAt: Date;
}
```

### 1.3 Task 实体
```typescript
interface Task {
  id: string;                 // UUID v4
  name: string;              // 任务名称
  description?: string;      // 任务描述
  
  // 关联信息
  agentId: string;           // 执行Agent的ID
  agentName?: string;        // Agent名称（冗余，便于查询）
  
  // 状态管理
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;          // 进度（0-100）
  
  // 任务输入/输出
  input?: Record<string, any>;      // 任务输入参数
  output?: Record<string, any>;     // 任务输出结果
  error?: string;                   // 错误信息
  
  // 时间信息
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  estimatedDuration?: number;      // 预计时长（毫秒）
  actualDuration?: number;         // 实际时长（毫秒）
  
  // 元数据
  tags?: string[];           // 标签
  priority?: number;         // 优先级（0-10）
  attempts: number;          // 尝试次数（用于重试）
  maxAttempts?: number;      // 最大尝试次数
}

// 扩展：任务统计
interface TaskStats {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  averageDuration?: number;
}
```

### 1.4 Memory 实体（Agent记忆）
```typescript
interface Memory {
  id: string;                 // 记忆ID
  agentId: string;           // 所属Agent
  
  // 内容
  title: string;             // 记忆标题
  content: string;           // 记忆内容（Markdown格式）
  summary?: string;          // 摘要（AI生成）
  
  // 分类
  type: 'task' | 'learning' | 'insight' | 'reference' | 'error';
  tags?: string[];
  
  // 关联
  taskId?: string;           // 关联的任务ID
  relatedMemoryIds?: string[]; // 相关记忆ID
  
  // 时间信息
  createdAt: Date;
  updatedAt: Date;
  accessedAt: Date;          // 最后访问时间
  
  // 元数据
  importance: number;        // 重要性评分（0-10）
  accessCount: number;       // 访问次数
}
```

### 1.5 Log 实体（系统日志）
```typescript
interface LogEntry {
  id: string;                 // 日志ID
  timestamp: Date;           // 时间戳
  
  // 源信息
  source: 'agent' | 'channel' | 'task' | 'system';
  agentId?: string;          // 相关Agent
  channelId?: string;        // 相关渠道
  taskId?: string;          // 相关任务
  
  // 日志内容
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  message: string;           // 日志消息
  data?: any;               // 附加数据（结构化）
  
  // 上下文
  component?: string;        // 组件名称
  operation?: string;        // 操作名称
  requestId?: string;        // 请求ID（用于跟踪）
}
```

## 2. 关系模型

```
Agent (1) --- (n) Channel
    | (1)
    | (n)
   Task (1) --- (n) LogEntry
    |
    | (0..1)
   Memory
```

## 3. 数据验证规则

### 3.1 Agent 验证
- `name`: 必填，长度3-50字符，只允许字母、数字、连字符
- `status`: 必须是预定义状态之一
- `model`: 必填，支持模型白名单验证
- `openclawPath`: 必填，必须是有效路径
- `configFiles`: 所有配置文件路径必须存在

### 3.2 Channel 验证
- `type`: 必须是支持的类型之一
- `config`: 根据类型验证必需字段
- `enabled`: 布尔值

### 3.3 Task 验证
- `name`: 必填，长度1-100字符
- `agentId`: 必填，必须是有效的Agent ID
- `status`: 必须是预定义状态之一
- `progress`: 0-100之间的整数

## 4. 数据迁移策略

### 4.1 版本控制
每个实体都有`version`字段，用于乐观锁控制。

### 4.2 向后兼容
- 新增字段默认值处理
- 字段重命名时的数据迁移
- 删除字段的数据清理

### 4.3 备份恢复
- 定期自动备份
- 支持手动备份/恢复
- 备份文件版本化

## 5. 性能考虑

### 5.1 索引策略
- Agent: `id` (主键), `name` (唯一), `status`
- Channel: `id` (主键), `agentId`, `type`
- Task: `id` (主键), `agentId`, `status`, `createdAt`
- Memory: `id` (主键), `agentId`, `type`, `createdAt`
- LogEntry: `id` (主键), `timestamp`, `level`, `agentId`

### 5.2 查询优化
- 分页查询支持
- 常用查询预索引
- 缓存热点数据

### 5.3 数据清理
- LogEntry: 自动清理30天前的日志
- Task: 保留最近1000个任务，其余归档
- Memory: 重要性评分低的记忆可清理

## 6. 安全考虑

### 6.1 敏感数据加密
- API密钥加密存储
- 数据库连接信息加密
- 用户密码哈希存储

### 6.2 访问控制
- 角色基于访问控制（RBAC）
- 操作审计日志
- 会话管理

### 6.3 数据隔离
- 每个Agent数据独立
- 跨Agent数据访问限制
- 环境隔离（开发/测试/生产）