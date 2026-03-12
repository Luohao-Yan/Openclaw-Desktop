# TASK - OpenClaw Desktop Electron 开发

## ⚠️ 关键要求：真实数据，禁止假数据

**必须使用真实的 OpenClaw CLI 调用和真实的文件操作，绝对禁止使用 mock/假数据。**

### Gateway 控制 (必须真实调用 CLI)
```typescript
// ✅ 正确：调用真实的 openclaw 命令
import { execSync, spawn } from 'child_process';

function getGatewayStatus(): 'running' | 'stopped' {
  try {
    execSync('openclaw gateway status', { encoding: 'utf8' });
    return 'running';
  } catch { return 'stopped'; }
}

function startGateway(): boolean {
  try {
    spawn('openclaw', ['gateway', 'start'], { detached: true });
    return true;
  } catch { return false; }
}

function stopGateway(): boolean {
  try { execSync('openclaw gateway stop'); return true; }
  catch { return false; }
}
```

### 配置管理 (必须读写真实文件)
```typescript
// ✅ 正确：读写 ~/.openclaw/config.yaml
import { readFileSync, writeFileSync } from 'fs';
import { parse, stringify } from 'yaml';

const CONFIG_PATH = `${process.env.HOME}/.openclaw/config.yaml`;

function loadConfig() {
  const content = readFileSync(CONFIG_PATH, 'utf8');
  return parse(content);
}

function saveConfig(config: any) {
  // 必须备份原文件
  writeFileSync(`${CONFIG_PATH}.backup`, readFileSync(CONFIG_PATH));
  writeFileSync(CONFIG_PATH, stringify(config));
}
```

### 任务列表 (必须调用真实 CLI)
```typescript
// ✅ 正确：调用 openclaw status 获取真实任务
function getTasks() {
  const output = execSync('openclaw status --json', { encoding: 'utf8' });
  return JSON.parse(output);
}
```

### 日志查看 (必须读取真实日志)
```typescript
// ✅ 正确：读取 ~/.openclaw/logs/gateway.log
function getLogs(lines: number = 100) {
  const LOG_PATH = `${process.env.HOME}/.openclaw/logs/gateway.log`;
  const output = execSync(`tail -n ${lines} ${LOG_PATH}`, { encoding: 'utf8' });
  return output.split('\n').filter(Boolean);
}
```

---

## 项目信息
- **project-name**: `openclaw-desktop`
- **代码目录**: `/Users/yanluohao/.openclaw/workspace-shared/projects/openclaw-desktop/`
- **技术栈**: Electron + React + TypeScript + Tailwind CSS + shadcn/ui
- **平台**: macOS (优先)

## 任务来源
产品方向已调整：从 Web 改为 Electron Mac 桌面端
设计文档已完成 (Markdown 描述)

## 设计参考
- **设计文档**: `/Users/yanluohao/.openclaw/workspace-ux-designer/DESIGN-openclaw-desktop.md`
- **设计系统**: `/Users/yanluohao/.openclaw/workspace-shared/projects/openclaw-web/design/`
- **页面设计**: `design/pages/dashboard.md`, `config.md`, `tasks.md`, `logs.md`

## 验收标准 (必须全部完成)

### Phase 1: 基础架构
- [ ] Electron + React + TypeScript 项目初始化
- [ ] Vite + Electron 集成配置
- [ ] Tailwind CSS + shadcn/ui 配置
- [ ] 侧边导航组件 (Sidebar)
- [ ] 路由配置 (Dashboard, Config, Tasks, Logs, Settings)
- [ ] IPC 通信框架搭建

### Phase 2: 核心功能
- [ ] **Dashboard 仪表板**
  - Gateway 状态显示 (运行中/停止)
  - 启动/停止/重启 Gateway 按钮
  - 最近任务列表 (5个)
  
- [ ] **配置管理页面**
  - 读取 `~/.openclaw/config.yaml`
  - 表单化编辑关键配置 (端口、模型、渠道)
  - 配置验证和保存
  
- [ ] **IPC 实现**
  - `config:get`, `config:set`
  - `gateway:status`, `gateway:start`, `gateway:stop`

### Phase 3: 任务与日志
- [ ] **任务监控页面**
  - 任务列表表格
  - 状态筛选 (全部/运行中/已完成/失败)
  - 终止任务功能
  
- [ ] **日志查看页面**
  - 日志列表显示
  - 级别筛选 (INFO/DEBUG/ERROR)
  - 关键词搜索
  - 日志导出功能

### Phase 4: Polish
- [ ] 深色/浅色主题切换
- [ ] 应用打包配置 (electron-builder)
- [ ] DMG 构建测试

## 技术实现要点

### 配色方案
- 主色: `#3B82F6`
- 背景深色: `#0F172A`
- 侧边栏深色: `#1E293B`

### IPC API 设计
```typescript
// 配置
config:get -> ConfigObject
config:set(config) -> boolean

// Gateway
gateway:status -> Status
gateway:start -> boolean
gateway:stop -> boolean
```

### 项目结构
```
openclaw-desktop/
├── electron/
│   ├── main.ts
│   ├── preload.ts
│   └── ipc/
│       ├── config.ts
│       └── gateway.ts
├── src/
│   ├── components/
│   ├── pages/
│   ├── hooks/
│   └── stores/
└── package.json
```

## 截止时间
**2026-03-13** (7天交付)

## 依赖资源
- 设计文档: 见上文路径
- 参考实现: `openclaw-web` 项目 (M1阶段已完成类似功能)

## 交付物
1. 可运行的 Electron 应用 (`npm run dev`)
2. 打包后的 DMG 文件 (`npm run build:mac`)
3. README.md (使用说明)
4. 代码提交到项目目录

## 检查点
- [ ] Day 2: Phase 1 完成汇报
- [ ] Day 5: Phase 2-3 完成汇报
- [ ] Day 7: 最终交付

---
**分配时间**: 2026-03-06
**负责人**: fullstack-dev
**派发者**: cto-development-director
