# OpenClaw Desktop 设计规范

> 版本: 1.0.0  
> 主题: macOS 深色主题风格  
> 更新时间: 2026-03-07

---

## 一、设计概述

### 1.1 设计目标
- **专业感**: 体现开发者工具的专业性与技术感
- **一致性**: 遵循 macOS 原生应用设计语言
- **可读性**: 深色主题下保持信息层次清晰
- **效率**: 关键操作一目了然，减少用户认知负担

### 1.2 设计原则
1. **深色优先**: 所有设计基于深色背景，减少视觉疲劳
2. **层次清晰**: 通过颜色深度和边框区分信息层级
3. **状态明确**: 操作状态、系统状态使用标准色规范
4. **间距一致**: 4px 基准网格系统，保持视觉节奏

---

## 二、颜色系统

### 2.1 基础色板

#### 背景色 (Background)
| Token | 色值 | 用途 |
|-------|------|------|
| `--bg-primary` | `#0F0F10` | 应用主背景 (Slate 950+) |
| `--bg-secondary` | `#18181B` | 卡片、面板背景 (Zinc 900) |
| `--bg-tertiary` | `#27272A` | 输入框、次级面板 (Zinc 800) |
| `--bg-hover` | `#3F3F46` | 悬停状态 (Zinc 700) |
| `--bg-active` | `#52525B` | 激活状态 (Zinc 600) |

#### 文字色 (Text)
| Token | 色值 | 用途 |
|-------|------|------|
| `--text-primary` | `#FAFAFA` | 主标题、重要文字 (Zinc 50) |
| `--text-secondary` | `#A1A1AA` | 正文、描述文字 (Zinc 400) |
| `--text-tertiary` | `#71717A` | 辅助说明、时间戳 (Zinc 500) |
| `--text-disabled` | `#52525B` | 禁用状态 (Zinc 600) |
| `--text-link` | `#60A5FA` | 链接文字 (Blue 400) |

#### 边框色 (Border)
| Token | 色值 | 用途 |
|-------|------|------|
| `--border-primary` | `#3F3F46` | 卡片边框 (Zinc 700) |
| `--border-secondary` | `#27272A` | 分割线、细边框 (Zinc 800) |
| `--border-focus` | `#3B82F6` | 聚焦状态边框 (Blue 500) |

### 2.2 功能色 (Semantic Colors)

#### 状态色
| Token | 色值 | 用途 |
|-------|------|------|
| `--success` | `#22C55E` | 成功、运行中 (Green 500) |
| `--success-bg` | `rgba(34, 197, 94, 0.1)` | 成功状态背景 |
| `--warning` | `#EAB308` | 警告、注意 (Yellow 500) |
| `--warning-bg` | `rgba(234, 179, 8, 0.1)` | 警告状态背景 |
| `--error` | `#EF4444` | 错误、停止 (Red 500) |
| `--error-bg` | `rgba(239, 68, 68, 0.1)` | 错误状态背景 |
| `--info` | `#3B82F6` | 信息、进行中 (Blue 500) |
| `--info-bg` | `rgba(59, 130, 246, 0.1)` | 信息状态背景 |

#### 品牌色
| Token | 色值 | 用途 |
|-------|------|------|
| `--brand-primary` | `#3B82F6` | 主按钮、链接 (Blue 500) |
| `--brand-primary-hover` | `#2563EB` | 主按钮悬停 (Blue 600) |
| `--brand-secondary` | `#6366F1` | 次要品牌色 (Indigo 500) |

### 2.3 日志级别颜色
| Level | 背景色 | 边框色 | 图标 |
|-------|--------|--------|------|
| Error | `rgba(239, 68, 68, 0.15)` | `#DC2626` | 🔴 |
| Warn | `rgba(234, 179, 8, 0.15)` | `#CA8A04` | 🟡 |
| Info | `rgba(59, 130, 246, 0.15)` | `#2563EB` | 🔵 |
| Debug | `rgba(63, 63, 70, 0.5)` | `#52525B` | ⚪ |

---

## 三、字体系统

### 3.1 字体族
```css
--font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
--font-mono: "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace;
```

### 3.2 字号规范
| 层级 | 大小 | 字重 | 行高 | 用途 |
|------|------|------|------|------|
| H1 | 24px | 700 (Bold) | 32px | 页面主标题 |
| H2 | 20px | 600 (Semibold) | 28px | 区块标题 |
| H3 | 16px | 600 (Semibold) | 24px | 卡片标题 |
| Body | 14px | 400 (Regular) | 20px | 正文文字 |
| Small | 13px | 400 (Regular) | 18px | 次要信息 |
| Caption | 12px | 400 (Regular) | 16px | 辅助说明 |
| Mono | 13px | 400 (Regular) | 20px | 代码、ID、时间戳 |

### 3.3 字重规范
| 字重 | Token | 用途 |
|------|-------|------|
| 400 | Regular | 正文、描述 |
| 500 | Medium | 强调文字、按钮 |
| 600 | Semibold | 小标题、标签 |
| 700 | Bold | 大标题、重要数字 |

---

## 四、间距系统

### 4.1 基准网格
以 **4px** 为基准单位，所有间距为 4 的倍数。

| Token | 值 | 用途 |
|-------|-----|------|
| `--space-1` | 4px | 图标与文字间距 |
| `--space-2` | 8px | 紧凑内边距 |
| `--space-3` | 12px | 按钮内边距、表头 |
| `--space-4` | 16px | 卡片内边距、表单字段间距 |
| `--space-5` | 20px | 区块间距 |
| `--space-6` | 24px | 页面内边距 |
| `--space-8` | 32px | 大区块间距 |
| `--space-10` | 40px | 页面主要区块分隔 |

### 4.2 页面布局间距
- **页面内边距**: `24px` (p-6)
- **卡片内边距**: `16px-24px` (p-4 ~ p-6)
- **表单字段间距**: `16px` (space-y-4)
- **按钮组间距**: `8px` (gap-2)
- **列表项间距**: `0px` (通过边框分隔)

### 4.3 组件间距
- **输入框内边距**: `12px 16px`
- **按钮内边距**: `8px 16px` (小) / `12px 24px` (大)
- **表格单元格**: `12px 16px`
- **侧边栏项**: `12px 16px`

---

## 五、圆角系统

| Token | 值 | 用途 |
|-------|-----|------|
| `--radius-sm` | 4px | 按钮、标签、小卡片 |
| `--radius-md` | 6px | 输入框、下拉菜单 |
| `--radius-lg` | 8px | 卡片、面板、模态框 |
| `--radius-xl` | 12px | 大卡片、悬浮面板 |
| `--radius-full` | 9999px | 胶囊按钮、状态标签 |

---

## 六、阴影与效果

### 6.1 阴影
深色主题下阴影用于提升层级，而非模拟光照。

| Token | 值 | 用途 |
|-------|-----|------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.3)` | 按钮、小元素 |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.4)` | 卡片、下拉菜单 |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.5)` | 模态框、悬浮面板 |

### 6.2 效果
| 效果 | 值 | 用途 |
|------|-----|------|
| 脉冲动画 | `animate-pulse` | 运行中状态指示器 |
| 悬停过渡 | `transition-colors duration-150` | 交互元素状态变化 |
| 聚焦环 | `ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-900` | 输入框聚焦 |

---

## 七、组件样式规范

### 7.1 按钮 (Button)

#### 主按钮 (Primary)
```
背景: bg-blue-600
悬停: hover:bg-blue-700
文字: text-white
内边距: px-4 py-2
圆角: rounded-lg (8px)
字重: font-medium
禁用: disabled:opacity-50
```

#### 次按钮 (Secondary)
```
背景: bg-slate-700
悬停: hover:bg-slate-600
文字: text-white
内边距: px-4 py-2
圆角: rounded-lg
边框: border border-slate-600
```

#### 危险按钮 (Danger)
```
背景: bg-red-600
悬停: hover:bg-red-700
文字: text-white
用途: 删除、停止操作
```

#### 成功按钮 (Success)
```
背景: bg-green-600
悬停: hover:bg-green-700
文字: text-white
用途: 启动、确认操作
```

#### 幽灵按钮 (Ghost)
```
背景: transparent
悬停: hover:bg-slate-700
文字: text-slate-300
用途: 次级操作、图标按钮
```

### 7.2 卡片 (Card)

#### 标准卡片
```
背景: bg-slate-800
边框: border border-slate-700
圆角: rounded-lg (8px)
内边距: p-6
阴影: 无 (深色主题不用阴影)
```

#### 状态卡片变体
```
运行中: border-green-600/50 bg-green-900/10
警告: border-yellow-600/50 bg-yellow-900/10
错误: border-red-600/50 bg-red-900/10
```

### 7.3 输入框 (Input)

```
背景: bg-slate-900
边框: border border-slate-700
圆角: rounded-lg
内边距: px-3 py-2
文字: text-white
占位符: placeholder-slate-500
聚焦: focus:outline-none focus:ring-2 focus:ring-blue-500
禁用: disabled:opacity-50 disabled:bg-slate-800
```

### 7.4 表格 (Table)

```
容器: bg-slate-800 rounded-lg border border-slate-700 overflow-hidden
表头: bg-slate-700/50 text-left
表头文字: font-semibold text-slate-300
表头单元格: px-4 py-3
行分隔: border-t border-slate-700
行悬停: hover:bg-slate-700/30
单元格: px-4 py-3
斑马纹: 可选 (even:bg-slate-800/50)
```

### 7.5 标签/徽章 (Badge)

#### 状态标签
```
运行中: bg-green-600 text-white px-2 py-1 rounded text-xs
停止: bg-red-600 text-white px-2 py-1 rounded text-xs
警告: bg-yellow-600 text-white px-2 py-1 rounded text-xs
默认: bg-slate-600 text-white px-2 py-1 rounded text-xs
```

#### 胶囊标签 (带指示点)
```
容器: px-3 py-1 rounded-full text-sm flex items-center gap-2
指示点: w-2 h-2 rounded-full
运行中指示点: bg-green-300 animate-pulse
```

### 7.6 侧边栏导航 (Sidebar)

```
宽度: w-64 (256px)
背景: bg-slate-800
边框: border-r border-slate-700
Logo区: p-4 border-b border-slate-700
导航项: px-4 py-3 rounded-lg mb-1
默认状态: text-slate-300
悬停状态: hover:bg-slate-700
激活状态: bg-blue-600 text-white
图标与文字间距: gap-3
底部版本: p-4 border-t border-slate-700 text-xs text-slate-500
```

### 7.7 分割线 (Divider)

```
水平: border-t border-slate-700
垂直: border-r border-slate-700
```

---

## 八、布局网格系统

### 8.1 页面结构
```
┌─────────────────────────────────────────────────────┐
│  Sidebar (256px)  │  Main Content (flex-1)          │
│                   │                                   │
│  OpenClaw         │  ┌─────────────────────────────┐  │
│  Desktop          │  │  Page Header                │  │
│                   │  └─────────────────────────────┘  │
│  📊 Dashboard     │  ┌─────────────────────────────┐  │
│  ⚙️ Config        │  │                             │  │
│  📋 Tasks         │  │  Content Area               │  │
│  📝 Logs          │  │  (p-6)                      │  │
│                   │  │                             │  │
│  ─────────────    │  └─────────────────────────────┘  │
│  v0.5.1           │                                   │
└─────────────────────────────────────────────────────┘
```

### 8.2 内容区域网格

#### 两列布局 (Dashboard)
```
grid grid-cols-1 lg:grid-cols-2 gap-6
```

#### 全宽表格布局 (Tasks, Logs)
```
单列，表格容器宽度 100%
```

#### 侧边栏 + 内容布局 (Config)
```
左侧: w-64 (分类导航)
右侧: flex-1 (配置表单)
```

### 8.3 响应式断点
| 断点 | 宽度 | 布局变化 |
|------|------|----------|
| sm | 640px | 基础移动端适配 |
| md | 768px | 平板端布局 |
| lg | 1024px | 桌面端标准布局 |
| xl | 1280px | 大屏优化 |

---

## 九、页面线框图描述

### 9.1 Dashboard 页面

**布局结构**:
```
┌──────────────────────────────────────────────────────┐
│ Dashboard                                    [刷新]  │  H1 标题
├──────────────────────────────────────────────────────┤
│  ┌────────────────────┐  ┌────────────────────┐     │
│  │ Gateway Status     │  │ Quick Actions      │     │  第一行: 2列
│  │ ┌────────────────┐ │  │ • View Config      │     │
│  │ │ ● Running      │ │  │ • View Logs        │     │
│  │ │ Uptime: 2h 34m │ │  │ • Refresh Tasks    │     │
│  │ │ Version: 1.0.0 │ │  └────────────────────┘     │
│  │ │ PID: 12345     │ │                             │
│  │ └────────────────┘ │                             │
│  │ [Stop] [Restart]   │                             │
│  └────────────────────┘                             │
│  ┌──────────────────────────────────────────────┐   │
│  │ Recent Sessions                        [刷新] │   │  第二行: 全宽
│  │ ┌──────────────────────────────────────────┐ │   │
│  │ │ ID     │ Agent │ Status │ Model          │ │   │
│  │ ├──────────────────────────────────────────┤ │   │
│  │ │ abc123 │ dev   │ ● run  │ gpt-4          │ │   │
│  │ └──────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

**设计要点**:
- 状态指示器使用脉冲动画的绿色圆点
- 操作按钮按功能色区分: 停止(红)、重启(黄)、启动(绿)
- 最近会话表格使用等宽字体显示 ID
- 卡片内信息层级: 标题 > 状态徽章 > 元数据 > 操作按钮

### 9.2 Config 页面

**布局结构**:
```
┌──────────────────────────────────────────────────────┐
│ Configuration                              [Reset]  │  H1 + 操作
│ Edit OpenClaw settings                               │  描述文字
├──────────────────────────────────────────────────────┤
│  ┌────────────┐  ┌────────────────────────────────┐ │
│  │ 🔑 Env     │  │ Environment                    │ │
│  │ 🤖 Models  │  │ • API_KEY            [*******] │ │
│  │ 🌐 Browser │  │ • BASE_URL           [input  ] │ │
│  │ 🔐 Auth    │  │                                │ │
│  │ ⚙️ System  │  │ [Raw JSON Editor]              │ │
│  └────────────┘  │ ┌──────────────────────────┐   │ │
│                  │ │ {                        │   │ │
│                  │ │   "key": "value"         │   │ │
│                  │ │ }                        │   │ │
│                  │ └──────────────────────────┘   │ │
│                  └────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

**设计要点**:
- 左侧分类导航使用图标 + 文字 + 描述
- 当前选中的分类高亮显示 (bg-blue-600)
- 敏感字段使用 password 类型输入框，并标注 "Sensitive" 标签
- 复杂对象使用 JSON 编辑器展示
- 保存成功/失败使用顶部 Banner 提示

### 9.3 Tasks 页面

**布局结构**:
```
┌──────────────────────────────────────────────────────┐
│ Sessions           [All(10)] [Running(5)] [Stopped]  │  H1 + 筛选
├──────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────┐ │
│ │ ID       │ Name  │ Status │ Agent │ Model │ Act │ │  表头
│ ├──────────────────────────────────────────────────┤ │
│ │ abc123   │ task1 │ ● run  │ dev   │ gpt-4 │ Kill│ │  行1
│ │ def456   │ task2 │ ● run  │ test  │ gpt-3 │ Kill│ │  行2
│ │ ghi789   │ task3 │ ○ stop │ -     │ -     │  -  │ │  行3
│ └──────────────────────────────────────────────────┘ │
│ Total: 10 • Filtered: 5 • Auto-refresh every 5s      │  底部统计
└──────────────────────────────────────────────────────┘
```

**设计要点**:
- 状态筛选器使用按钮组，当前选中项高亮
- 运行中状态使用绿色徽章 + 可点击的 Kill 按钮
- 已停止任务 Kill 按钮隐藏
- ID 列使用等宽字体，最大宽度 200px，超出截断
- 底部显示统计信息

### 9.4 Logs 页面

**布局结构**:
```
┌──────────────────────────────────────────────────────┐
│ Logs            [100行] [搜索...] [☑自动刷新] [刷新]│  H1 + 控制
├──────────────────────────────────────────────────────┤
│ Showing 50 of 100 logs                               │
│ ┌──────────────────────────────────────────────────┐ │
│ │ 14:32:05 🔴 ERROR  Failed to connect to gateway  │ │  错误日志
│ │ 14:32:04 🟡 WARN   Retrying connection...        │ │  警告日志
│ │ 14:32:03 🔵 INFO   Gateway started successfully  │ │  信息日志
│ │ 14:32:02 ⚪ DEBUG  Initializing modules...       │ │  调试日志
│ │ ...                                              │ │
│ └──────────────────────────────────────────────────┘ │
│ Logs from: ~/.openclaw/logs/gateway.log              │
└──────────────────────────────────────────────────────┘
```

**设计要点**:
- 每行日志显示: 时间戳 + 级别图标 + 原始内容
- 不同级别使用不同背景色区分
- 时间戳使用等宽字体，固定宽度
- 日志区域最大高度限制，超出滚动
- 自动刷新使用复选框控制
- 搜索实时过滤，结果显示匹配数

### 9.5 Sidebar 导航

**布局结构**:
```
┌──────────────┐
│ OpenClaw     │  Logo 区
│ Desktop      │
├──────────────┤
│ 📊 Dashboard │  ← 当前激活 (蓝色背景)
│ ⚙️ Config    │
│ 📋 Tasks     │
│ 📝 Logs      │
├──────────────┤
│ v0.5.1 Preview │  版本号
└──────────────┘
```

**设计要点**:
- 宽度固定 256px
- 当前页面导航项使用蓝色背景高亮
- 图标使用 Emoji，与文字间距 12px
- Logo 区域使用蓝色文字强调品牌
- 版本号使用小号灰色文字

---

## 十、Tailwind CSS 配置建议

### 10.1 完整配置
```javascript
// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 基础背景
        'app-bg': '#0F0F10',
        'card-bg': '#18181B',
        'input-bg': '#27272A',
        'hover-bg': '#3F3F46',
        
        // 状态色
        'status-success': '#22C55E',
        'status-warning': '#EAB308',
        'status-error': '#EF4444',
        'status-info': '#3B82F6',
        
        // 品牌色
        'brand': {
          DEFAULT: '#3B82F6',
          hover: '#2563EB',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', 'monospace'],
      },
      fontSize: {
        'h1': ['24px', { lineHeight: '32px', fontWeight: '700' }],
        'h2': ['20px', { lineHeight: '28px', fontWeight: '600' }],
        'h3': ['16px', { lineHeight: '24px', fontWeight: '600' }],
        'body': ['14px', { lineHeight: '20px' }],
        'small': ['13px', { lineHeight: '18px' }],
        'caption': ['12px', { lineHeight: '16px' }],
      },
      spacing: {
        '18': '72px',
        '88': '352px',
      },
      borderRadius: {
        'card': '8px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
}
```

### 10.2 CSS 变量方案 (推荐)
在 `index.css` 中添加：

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  /* 背景 */
  --bg-primary: #0F0F10;
  --bg-secondary: #18181B;
  --bg-tertiary: #27272A;
  --bg-hover: #3F3F46;
  
  /* 文字 */
  --text-primary: #FAFAFA;
  --text-secondary: #A1A1AA;
  --text-tertiary: #71717A;
  --text-disabled: #52525B;
  
  /* 边框 */
  --border-primary: #3F3F46;
  --border-secondary: #27272A;
  
  /* 状态 */
  --color-success: #22C55E;
  --color-warning: #EAB308;
  --color-error: #EF4444;
  --color-info: #3B82F6;
  
  /* 品牌 */
  --color-brand: #3B82F6;
  --color-brand-hover: #2563EB;
}

body {
  background-color: var(--bg-primary);
  color: var(--text-primary);
}

/* 滚动条样式 */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: var(--bg-secondary);
}

::-webkit-scrollbar-thumb {
  background: var(--bg-hover);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #52525B;
}
```

---

## 十一、快速应用指南

### 11.1 立即生效的样式调整
将以下类名应用到现有组件：

**Dashboard 卡片**:
```tsx
<div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
```

**状态标签**:
```tsx
<span className="px-3 py-1 rounded-full text-sm bg-green-600">
  <span className="inline-block w-2 h-2 rounded-full mr-2 bg-green-300 animate-pulse" />
  Running
</span>
```

**按钮样式**:
```tsx
// 主按钮
<button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition-colors disabled:opacity-50">

// 次按钮
<button className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white transition-colors">

// 危险按钮
<button className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white transition-colors">
```

### 11.2 现有代码适配清单

| 文件 | 需调整内容 |
|------|-----------|
| App.tsx | 确认 bg-slate-900 已应用 |
| Dashboard.tsx | 卡片添加 border border-slate-700 |
| Tasks.tsx | 筛选按钮添加圆角和间距 |
| Logs.tsx | 日志行添加级别背景色 |
| Config-v2.tsx | 输入框添加 focus 样式 |
| Sidebar.tsx | 确认激活状态样式 |

---

## 十二、设计交付物清单

✅ **设计规范文档** (本文档)  
✅ **Tailwind 配置建议** (第10章)  
✅ **页面线框图描述** (第9章)  
✅ **颜色系统** (第2章)  
✅ **字体规范** (第3章)  
✅ **组件样式** (第7章)  

---

*设计规范创建完成 - UX Designer*  
*2026-03-07*
