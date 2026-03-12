# OpenClaw Desktop 存储方案对比

## 1. 存储需求分析

### 1.1 数据分类
根据数据类型和使用频率，将数据分为以下几类：

| 数据类型 | 数据量 | 访问频率 | 读写比例 | 示例 |
|---------|--------|----------|----------|------|
| **Agent配置** | 小（KB级） | 中（启动/配置时） | 读多写少 | Agent基本信息、模型配置 |
| **配置文件** | 中（MB级） | 高（实时编辑） | 读写均衡 | AGENTS.md、SOUL.md等 |
| **任务状态** | 中（KB-MB级） | 高（实时监控） | 读写均衡 | 任务进度、状态、结果 |
| **系统日志** | 大（GB级） | 中（查询/监控） | 写多读少 | 操作日志、错误日志 |
| **Agent记忆** | 中（MB级） | 低（历史查询） | 读多写少 | 学习记录、经验总结 |
| **用户设置** | 小（KB级） | 低（启动/配置时） | 读多写少 | UI偏好、快捷键 |

### 1.2 性能要求
- **响应时间**: Agent启动<1s，配置保存<100ms
- **并发支持**: 多Agent同时读写
- **数据一致性**: 强一致性要求高
- **可靠性**: 数据不丢失，支持恢复

### 1.3 扩展性要求
- 支持未来Agent数量增长
- 支持插件扩展存储类型
- 支持数据迁移和升级

## 2. 候选方案对比

### 2.1 Electron-Store（基于JSON文件）

#### 优点：
1. **简单易用**: API简单，无需额外依赖
2. **零配置**: 开箱即用
3. **适合小数据**: 对于小型配置数据表现良好
4. **JSON格式**: 人类可读，易于调试
5. **Electron原生**: 与Electron生态集成好

#### 缺点：
1. **性能问题**: 大文件读写慢，每次读写整个文件
2. **并发限制**: 不支持真正的并发读写
3. **扩展性差**: 数据量大时性能急剧下降
4. **数据类型有限**: 只支持基本JSON类型
5. **缺乏查询能力**: 无法进行复杂查询

#### 适用场景：
- 简单的用户设置
- 小型应用状态
- 开发原型阶段

### 2.2 SQLite（嵌入式关系数据库）

#### 优点：
1. **关系型数据**: 结构化数据存储，支持复杂查询
2. **ACID事务**: 保证数据一致性和可靠性
3. **高性能**: 经过优化，支持高效索引和查询
4. **并发支持**: 良好的读写锁机制
5. **存储空间小**: 数据库文件紧凑
6. **成熟稳定**: 经过多年验证，可靠性高

#### 缺点：
1. **学习曲线**: 需要SQL知识
2. **模式迁移**: 数据库模式升级需要小心处理
3. **二进制格式**: 数据文件不可读，调试困难
4. **依赖增加**: 需要引入SQLite库

#### 适用场景：
- 结构化数据存储
- 需要复杂查询
- 数据一致性要求高
- 中等规模数据

### 2.3 混合方案（JSON文件 + SQLite）

#### 设计思路：
结合两种方案的优点，根据不同数据类型选择合适的存储方案。

| 数据类型 | 存储方案 | 理由 |
|---------|----------|------|
| **Agent配置** | SQLite | 需要快速查询、关系型存储 |
| **配置文件** | JSON文件 | 需要人类可读、实时编辑 |
| **任务状态** | SQLite | 需要快速更新、状态查询 |
| **系统日志** | SQLite + 日志文件 | SQLite存储元数据，大文本日志存文件 |
| **Agent记忆** | SQLite | 需要全文搜索、分类查询 |
| **用户设置** | Electron-Store | 简单配置，无需复杂查询 |

## 3. 详细方案设计

### 3.1 数据库模式设计（SQLite）

#### 3.1.1 Agent表
```sql
CREATE TABLE agents (
  id TEXT PRIMARY KEY,               -- UUID v4
  name TEXT NOT NULL UNIQUE,         -- Agent名称
  description TEXT,                  -- 描述
  status TEXT NOT NULL,              -- 运行状态
  model TEXT NOT NULL,               -- AI模型
  model_config JSON,                 -- 模型配置（JSON格式）
  openclaw_path TEXT NOT NULL,       -- OpenClaw路径
  workspace_path TEXT NOT NULL,      -- 工作空间路径
  pid INTEGER,                       -- 进程ID
  last_heartbeat TIMESTAMP,          -- 最后心跳时间
  error_message TEXT,                -- 错误信息
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

-- 索引
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_name ON agents(name);
CREATE INDEX idx_agents_created_at ON agents(created_at);
```

#### 3.1.2 Channel表
```sql
CREATE TABLE channels (
  id TEXT PRIMARY KEY,               -- UUID v4
  agent_id TEXT NOT NULL,            -- 所属Agent
  type TEXT NOT NULL,                -- 渠道类型
  name TEXT NOT NULL,                -- 显示名称
  enabled BOOLEAN NOT NULL DEFAULT 1,
  config JSON NOT NULL,              -- 渠道配置
  connection_status TEXT NOT NULL,    -- 连接状态
  last_connected TIMESTAMP,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX idx_channels_agent_id ON channels(agent_id);
CREATE INDEX idx_channels_type ON channels(type);
CREATE INDEX idx_channels_enabled ON channels(enabled);
```

#### 3.1.3 Task表
```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,               -- UUID v4
  name TEXT NOT NULL,                -- 任务名称
  description TEXT,                  -- 任务描述
  agent_id TEXT NOT NULL,            -- 执行Agent
  agent_name TEXT,                   -- Agent名称（冗余）
  status TEXT NOT NULL,              -- 任务状态
  progress INTEGER NOT NULL DEFAULT 0, -- 进度0-100
  input JSON,                        -- 输入参数
  output JSON,                       -- 输出结果
  error TEXT,                        -- 错误信息
  created_at TIMESTAMP NOT NULL,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  estimated_duration INTEGER,        -- 预计时长（毫秒）
  actual_duration INTEGER,           -- 实际时长（毫秒）
  tags JSON,                         -- 标签数组
  priority INTEGER DEFAULT 5,        -- 优先级0-10
  attempts INTEGER DEFAULT 0,        -- 尝试次数
  max_attempts INTEGER DEFAULT 1,    -- 最大尝试次数
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX idx_tasks_agent_id ON tasks(agent_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_created_at ON tasks(created_at);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_completed_at ON tasks(completed_at);
```

#### 3.1.4 Memory表
```sql
CREATE TABLE memories (
  id TEXT PRIMARY KEY,               -- UUID v4
  agent_id TEXT NOT NULL,            -- 所属Agent
  title TEXT NOT NULL,               -- 记忆标题
  content TEXT NOT NULL,             -- 记忆内容
  summary TEXT,                      -- 摘要
  type TEXT NOT NULL,                -- 记忆类型
  tags JSON,                         -- 标签数组
  task_id TEXT,                      -- 关联任务
  related_memory_ids JSON,           -- 相关记忆ID数组
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  accessed_at TIMESTAMP NOT NULL,    -- 最后访问时间
  importance INTEGER DEFAULT 5,      -- 重要性0-10
  access_count INTEGER DEFAULT 0,    -- 访问次数
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

-- 索引（支持全文搜索）
CREATE INDEX idx_memories_agent_id ON memories(agent_id);
CREATE INDEX idx_memories_type ON memories(type);
CREATE INDEX idx_memories_created_at ON memories(created_at);
CREATE INDEX idx_memories_importance ON memories(importance);
CREATE VIRTUAL TABLE memories_fts USING fts5(
  title, content, summary,
  content=memories,
  content_rowid=rowid
);
```

#### 3.1.5 LogEntry表
```sql
CREATE TABLE log_entries (
  id TEXT PRIMARY KEY,               -- UUID v4
  timestamp TIMESTAMP NOT NULL,      -- 时间戳
  source TEXT NOT NULL,              -- 日志源
  level TEXT NOT NULL,               -- 日志级别
  message TEXT NOT NULL,             -- 日志消息
  data JSON,                         -- 附加数据
  agent_id TEXT,                     -- 相关Agent
  channel_id TEXT,                   -- 相关渠道
  task_id TEXT,                      -- 相关任务
  component TEXT,                    -- 组件名称
  operation TEXT,                    -- 操作名称
  request_id TEXT,                   -- 请求ID
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE SET NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

-- 分区策略：按时间分区，提升查询性能
-- 索引
CREATE INDEX idx_log_entries_timestamp ON log_entries(timestamp);
CREATE INDEX idx_log_entries_level ON log_entries(level);
CREATE INDEX idx_log_entries_source ON log_entries(source);
CREATE INDEX idx_log_entries_agent_id ON log_entries(agent_id);
CREATE INDEX idx_log_entries_component ON log_entries(component);
```

### 3.2 文件系统设计

#### 3.2.1 目录结构
```
~/.openclaw-desktop/
├── config/
│   ├── agents/                      # Agent配置目录
│   │   ├── fullstack-dev/
│   │   │   ├── AGENTS.md
│   │   │   ├── BOOTSTRAP.md
│   │   │   ├── HEARTBEAT.md
│   │   │   ├── IDENTITY.md
│   │   │   ├── SOUL.md
│   │   │   ├── TOOLS.md
│   │   │   └── USER.md
│   │   └── ux-designer/
│   │       └── ...
│   └── app-settings.json           # 应用设置（electron-store）
├── data/
│   └── openclaw.db                 # SQLite数据库
├── logs/
│   ├── app.log                     # 应用日志
│   ├── agent-fullstack-dev.log     # Agent专用日志
│   └── archive/                    # 归档日志
├── backup/
│   └── 2025-01-01_12-00-00.db      # 数据库备份
└── cache/
    └── thumbnails/                 # 缓存文件
```

#### 3.2.2 配置文件存储策略
- **实时同步**: 编辑时实时保存到文件系统
- **版本控制**: 每次保存创建备份版本
- **文件监控**: 监听文件变化，同步到UI
- **冲突处理**: 检测并发编辑，提供冲突解决

### 3.3 混合方案实施

#### 3.3.1 数据访问层设计
```typescript
interface StorageManager {
  // Agent相关
  createAgent(agent: Agent): Promise<Agent>;
  getAgent(id: string): Promise<Agent>;
  updateAgent(id: string, updates: Partial<Agent>): Promise<Agent>;
  deleteAgent(id: string): Promise<boolean>;
  listAgents(filters?: AgentFilters): Promise<Agent[]>;
  
  // 配置文件相关
  getConfigFile(agentId: string, configType: string): Promise<string>;
  saveConfigFile(agentId: string, configType: string, content: string): Promise<void>;
  watchConfigFile(agentId: string, configType: string, callback: FileChangeCallback): () => void;
  
  // 任务相关
  createTask(task: Task): Promise<Task>;
  updateTask(id: string, updates: Partial<Task>): Promise<Task>;
  getTask(id: string): Promise<Task>;
  listTasks(filters?: TaskFilters): Promise<Task[]>;
  
  // 日志相关
  addLogEntry(entry: LogEntry): Promise<void>;
  searchLogs(filters?: LogFilters): Promise<LogEntry[]>;
  streamLogs(callback: LogStreamCallback): () => void;
  
  // 记忆相关
  addMemory(memory: Memory): Promise<Memory>;
  searchMemories(query: string, filters?: MemoryFilters): Promise<Memory[]>;
  
  // 系统操作
  backup(options?: BackupOptions): Promise<BackupResult>;
  restore(backupId: string): Promise<RestoreResult>;
  cleanup(options?: CleanupOptions): Promise<CleanupResult>;
}
```

#### 3.3.2 实施步骤
1. **阶段一**: 实现SQLite数据库层
2. **阶段二**: 实现文件系统配置存储
3. **阶段三**: 实现混合存储管理器
4. **阶段四**: 添加数据迁移工具
5. **阶段五**: 优化性能和缓存

### 3.4 性能优化策略

#### 3.4.1 数据库优化
1. **连接池**: 复用数据库连接
2. **批量操作**: 批量插入/更新日志
3. **索引优化**: 根据查询模式创建合适索引
4. **查询优化**: 避免SELECT *，只查询所需字段
5. **分页查询**: 大结果集使用分页

#### 3.4.2 文件系统优化
1. **异步I/O**: 非阻塞文件操作
2. **内存缓存**: 缓存热点配置文件
3. **增量更新**: 只保存变化部分
4. **压缩存储**: 大文件压缩存储

#### 3.4.3 缓存策略
1. **多级缓存**: 内存缓存 + 磁盘缓存
2. **缓存失效**: 基于时间或事件失效
3. **写回缓存**: 异步写回持久化存储
4. **预加载**: 启动时预加载常用数据

### 3.5 可靠性保障

#### 3.5.1 数据备份
- **自动备份**: 每天自动备份数据库
- **手动备份**: 用户可随时手动备份
- **版本管理**: 配置文件版本管理
- **异地备份**: 可选云备份

#### 3.5.2 恢复机制
- **一键恢复**: 从备份恢复
- **选择性恢复**: 只恢复部分数据
- **回滚机制**: 操作回滚
- **紧急恢复**: 数据库损坏恢复

#### 3.5.3 事务处理
- **ACID保证**: 关键操作使用事务
- **原子操作**: 多个步骤要么全成功要么全失败
- **隔离级别**: 根据需求设置合适隔离级别
- **死锁检测**: 避免资源死锁

### 3.6 扩展性设计

#### 3.6.1 插件系统
支持存储插件，可扩展支持其他数据库：
- PostgreSQL
- MongoDB
- Redis
- 云存储（AWS S3, Azure Blob）

#### 3.6.2 数据迁移
支持数据在不同存储方案间迁移：
- JSON → SQLite
- SQLite → 其他数据库
- 版本升级迁移

#### 3.6.3 监控告警
- 存储空间监控
- 性能指标收集
- 异常告警
- 容量规划

## 4. 方案选择建议

### 4.1 短期方案（MVP阶段）
**混合方案（JSON文件 + SQLite）**

理由：
1. **开发速度快**: 利用现有技术栈
2. **满足需求**: 覆盖所有存储需求
3. **性能可接受**: 中小规模数据量下表现良好
4. **易于调试**: JSON文件可读，SQLite有成熟工具

### 4.2 中期方案（生产环境）
**增强混合方案**

增强点：
1. **数据库优化**: 添加连接池、查询优化
2. **缓存系统**: 添加Redis作为缓存层
3. **监控告警**: 添加存储监控
4. **备份策略**: 完善备份恢复机制

### 4.3 长期方案（大规模部署）
**分布式存储方案**

考虑方向：
1. **主从复制**: SQLite主从集群
2. **分库分表**: 数据水平拆分
3. **对象存储**: 大文件使用对象存储
4. **CDN加速**: 静态资源CDN分发

## 5. 风险评估与缓解

### 5.1 技术风险
| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|----------|
| SQLite性能瓶颈 | 中 | 高 | 监控性能，添加缓存，考虑分库 |
| 文件系统损坏 | 低 | 高 | 定期备份，数据校验，恢复工具 |
| 并发冲突 | 中 | 中 | 乐观锁，冲突检测，用户提示 |
| 数据迁移失败 | 低 | 高 | 回滚机制，测试迁移，增量迁移 |

### 5.2 操作风险
| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|----------|
| 备份失败 | 中 | 中 | 多重备份，监控备份状态 |
| 恢复困难 | 低 | 高 | 恢复演练，详细文档，一键恢复 |
| 磁盘空间不足 | 中 | 高 | 空间监控，自动清理，告警 |
| 权限问题 | 低 | 高 | 权限检查，错误提示，修复工具 |

### 5.3 安全风险
| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|----------|
| 敏感数据泄露 | 中 | 高 | 数据加密，访问控制，审计日志 |
| SQL注入 | 低 | 高 | 参数化查询，输入验证 |
| 文件篡改 | 低 | 高 | 文件签名，权限控制，监控 |
| 拒绝服务 | 低 | 中 | 资源限制，请求限流，监控 |

## 6. 实施计划

### 6.1 阶段一：基础框架（1-2周）
1. SQLite数据库设计
2. 基本CRUD接口实现
3. 配置文件存储机制
4. 基础测试

### 6.2 阶段二：核心功能（2-3周）
1. 文件监控系统
2. 任务管理系统
3. 日志系统
4. 记忆系统

### 6.3 阶段三：优化增强（1-2周）
1. 性能优化
2. 缓存系统
3. 备份恢复
4. 监控告警

### 6.4 阶段四：生产准备（1周）
1. 压力测试
2. 安全审计
3. 文档完善
4. 发布准备

## 7. 结论

**推荐采用混合存储方案**，理由如下：

1. **技术成熟度**: SQLite和文件系统都是成熟技术
2. **成本效益**: 无需额外依赖和运维成本
3. **灵活性**: 可根据数据类型选择最优存储
4. **可扩展性**: 支持未来扩展到其他存储方案
5. **开发效率**: 利用现有工具和库，开发速度快

对于OpenClaw Desktop项目，混合方案能够在满足功能需求的同时，提供良好的性能和可靠性，是最适合的技术选择。