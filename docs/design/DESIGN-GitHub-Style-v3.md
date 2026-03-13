# OpenClaw Desktop - GitHub 风格 UI 设计规范 v3.0

> 基于用户新增需求：禁用蓝紫渐变，采用 GitHub Desktop 风格
> 设计目标：白色/浅灰背景、扁平化设计、专业工具风格、蓝色主色调

---

## 1. 设计语言

**风格**: GitHub Desktop 风格 (Flat Professional)

**参考应用**:
- GitHub Desktop (专业工具风格)
- VS Code (开发者工具)
- Figma (简洁专业)
- Notion (扁平化)

---

## 2. 设计令牌 (Design Tokens)

### 2.1 颜色系统

#### 主色调 - GitHub Blue
```css
/* GitHub Blue 主色调 */
--color-primary: #0969DA;        /* 主按钮、链接 */
--color-primary-hover: #0550AE; /* 主按钮悬停 */
--color-primary-light: #DDF4FF;  /* 浅蓝背景 */
--color-primary-emphasis: #1F883D; /* 强调色-成功 */

/* 中性色 - 灰度 */
--gray-50: #F6F8FA;      /* 页面背景 */
--gray-100: #EAEEF2;     /* 卡片背景 */
--gray-200: #D0D7DE;     /* 边框 */
--gray-300: #AFB8C1;     /* 禁用状态 */
--gray-400: #6E7781;     /* 次要文字 */
--gray-500: #57606A;     /* 正文 */
--gray-600: #424A53;     /* 标题 */
--gray-700: #24292F;     /* 主要文字 */
--gray-800: #1B1F24;     /* 深色背景 */
--gray-900: #0D1117;     /* 最深背景 */

/* 功能色 */
--color-success: #1F883D;   /* 成功/运行中 */
--color-success-bg: #DAFBE1;
--color-warning: #BF8700;   /* 警告 */
--color-warning-bg: #FFF8C5;
--color-danger: #CF222E;   /* 错误/停止 */
--color-danger-bg: #FFEBE9;
--color-info: #0969DA;      /* 信息 */
--color-info-bg: #DDF4FF;

/* 背景层级 */
--bg-page: #FFFFFF;           /* 页面主背景 */
--bg-canvas: #F6F8FA;         /* 画布/侧边栏 */
--bg-card: #FFFFFF;          /* 卡片背景 */
--bg-input: #F6F8FA;          /* 输入框背景 */
--bg-hover: #F3F4F6;          /* 悬停背景 */
--bg-active: #E8EBEF;         /* 激活背景 */
--bg-overlay: rgba(0, 0, 0, 0.5); /* 遮罩层 */

/* 边框颜色 */
--border-default: #D0D7DE;
--border-muted: #EAEEF2;
--border-emphasis: #8B949E;
```

#### 文本颜色
```css
--text-primary: #24292F;    /* 主要文字 */
--text-secondary: #57606A; /* 次要文字 */
--text-tertiary: #6E7781;   /* 辅助文字 */
--text-link: #0969DA;      /* 链接 */
--text-link-hover: #0550AE;
--text-placeholder: #8B949E;
--text-disabled: #8B949E;
```

### 2.2 字体系统

```css
/* 字体族 - 与 GitHub 一致 */
--font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
--font-mono: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace;

/* 字号 - GitHub 标准 */
--text-xs: 0.75rem;      /* 12px - 标签 */
--text-sm: 0.8125rem;    /* 13px - 小字/表格 */
--text-base: 0.875rem;   /* 14px - 正文 */
--text-md: 0.9375rem;    /* 15px - 副标题 */
--text-lg: 1.125rem;     /* 18px - 页面标题 */
--text-xl: 1.375rem;     /* 22px - 大标题 */

/* 字重 */
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;

/* 行高 */
--leading-tight: 1.25;
--leading-normal: 1.5;
--leading-relaxed: 1.625;
```

### 2.3 间距系统

```css
/* 基础间距 - 基于 8px */
--space-1: 0.25rem;   /* 4px */
--space-2: 0.5rem;    /* 8px */
--space-3: 0.75rem;   /* 12px */
--space-4: 1rem;      /* 16px */
--space-5: 1.25rem;   /* 20px */
--space-6: 1.5rem;    /* 24px */
--space-8: 2rem;      /* 32px */
--space-10: 2.5rem;   /* 40px */
--space-12: 3rem;     /* 48px */

/* 组件内边距 */
--padding-button: 0.5rem 1rem;    /* 8px 16px */
--padding-card: 1rem 1.5rem;      /* 16px 24px */
--padding-input: 0.5rem 0.75rem;  /* 8px 12px */
--padding-modal: 1.5rem 2rem;    /* 24px 32px */
--padding-page: 2rem;             /* 32px */
```

### 2.4 圆角系统

```css
/* 圆角 - GitHub 风格 - 偏小圆角 */
--radius-sm: 4px;       /* 4px - 小按钮/标签 */
--radius-md: 6px;        /* 6px - 输入框/小卡片 */
--radius-lg: 8px;        /* 8px - 卡片/面板 */
--radius-xl: 12px;       /* 12px - 大卡片/模态框 */
--radius-full: 9999px;   /* 全圆角 */
```

### 2.5 阴影系统

```css
/* 扁平化风格 - 轻微阴影 */
--shadow-sm: 0 1px 0 rgba(27, 31, 35, 0.04);
--shadow-md: 0 1px 1px rgba(27, 31, 35, 0.1);
--shadow-lg: 0 3px 6px rgba(27, 31, 35, 0.12);
--shadow-xl: 0 8px 24px rgba(27, 31, 35, 0.15);
--shadow-modal: 0 8px 28px rgba(27, 31, 35, 0.15);

/* 无阴影用于扁平化元素 */
--shadow-none: none;
```

---

## 3. 组件设计

### 3.1 Button (按钮)

**Primary Button (主按钮)**:
```jsx
// 蓝色主按钮
className="px-4 py-1.5 bg-[#0969DA] text-white text-sm font-medium rounded-md
           hover:bg-[#0550AE] hover:text-white
           active:bg-[#0550AE] active:scale-[0.98]
           transition-colors duration-200
           disabled:opacity-50 disabled:cursor-not-allowed"
```

**Secondary Button (次按钮)**:
```jsx
// 白色边框按钮
className="px-4 py-1.5 bg-white text-[#24292F] text-sm font-medium rounded-md
           border border-[#D0D7DE] border-solid
           hover:bg-[#F3F4F6] hover:border-[#8B949E]
           active:bg-[#E8EBEF]
           transition-colors duration-200"
```

**Tertiary Button (文字按钮)**:
```jsx
// 纯文字按钮
className="px-3 py-1 text-[#0969DA] text-sm font-medium rounded-md
           hover:bg-[#DDF4FF]
           active:bg-[#D0D7DE]
           transition-colors duration-200"
```

**Icon Button (图标按钮)**:
```jsx
className="p-1.5 text-[#57606A] rounded-md
           hover:bg-[#F3F4F6] hover:text-[#24292F]
           active:bg-[#E8EBEF]
           transition-colors duration-200"
```

### 3.2 Card (卡片)

**基础卡片**:
```jsx
className="bg-white border border-[#D0D7DE] rounded-lg p-4
           hover:border-[#8B949E] hover:shadow-sm
           transition-all duration-200"
```

**状态卡片**:
```jsx
// 运行中 - 绿色边框
className="bg-white border-l-4 border-l-[#1F883D] rounded-lg p-4
           hover:shadow-md transition-all duration-200"

// 错误 - 红色边框
className="bg-white border-l-4 border-l-[#CF222E] rounded-lg p-4
           hover:shadow-md transition-all duration-200"

// 停止 - 灰色边框
className="bg-white border-l-4 border-l-[#6E7781] rounded-lg p-4
           hover:shadow-md transition-all duration-200"
```

### 3.3 Input (输入框)

**文本输入框**:
```jsx
className="w-full px-3 py-1.5 bg-[#F6F8FA] text-[#24292F] text-sm
           border border-[#D0D7DE] rounded-md
           placeholder:text-[#8B949E]
           focus:bg-white focus:border-[#0969DA] focus:ring-1 focus:ring-[#0969DA]
           focus:outline-none
           transition-all duration-200"
```

**密码输入框**:
```jsx
// 带眼睛图标的密码框
className="w-full px-3 py-1.5 pr-10 bg-[#F6F8FA] text-[#24292F] text-sm
           border border-[#D0D7DE] rounded-md
           focus:bg-white focus:border-[#0969DA] focus:ring-1 focus:ring-[#0969DA]
           focus:outline-none"
```

### 3.4 Switch (开关) - GitHub 风格

```jsx
// 容器
className="relative inline-flex h-6 w-11 items-center rounded-full
           cursor-pointer select-none
           bg-[#D0D7DE] transition-colors duration-200
           data-[checked=true]:bg-[#1F883D]"

// 滑块
className="inline-block h-5 w-5 transform rounded-full bg-white shadow-sm
           transition-transform duration-200
           translate-x-0.5 data-[checked=true]:translate-x-1.5"
```

### 3.5 Modal (模态框)

```jsx
// 遮罩层
className="fixed inset-0 z-50 flex items-center justify-center p-4
           bg-[rgba(0,0,0,0.5)] backdrop-blur-sm"

// 弹窗主体
className="relative w-full max-w-lg bg-white rounded-lg shadow-modal
           border border-[#D0D7DE]"
```

### 3.6 Select / Dropdown (下拉选择框)

```jsx
className="w-full px-3 py-1.5 bg-[#F6F8FA] text-[#24292F] text-sm
           border border-[#D0D7DE] rounded-md
           appearance-none cursor-pointer
           focus:bg-white focus:border-[#0969DA] focus:ring-1 focus:ring-[#0969DA]
           focus:outline-none
           bg-[url('data:image/svg+xml;base64,...')] bg-no-repeat bg-right"
```

### 3.7 Slider (滑块)

```jsx
// 轨道
className="w-full h-2 bg-[#D0D7DE] rounded-full"

// 滑块填充
className="h-2 bg-[#0969DA] rounded-full"

// 滑块手柄
className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-[#0969DA] 
           rounded-full shadow-sm cursor-pointer
           hover:scale-110 active:scale-95"
```

### 3.8 Table (表格)

```jsx
// 表头
className="bg-[#F6F8FA] text-left text-xs font-semibold text-[#24292F]
           uppercase tracking-wider"

// 单元格
className="px-4 py-2 text-sm text-[#24292F] border-b border-[#EAEEF2]"

// 悬停行
className="hover:bg-[#F6F8FA] transition-colors duration-150"
```

### 3.9 Tag / Badge (标签)

```jsx
// 成功标签
className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
           bg-[#DAFBE1] text-[#1F883D]"

// 警告标签
className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
           bg-[#FFF8C5] text-[#BF8700]"

// 错误标签
className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
           bg-[#FFEBE9] text-[#CF222E]"

// 信息标签
className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
           bg-[#DDF4FF] text-[#0969DA]"
```

---

## 4. 页面设计

### 4.1 布局结构

```
┌─────────────────────────────────────────────────────────────────┐
│  ┌─────┬───────────────────────────────────────────────────┐   │
│  │     │                                                    │   │
│  │  S  │                                                    │   │
│  │  I  │                                                    │   │
│  │  D  │              主内容区域                            │   │
│  │  E  │                                                    │   │
│  │  B  │                                                    │   │
│  │  A  │                                                    │   │
│  │  R  │                                                    │   │
│  │     │                                                    │   │
│  └─────┴───────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘

侧边栏宽度: 220px
主内容区: 自适应
页面内边距: 24px (1.5rem)
```

### 4.2 Sidebar (侧边栏)

```
┌─────────────────────┐
│ OpenClaw Desktop    │
├─────────────────────┤
│ 📊 Dashboard        │
│ 👥 Agents    [+ ]   │
│ 📝 Files            │
│ 🤖 Models           │
│ 📢 Channels         │
│ 📋 Tasks            │
│ 📜 Logs             │
├─────────────────────┤
│ ⚙️ Settings         │
│ ❓ Help              │
└─────────────────────┘
```

**设计要点**:
- 简洁图标 + 文字
- 选中状态: 左侧边框 + 浅蓝背景
- 悬停: 浅灰背景
- 底部固定设置入口

---

## 5. 页面线框图

### 5.1 多 Agent 管理页面 (P0)

```
┌─────────────────────────────────────────────────────────────────┐
│  👥 Agents                                        [+ New Agent] │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐│
│  │  [Avatar]       │  │  [Avatar]       │  │  [Avatar]       ││
│  │  Agent Name     │  │  Agent Name     │  │  Agent Name     ││
│  │  ● Running      │  │  ○ Stopped      │  │  ● Running      ││
│  │  Model: GPT-4   │  │  Model: Claude  │  │  Model: GPT-4   ││
│  │                 │  │                 │  │                 ││
│  │  [Edit] [Delete]│  │  [Edit] [Delete]│  │  [Edit] [Delete]││
│  └─────────────────┘  └─────────────────┘  └─────────────────┘│
│                                                                  │
│  ┌─────────────────┐                                          │
│  │  [+ Add Agent]  │  ← 空白状态或添加按钮                     │
│  └─────────────────┘                                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Agent 卡片详情弹窗**:
```
┌─────────────────────────────────────────────────────────────────┐
│  ✕                                                                  │
│                                                                  │
│  Agent Configuration                                              │
│  ─────────────────────────────────────────────────────────────   │
│                                                                  │
│  Name        [________________________]                        │
│                                                                  │
│  Description [________________________]                        │
│                  (可选)                                          │
│                                                                  │
│  Model        [GPT-4o              ▼]                          │
│                                                                  │
│  System Prompt                                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                             ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  Status    [●] Enabled     [ ] Disabled                        │
│                                                                  │
│                              [Cancel]  [Save Agent]             │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 文件编辑器页面 (P0)

```
┌─────────────────────────────────────────────────────────────────┐
│  📝 Files: workspace-ux-designer                    [Save]    │
│                                              [Reset] [Format]  │
├──────────────┬──────────────────────────────┬─────────────────┤
│ 📁 workspace │  # AGENTS.md                                        │
│  ├─ AGENTS.md │  ─────────────────────────────────────────────   │
│  ├─ USER.md   │                                                      │
│  ├─ SOUL.md   │  # AGENTS.md - Your Workspace                     │
│  ├─ TOOLS.md  │                                                      │
│  ├─ MEMORY.md │  _你是 ux-designer：体验标准...                     │
│  └─ HEARTBEAT │                                                      │
│               │                                                      │
│               │                                                      │
│               │                                                      │
├──────────────┼──────────────────────────────────────────────────┤
│              │  Preview                                              │
│              │  ─────────────────────────────────────────────────   │
│              │                                                      │
│              │  AGENTS.md - Your Workspace                         │
│              │  ═══════════════════════════                         │
│              │                                                      │
│              │  你是 ux-designer：体验标准，负责设计稿...            │
│              │                                                      │
│              │                                                      │
└──────────────┴──────────────────────────────────────────────────┘
```

**布局说明**:
- 左侧文件树: 200px 宽度
- 中间编辑器: Flex 1，自适应
- 右侧预览: 40% 宽度
- 分隔线: 可拖拽调整宽度

### 5.3 模型配置页面 (P1)

```
┌─────────────────────────────────────────────────────────────────┐
│  🤖 Model Configuration                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Provider                                                     ││
│  │ ─────────────────────────────────────────────────────────   ││
│  │                                                              ││
│  │  Model        [Select Model                            ▼] ││
│  │                                                              ││
│  │  API Key      [•••••••••••••••••••••••••] [👁]              ││
│  │                                                              ││
│  │  Base URL     [https://api.openai.com/v1         ]         ││
│  │              (Optional, for custom endpoints)              ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Parameters                                                   ││
│  │ ─────────────────────────────────────────────────────────   ││
│  │                                                              ││
│  │  Temperature   0.7                                        ││
│  │  [──────────●──────────]  Range: 0 - 2                     ││
│  │                                                              ││
│  │  Max Tokens   4000                                        ││
│  │  [────────────●────]     Range: 1 - 128000                  ││
│  │                                                              ││
│  │  Top P        1.0                                         ││
│  │  [──────────●──────────]                                    ││
│  │                                                              ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ System Prompt (Default)                                      ││
│  │ ─────────────────────────────────────────────────────────   ││
│  │ ┌─────────────────────────────────────────────────────────┐ ││
│  │ │ You are a helpful AI assistant.                         │ ││
│  │ │                                                         │ ││
│  │ │ Current context:                                        │ ││
│  │ │ - Time: {time}                                          │ ││
│  │ │ - Date: {date}                                           │ ││
│  │ │                                                         │ ││
│  │ └─────────────────────────────────────────────────────────┘ ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│                              [Reset to Defaults] [Save Config]  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.4 多渠道配置页面 (P1)

```
┌─────────────────────────────────────────────────────────────────┐
│  📢 Channels Configuration                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │  💬 Feishu   │  │  📧 Email    │  │  🔗 Webhook  │        │
│  │              │  │              │  │              │        │
│  │  [ON ] OFF   │  │  [ON ] OFF   │  │  [ ON] OFF   │        │
│  │              │  │              │  │              │        │
│  │  [Configure] │  │  [Configure] │  │  [Configure] │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐                           │
│  │  💬 Telegram │  │  🔔 Discord  │                           │
│  │              │  │              │                           │
│  │  [ON ] OFF   │  │  [ON ] OFF   │                           │
│  │              │  │              │                           │
│  │  [Configure] │  │  [Configure] │                           │
│  └──────────────┘  └──────────────┘                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**渠道配置弹窗 (以 Feishu 为例)**:
```
┌─────────────────────────────────────────────────────────────────┐
│  ✕  Feishu Configuration                                        │
│                                                                  │
│  ─────────────────────────────────────────────────────────────   │
│                                                                  │
│  App ID     [________________________]                        │
│                                                                  │
│  App Secret [________________________] [👁]                   │
│                                                                  │
│  Verify Token [________________________]                      │
│                                                                  │
│  ─────────────────────────────────────────────────────────────   │
│                                                                  │
│  [ ] Enable Event Subscription                                │
│                                                                  │
│  Webhook URL: https://open.feishu.cn/...                      │
│                                                                  │
│                              [Cancel]  [Save Configuration]    │
└─────────────────────────────────────────────────────────────────┘
```

### 5.5 任务管理页面 (P0)

```
┌─────────────────────────────────────────────────────────────────┐
│  📋 Tasks                                             [+ Task] │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Name            │ Agent        │ Status      │ Actions       │
│  ────────────────┼──────────────┼─────────────┼────────────── │
│  Morning Report  │ cto-dev-dir  │ ● Running   │ [■] [🗑]      │
│  Daily Standup  │ product-lead │ ○ Stopped   │ [▶] [■] [🗑]  │
│  Weekly Summary  │ fullstack    │ ○ Stopped   │ [▶] [■] [🗑]  │
│  Feishu Sync    │ user-resear.. │ ● Running   │ [■] [🗑]      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

状态标签说明:
● Running = 绿色标签 [Running]
○ Stopped = 灰色标签 [Stopped]
⚠ Error = 红色标签 [Error]
```

**新增任务弹窗**:
```
┌─────────────────────────────────────────────────────────────────┐
│  ✕  New Task                                                   │
│                                                                  │
│  ─────────────────────────────────────────────────────────────   │
│                                                                  │
│  Task Name  [________________________]                        │
│                                                                  │
│  Agent      [Select Agent                          ▼]         │
│                                                                  │
│  Schedule   [Cron Expression                      ▼]          │
│                ┌────────────────────────────────────────────┐  │
│                │ Every day at 9:00 AM          ☐             │  │
│                │ Every Monday at 9:00 AM       ☑             │  │
│                │ Custom cron expression...                  │  │
│                └────────────────────────────────────────────┘  │
│                                                                  │
│  Description [________________________]                        │
│                  (可选)                                         │
│                                                                  │
│                              [Cancel]  [Create Task]           │
└─────────────────────────────────────────────────────────────────┘
```

### 5.6 记忆/日志页面 (P1)

```
┌─────────────────────────────────────────────────────────────────┐
│  📜 Logs & Memory                    [🔍 Search...]  [Filter ▼] │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Filters                                                      ││
│  │ ─────────────────────────────────────────────────────────   ││
│  │                                                              ││
│  │  Date Range: [Today          ▼]                             ││
│  │  Level:      [All Levels     ▼]  (Debug/Info/Warn/Error)   ││
│  │  Agent:      [All Agents     ▼]                            ││
│  │                                                              ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ─────────────────────────────────────────────────────────────   │
│                                                                  │
│  Today                                                          │
│  ─────────────────────────────────────────────────────────────   │
│                                                                  │
│  16:42:31 [INFO ] [cto-development-director]                  │
│           Session started for cto-development-director         │
│                                                                  │
│  16:42:15 [INFO ] [gateway]                                    │
│           Gateway connection established                        │
│                                                                  │
│  16:40:02 [WARN ] [feishu-channel]                             │
│           Rate limit approaching, 80% used                     │
│                                                                  │
│  16:38:45 [ERROR] [task-scheduler]                              │
│           Task "Daily Standup" failed: Connection timeout       │
│                                                                  │
│  16:35:22 [DEBUG] [memory]                                      │
│           Memory cleanup: 128 items pruned                      │
│                                                                  │
│  ─────────────────────────────────────────────────────────────   │
│                                                                  │
│  Yesterday                                                      │
│  ─────────────────────────────────────────────────────────────   │
│                                                                  │
│  ...                                                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**日志终端风格**:
```
┌─────────────────────────────────────────────────────────────────┐
│  16:42:31.123 [INFO ] cto-development-director │ Session start │
│  16:42:31.456 [DEBUG] memory-manager         │ Load 24 items  │
│  16:42:32.789 [INFO ] gateway                │ Connected      │
│  16:42:33.012 [INFO ] channel/feishu         │ Message sent   │
│  16:42:35.234 [WARN ] rate-limiter           │ 80% used       │
│  16:42:40.567 [ERROR] task-executor          │ Timeout        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. 交互说明

### 6.1 通用交互规则

| 交互 | 效果 |
|------|------|
| 按钮悬停 | 背景色变化，轻微缩放 (scale 1.02) |
| 按钮点击 | 缩放 (scale 0.98)，100ms 动画 |
| 卡片悬停 | 边框颜色加深，轻微阴影 |
| 输入框聚焦 | 边框变蓝 + 蓝色光晕 |
| 开关切换 | 滑块滑动 + 背景色变化，200ms |
| 模态框打开 | 淡入 + 放大，200ms |
| 模态框关闭 | 淡出 + 缩小，150ms |

### 6.2 页面切换动画

```css
/* 页面淡入 */
@keyframes pageFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.page-enter {
  animation: pageFadeIn 200ms ease-out;
}
```

### 6.3 加载状态

**骨架屏**:
```css
.skeleton {
  background: linear-gradient(90deg, #EAEEF2 25%, #F3F4F6 50%, #EAEEF2 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}
```

### 6.4 响应式断点

```css
/* 桌面 */
@media (min-width: 1024px) {
  .sidebar { width: 220px; }
  .content { margin-left: 220px; }
}

/* 平板 */
@media (max-width: 1023px) {
  .sidebar { width: 60px; }
  .sidebar-text { display: none; }
}

/* 移动 */
@media (max-width: 768px) {
  .sidebar { display: none; }
  .mobile-nav { display: flex; }
}
```

---

## 7. 实现检查清单

### 7.1 设计风格
- [ ] 白色/浅灰背景
- [ ] 扁平化设计，无蓝紫渐变
- [ ] GitHub 蓝色主色调
- [ ] 小圆角 (4-8px)

### 7.2 页面
- [ ] 多 Agent 管理页面 (P0)
- [ ] 文件编辑器页面 (P0)
- [ ] 模型配置页面 (P1)
- [ ] 多渠道配置页面 (P1)
- [ ] 任务管理页面 (P0)
- [ ] 记忆/日志页面 (P1)

### 7.3 组件
- [ ] 按钮 (Primary/Secondary/Tertiary)
- [ ] 卡片 (基础/状态)
- [ ] 输入框 (文本/密码)
- [ ] 开关 (GitHub 风格)
- [ ] 下拉选择框
- [ ] 滑块
- [ ] 表格
- [ ] 标签/徽章
- [ ] 模态框

### 7.4 交互
- [ ] 按钮悬停/点击效果
- [ ] 输入框聚焦效果
- [ ] 开关动画
- [ ] 模态框动画
- [ ] 页面切换动画

---

**文档版本**: v3.0
**创建时间**: 2026-03-07
**设计师**: ux-designer
**截止时间**: 2026-03-07 18:00