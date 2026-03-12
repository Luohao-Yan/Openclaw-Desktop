# OpenClaw Desktop - P0/P1 设计补充文档

> 设计交付时间: 2026-03-07  
> 设计师: ux-designer  
> 对应PRD: PRD-v2.0.md

---

## 1. Settings 页面线框图设计

### 1.1 页面布局结构

```
┌─────────────────────────────────────────────────────────────────┐
│  Settings                                        [关闭按钮 X]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 📁 OpenClaw 路径配置                                    │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │                                                         │   │
│  │  当前路径:                                              │   │
│  │  ┌────────────────────────────────────────┐ [浏览]      │   │
│  │  │ ~/.openclaw/                           │ [重置默认]  │   │
│  │  └────────────────────────────────────────┘             │   │
│  │                                                         │   │
│  │  [状态指示灯] ● 已检测到 OpenClaw 安装                   │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 🎨 外观设置                                              │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │                                                         │   │
│  │  主题模式                                               │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐   │   │
│  │  │ ☀️ 浅色  │  │ 🌙 深色  │  │ 🖥️ 跟随系统          │   │   │
│  │  │  ○      │  │  ○      │  │  ○ 选中             │   │   │
│  │  └──────────┘  └──────────┘  └──────────────────────┘   │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ℹ️ 关于                                                  │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │                                                         │   │
│  │  OpenClaw Desktop v0.5.1                                │   │
│  │  构建日期: 2026-03-07                                   │   │
│  │                                                         │   │
│  │  [检查更新]        [查看日志]        [开源协议]         │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 布局规范

| 元素 | 规范 |
|------|------|
| **容器** | 最大宽度 600px, 居中显示, 最小高度 500px |
| **分组卡片** | 圆角 12px, 内边距 24px, 间距 20px |
| **分组标题** | 16px, font-weight 600, 底部边距 16px |
| **输入框** | 高度 40px, 圆角 8px, 右侧操作按钮组间距 8px |
| **主题选项** | 三等分布局, 卡片式选择器, 选中状态带边框高亮 |
| **按钮尺寸** | 高度 36px, 圆角 6px, 内边距 12px 16px |

### 1.3 交互说明

1. **路径配置区域**
   - 输入框只读，点击「浏览」打开系统文件选择器
   - 「重置默认」恢复为 `~/.openclaw/`
   - 路径变更后实时检测状态并更新指示灯
   - 状态指示：● 绿色=已检测, ● 红色=未检测, ○ 灰色=检测中

2. **主题切换**
   - 单选模式，选中项显示主色边框 (primary-500)
   - 切换即时生效，无需重启应用
   - 跟随系统时监听 `prefers-color-scheme` 变化

3. **关于区域**
   - 检查更新：显示 loading → 结果提示
   - 查看日志：打开日志文件所在目录

---

## 2. 图标替换规范

### 2.1 Emoji → Lucide Icons 映射表

| 场景 | 原 Emoji | 替换图标 | Lucide Import | 尺寸建议 |
|------|----------|----------|---------------|----------|
| **播放/启动** | ▶️ | Play | `Play` | 16px |
| **停止** | ⏹️ | Square | `Square` | 16px |
| **刷新/重试** | 🔄 | RotateCw | `RotateCw` | 16px |
| **设置** | ⚙️ | Settings | `Settings` | 20px |
| **列表/任务** | 📋 | ClipboardList | `ClipboardList` | 16px |
| **文档/文件** | 📝 | FileText | `FileText` | 16px |
| **搜索** | 🔍 | Search | `Search` | 16px |
| **确认/成功** | ✅ | Check | `Check` | 16px |
| **关闭/删除** | ❌ | X | `X` | 16px |
| **警告** | ⚠️ | AlertTriangle | `AlertTriangle` | 16px |
| **信息** | ℹ️ | Info | `Info` | 16px |
| **文件夹** | 📁 | Folder | `Folder` | 16px |
| **用户** | 👤 | User | `User` | 16px |
| **退出/登出** | 🚪 | LogOut | `LogOut` | 16px |
| **编辑** | ✏️ | Pencil | `Pencil` | 16px |
| **添加/新建** | ➕ | Plus | `Plus` | 16px |
| **返回** | ◀️ | ChevronLeft | `ChevronLeft` | 16px |
| **更多** | ⋯ | MoreHorizontal | `MoreHorizontal` | 16px |
| **菜单展开** | ▼ | ChevronDown | `ChevronDown` | 16px |
| **侧边栏折叠** | ◀️ | PanelLeftClose | `PanelLeftClose` | 16px |
| **侧边栏展开** | ▶️ | PanelLeftOpen | `PanelLeftOpen` | 16px |

### 2.2 按钮图标规范

```typescript
// 图标按钮组件规范
interface IconButtonProps {
  icon: LucideIcon;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}

// 尺寸映射
const iconSizes = {
  sm: 16,   // 小按钮、行内操作
  md: 20,   // 标准按钮
  lg: 24,   // 大按钮、空状态
};

// 使用示例
import { Play, Settings, Check } from 'lucide-react';

// 操作按钮
<Button><Play size={16} /> 启动</Button>

// 图标按钮
<IconButton icon={Settings} size={20} />

// 状态指示
<Check size={16} className="text-green-500" />
```

### 2.3 状态图标规范

| 状态 | 图标 | 颜色类 | 使用场景 |
|------|------|--------|----------|
| 成功 | CheckCircle | text-green-500 | 操作成功提示 |
| 错误 | XCircle | text-red-500 | 错误提示 |
| 警告 | AlertTriangle | text-yellow-500 | 警告提示 |
| 信息 | Info | text-blue-500 | 信息提示 |
| 加载中 | Loader2 + animate-spin | text-primary | 加载状态 |
| 运行中 | Circle + animate-pulse | text-green-500 | Gateway运行中 |
| 已停止 | Circle | text-gray-400 | Gateway已停止 |

---

## 3. 可折叠侧边栏设计

### 3.1 布局结构

**展开状态 (200px):**
```
┌────────┬─────────────────────────────────────┐
│  ≡     │                                     │
│  Logo  │          主内容区域                  │
│        │                                     │
├────────┤                                     │
│ ◀️ Coll│                                     │
├────────┤                                     │
│ 🏠 Home│                                     │
│        │                                     │
│ 📋 Logs│                                     │
│        │                                     │
│ ⚙️ Sett│                                     │
│        │                                     │
├────────┤                                     │
│        │                                     │
│        │                                     │
├────────┤                                     │
│ 👤 User│                                     │
└────────┴─────────────────────────────────────┘
      ↑
   拖拽调整手柄 (4px)
```

**折叠状态 (60px):**
```
┌────┬─────────────────────────────────────────┐
│ ≡  │                                         │
├────┤                                         │
│ ▶️ │                                         │
├────┤          主内容区域                      │
│ 🏠 │                                         │
├────┤                                         │
│ 📋 │                                         │
├────┤                                         │
│ ⚙️ │                                         │
├────┤                                         │
│    │                                         │
├────┤                                         │
│ 👤 │                                         │
└────┴─────────────────────────────────────────┘
```

### 3.2 尺寸规范

| 状态 | 宽度 | 内容显示 |
|------|------|----------|
| 展开 | 200px | 图标(20px) + 文字(14px), 间距 12px |
| 折叠 | 60px | 仅图标(20px), 水平居中 |
| 拖拽范围 | 60px ~ 300px | 最小折叠宽度 / 最大展开宽度 |
| 拖拽手柄 | 4px宽 | 位于右侧边缘, hover时显示 |

### 3.3 交互说明

**折叠/展开:**
- 折叠按钮位于侧边栏底部上方，点击切换状态
- 展开状态显示「◀️ Collapse」文字按钮
- 折叠状态显示「▶️」图标按钮
- 切换时有过渡动画 300ms ease-in-out

**拖拽调整:**
- 拖拽区域：侧边栏右边缘 4px 宽区域
- 鼠标进入拖拽区域时，光标变为 col-resize
- 拖拽时实时更新宽度
- 释放时若宽度 < 100px，自动吸附到 60px (折叠)
- 释放时若宽度 >= 100px，保持当前宽度 (展开)
- 双击拖拽区域：切换折叠/展开

**Tooltip (折叠状态):**
- 鼠标悬停在图标上显示 Tooltip
- Tooltip 位置：图标右侧居中
- 延迟显示：200ms
- 内容：对应导航项文字

**导航项样式:**
- 高度：44px
- 内边距：12px 16px (展开) / 12px (折叠)
- 悬停背景：bg-muted/50
- 选中状态：
  - 左侧 3px 主色边框
  - 背景：bg-primary/10
  - 图标颜色：text-primary

### 3.4 组件结构

```typescript
// 侧边栏配置
interface SidebarConfig {
  defaultWidth: number;      // 200
  minWidth: number;          // 60 (折叠宽度)
  maxWidth: number;          // 300
  collapseThreshold: number; // 100 (吸附阈值)
}

// 导航项
interface NavItem {
  icon: LucideIcon;          // Lucide 图标组件
  label: string;             // 显示文字
  path: string;              // 路由路径
  shortcut?: string;         // 键盘快捷键
}

// 导航列表
const navItems: NavItem[] = [
  { icon: Home, label: '首页', path: '/', shortcut: '⌘1' },
  { icon: ClipboardList, label: '日志', path: '/logs', shortcut: '⌘2' },
  { icon: Settings, label: '设置', path: '/settings', shortcut: ',' },
];
```

---

## 4. 主题配色CSS变量

### 4.1 CSS 变量定义

```css
/* ========================================
   OpenClaw Desktop - 主题配色变量
   ======================================== */

:root {
  /* ---------- 基础色板 ---------- */
  --slate-50: #f8fafc;
  --slate-100: #f1f5f9;
  --slate-200: #e2e8f0;
  --slate-300: #cbd5e1;
  --slate-400: #94a3b8;
  --slate-500: #64748b;
  --slate-600: #475569;
  --slate-700: #334155;
  --slate-800: #1e293b;
  --slate-900: #0f172a;
  --slate-950: #020617;

  /* ---------- 主色 (Blue-600) ---------- */
  --primary-50: #eff6ff;
  --primary-100: #dbeafe;
  --primary-200: #bfdbfe;
  --primary-300: #93c5fd;
  --primary-400: #60a5fa;
  --primary-500: #3b82f6;
  --primary-600: #2563eb;
  --primary-700: #1d4ed8;
  --primary-800: #1e40af;
  --primary-900: #1e3a8a;

  /* ---------- 语义化颜色 ---------- */
  --success: #22c55e;
  --warning: #f59e0b;
  --danger: #ef4444;
  --info: #3b82f6;
}

/* ========================================
   浅色模式 (默认)
   ======================================== */
:root,
[data-theme="light"] {
  /* 背景色 */
  --bg-primary: #ffffff;
  --bg-secondary: var(--slate-50);
  --bg-tertiary: var(--slate-100);
  --bg-elevated: #ffffff;
  
  /* 卡片/面板 */
  --card-bg: #ffffff;
  --card-border: var(--slate-200);
  --card-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  
  /* 文字颜色 */
  --text-primary: var(--slate-900);
  --text-secondary: var(--slate-600);
  --text-tertiary: var(--slate-400);
  --text-muted: var(--slate-500);
  --text-inverse: #ffffff;
  
  /* 边框 */
  --border-primary: var(--slate-200);
  --border-secondary: var(--slate-100);
  --border-focus: var(--primary-500);
  
  /* 交互状态 */
  --hover-bg: var(--slate-100);
  --active-bg: var(--slate-200);
  --selected-bg: var(--primary-50);
  --selected-border: var(--primary-500);
  
  /* 主按钮 */
  --btn-primary-bg: var(--primary-600);
  --btn-primary-text: #ffffff;
  --btn-primary-hover: var(--primary-700);
  
  /* 次按钮 */
  --btn-secondary-bg: var(--slate-100);
  --btn-secondary-text: var(--slate-700);
  --btn-secondary-hover: var(--slate-200);
  
  /* 输入框 */
  --input-bg: #ffffff;
  --input-border: var(--slate-300);
  --input-focus: var(--primary-500);
  --input-placeholder: var(--slate-400);
  
  /* 侧边栏 */
  --sidebar-bg: var(--slate-50);
  --sidebar-border: var(--slate-200);
  --sidebar-text: var(--slate-600);
  --sidebar-text-active: var(--primary-600);
  
  /* 状态指示 */
  --status-running: var(--success);
  --status-stopped: var(--slate-400);
  --status-error: var(--danger);
  --status-warning: var(--warning);
}

/* ========================================
   深色模式
   ======================================== */
[data-theme="dark"],
.dark {
  /* 背景色 */
  --bg-primary: var(--slate-900);
  --bg-secondary: var(--slate-800);
  --bg-tertiary: var(--slate-700);
  --bg-elevated: var(--slate-800);
  
  /* 卡片/面板 */
  --card-bg: var(--slate-800);
  --card-border: var(--slate-700);
  --card-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  
  /* 文字颜色 */
  --text-primary: var(--slate-100);
  --text-secondary: var(--slate-300);
  --text-tertiary: var(--slate-500);
  --text-muted: var(--slate-400);
  --text-inverse: var(--slate-900);
  
  /* 边框 */
  --border-primary: var(--slate-700);
  --border-secondary: var(--slate-800);
  --border-focus: var(--primary-400);
  
  /* 交互状态 */
  --hover-bg: var(--slate-700);
  --active-bg: var(--slate-600);
  --selected-bg: var(--primary-900);
  --selected-border: var(--primary-400);
  
  /* 主按钮 */
  --btn-primary-bg: var(--primary-600);
  --btn-primary-text: #ffffff;
  --btn-primary-hover: var(--primary-500);
  
  /* 次按钮 */
  --btn-secondary-bg: var(--slate-700);
  --btn-secondary-text: var(--slate-200);
  --btn-secondary-hover: var(--slate-600);
  
  /* 输入框 */
  --input-bg: var(--slate-800);
  --input-border: var(--slate-600);
  --input-focus: var(--primary-400);
  --input-placeholder: var(--slate-500);
  
  /* 侧边栏 */
  --sidebar-bg: var(--slate-800);
  --sidebar-border: var(--slate-700);
  --sidebar-text: var(--slate-400);
  --sidebar-text-active: var(--primary-400);
  
  /* 状态指示 - 深色模式使用更亮的变体 */
  --status-running: #4ade80;
  --status-stopped: var(--slate-500);
  --status-error: #f87171;
  --status-warning: #fbbf24;
}

/* ========================================
   Tailwind 集成
   ======================================== */
/* 在 tailwind.config.js 中引用这些变量 */
```

### 4.2 Tailwind 配置

```javascript
// tailwind.config.js
module.exports = {
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // 使用 CSS 变量
        background: 'var(--bg-primary)',
        foreground: 'var(--text-primary)',
        card: {
          DEFAULT: 'var(--card-bg)',
          foreground: 'var(--text-primary)',
        },
        primary: {
          DEFAULT: 'var(--primary-600)',
          foreground: '#ffffff',
          50: 'var(--primary-50)',
          100: 'var(--primary-100)',
          200: 'var(--primary-200)',
          300: 'var(--primary-300)',
          400: 'var(--primary-400)',
          500: 'var(--primary-500)',
          600: 'var(--primary-600)',
          700: 'var(--primary-700)',
          800: 'var(--primary-800)',
          900: 'var(--primary-900)',
        },
        muted: {
          DEFAULT: 'var(--bg-secondary)',
          foreground: 'var(--text-muted)',
        },
        border: 'var(--border-primary)',
        input: 'var(--input-border)',
        ring: 'var(--border-focus)',
      },
      backgroundColor: {
        primary: 'var(--bg-primary)',
        secondary: 'var(--bg-secondary)',
        tertiary: 'var(--bg-tertiary)',
      },
      textColor: {
        primary: 'var(--text-primary)',
        secondary: 'var(--text-secondary)',
        tertiary: 'var(--text-tertiary)',
        muted: 'var(--text-muted)',
      },
    },
  },
};
```

### 4.3 使用示例

```tsx
// React 组件中使用主题变量

// 卡片
<div className="bg-card border border-border rounded-lg shadow-card">
  <h3 className="text-primary font-semibold">标题</h3>
  <p className="text-secondary">描述文字</p>
</div>

// 按钮
<button className="bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]
               hover:bg-[var(--btn-primary-hover)]">
  主要按钮
</button>

// 输入框
<input className="bg-input-bg border border-input-border 
              focus:border-input-focus rounded-md"
       placeholder="占位符" />

// 状态指示
<span className="text-[var(--status-running)]">● 运行中</span>
<span className="text-[var(--status-stopped)]">● 已停止</span>
```

---

## 附录: 设计实现检查清单

### Settings 页面
- [ ] 路径输入框带浏览/重置按钮
- [ ] 实时状态检测显示
- [ ] 主题切换三选一卡片
- [ ] 关于区域版本信息

### 图标替换
- [ ] 安装 lucide-react
- [ ] 替换所有 emoji 字符
- [ ] 统一图标尺寸规范

### 侧边栏
- [ ] 展开/折叠切换按钮
- [ ] 拖拽调整宽度
- [ ] 折叠状态 Tooltip
- [ ] 选中状态高亮

### 主题
- [ ] CSS 变量定义
- [ ] Tailwind 配置更新
- [ ] 三模式切换逻辑
- [ ] 系统主题监听

---

*文档版本: v1.0*  
*更新时间: 2026-03-07 11:30*
