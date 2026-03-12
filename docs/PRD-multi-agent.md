# OpenClaw Desktop - 多Agent管理系统 PRD

**版本**: v1.0  
**日期**: 2026-03-07  
**状态**: 紧急开发中  

---

## 1. 背景与目标

### 1.1 背景
用户需要管理多个 OpenClaw Agent，每个 Agent 有独立的配置、模型、渠道和任务。

### 1.2 目标
- 支持多 Agent 可视化管理
- 统一配置关键文件
- 任务生命周期管理
- 记忆和日志查看

---

## 2. 功能模块

### 2.1 Agent 管理 (P0)

#### 功能列表
- **Agent 列表**: 展示所有 Agent（名称、状态、模型、操作按钮）
- **新增 Agent**: 向导式创建流程
- **删除 Agent**: 确认弹窗后删除
- **启停控制**: 开关控制 Agent 运行状态

#### 数据模型
```typescript
interface Agent {
  id: string;
  name: string;
  status: 'running' | 'stopped' | 'error';
  model: string;
  path: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### 2.2 关键文件编辑 (P0)

#### 文件列表
1. AGENTS.md - 团队通讯录
2. BOOTSTRAP.md - 启动序列
3. HEARTBEAT.md - 心跳上报
4. IDENTITY.md - 核心身份
5. SOUL.md - 价值观
6. TOOLS.md - 工具配置
7. USER.md - 用户画像

#### 功能
- 左侧文件树导航
- 中间 Markdown 编辑器
- 右侧实时预览
- 保存/重置按钮

### 2.3 模型配置 (P1)

#### 配置项
- 模型选择（GPT-4/Claude/Llama等）
- API Key（密码输入）
- 温度参数（滑块 0-2）
- 最大 token 数（滑块）
- 系统提示词（文本域）

### 2.4 多渠道配置 (P1)

#### 渠道列表
- Telegram
- Discord
- Slack
- 飞书
- 微信
- Email

#### 每个渠道配置
- 启用/禁用开关
- Token/API Key
- Webhook URL
- 频道/群组 ID

### 2.5 任务管理 (P0)

#### 功能
- 任务列表（名称、执行 Agent、状态、进度）
- 启动任务
- 停止任务
- 删除任务
- 新增任务（选择执行 Agent）

#### 数据模型
```typescript
interface Task {
  id: string;
  name: string;
  agentId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  createdAt: Date;
}
```

### 2.6 记忆/日志 (P1)

#### 功能
- 记忆搜索
- 记忆时间线查看
- 日志实时查看
- 日志搜索/过滤

---

## 3. UI 风格

### 3.1 设计方向
- **风格**: GitHub Desktop 风格
- **背景**: 白色/浅灰色
- **主色调**: GitHub Blue (#0969DA)
- **设计**: 扁平化，去除渐变

### 3.2 设计规范参考
`design/DESIGN-GitHub-Style-v3.md`

---

## 4. 技术架构

### 4.1 存储
- electron-store 存储 Agent 配置
- 文件系统存储 Agent 文件

### 4.2 IPC 接口
```typescript
// Agent 管理
agent:list => Agent[]
agent:create => Agent
agent:delete => boolean
agent:start => boolean
agent:stop => boolean

// 文件编辑
file:get => string
file:set => boolean

// 任务管理
task:list => Task[]
task:create => Task
task:delete => boolean
task:start => boolean
task:stop => boolean
```

---

## 5. 验收标准

### 5.1 P0 必须完成
- [ ] Agent 列表展示
- [ ] Agent 新增/删除
- [ ] Agent 启停控制
- [ ] 7 个关键文件可编辑
- [ ] 任务列表管理

### 5.2 P1 尽力完成
- [ ] 模型配置
- [ ] 多渠道配置
- [ ] 记忆/日志查看

---

## 6. 里程碑

- **M1**: 今天 20:00 - Agent 管理 + 文件编辑完成
- **M2**: 明天 08:00 - 任务管理 + UI 优化完成，上线

---

*紧急 PRD - 立即开发*
