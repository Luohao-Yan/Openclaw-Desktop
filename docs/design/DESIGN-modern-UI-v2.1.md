# OpenClaw Desktop - 现代化 UI/UX 设计规范 v2.1
> 基于实际实现更新，与当前代码完全匹配
> 设计目标：现代化、专业、符合C端用户审美
---
## 1. 设计语言
**风格**: 现代极简主义 (Modern Minimalism)
**参考应用**:
- Linear (简洁专业)
- Vercel Dashboard (现代科技感)
- Raycast (macOS 原生风格)
- Arc Browser (创新界面)
---
## 2. 设计令牌 (Design Tokens)
### 2.1 颜色系统
#### 深色模式 (Dark Mode)
```css
/* 背景层级 - 从深到浅 */
--app-bg: #0A0A0F;               /* 最深层背景 - 深邃黑 */
--app-bg-elevated: #12121A;      /* 卡片/面板背景 */
--app-bg-subtle: rgba(255, 255, 255, 0.04); /* 轻微背景 */
/* 渐变背景 - 主色调蓝绿渐变 */
--bg-gradient-primary: linear-gradient(135deg, #00B4FF 0%, #00E08E 100%);
--bg-gradient-accent: linear-gradient(135deg, rgba(0, 180, 255, 0.18) 0%, rgba(0, 224, 142, 0.10) 100%);
--bg-gradient-glow: radial-gradient(ellipse at top, #1e3a5f 0%, transparent 50%);
/* 主点缀色 - 蓝绿系 */
--accent-blue: #00B4FF;
--accent-green: #00E08E;
--accent-purple: #A855F7;
/* 文本颜色 */
--app-text: #FFFFFF;
--app-text-muted: #A1A1AA;
--app-text-secondary: #71717A;
/* 边框颜色 */
--app-border: rgba(255, 255, 255, 0.08);
--app-active-border: rgba(0, 180, 255, 0.22);
```
#### 浅色模式 (Light Mode)
```css
/* 背景层级 */
--app-bg: #F8FAFC;
--app-bg-elevated: #FFFFFF;
--app-bg-subtle: rgba(15, 23, 42, 0.03);
/* 渐变背景 */
--bg-gradient-primary: linear-gradient(135deg, #00B4FF 0%, #00E08E 100%);
--bg-gradient-accent: linear-gradient(135deg, rgba(0, 180, 255, 0.12) 0%, rgba(0, 224, 142, 0.10) 100%);
/* 文本颜色 */
--app-text: #0F172A;
--app-text-muted: #475569;
/* 边框颜色 */
--app-border: rgba(15, 23, 42, 0.08);
--app-active-border: rgba(0, 180, 255, 0.18);
```
### 2.2 字体系统
```css
/* 字体族 */
--font-display: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-body: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', monospace;
/* 字号 */
--text-xs: 0.75rem;      /* 12px - 标签/次要信息 */
--text-sm: 0.875rem;     /* 14px - 正文/辅助信息 */
--text-base: 1rem;       /* 16px - 主要文本 */
--text-lg: 1.125rem;     /* 18px - 小标题 */
--text-xl: 1.25rem;      /* 20px - 页面标题 */
--text-2xl: 1.5rem;      /* 24px - 大标题 */
/* 字重 */
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;
```
### 2.3 间距系统
```css
/* 基础间距 - 基于 4px */
--space-1: 0.25rem;   /* 4px */
--space-2: 0.5rem;    /* 8px */
--space-3: 0.75rem;   /* 12px */
--space-4: 1rem;      /* 16px */
--space-6: 1.5rem;    /* 24px */
--space-8: 2rem;      /* 32px */
```
### 2.4 圆角系统
```css
/* 圆角 - 大圆角营造柔和现代感 */
--radius-sm: 6px;       /* 6px - 小按钮/标签 */
--radius-md: 10px;      /* 10px - 输入框/小卡片 */
--radius-lg: 14px;      /* 14px - 卡片/面板 */
--radius-xl: 20px;      /* 20px - 大卡片/模态框 */
--radius-2xl: 28px;     /* 28px - 特色区域 */
--radius-full: 9999px;  /* 全圆角 - 胶囊按钮/头像 */
```
### 2.5 阴影系统
```css
/* 柔和层次阴影 - 增加深度感 */
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
--shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
--shadow-glow-blue: 0 0 20px rgba(0, 180, 255, 0.3);
--shadow-glow-green: 0 0 20px rgba(0, 224, 142, 0.3);
/* 玻璃拟态效果 */
--glass-bg: rgba(255, 255, 255, 0.05);
--glass-border: rgba(255, 255, 255, 0.1);
--glass-blur: blur(12px);
```
### 2.6 过渡与动效
```css
/* 过渡时间 */
--transition-fast: 150ms;
--transition-normal: 200ms;
--transition-page: 300ms;
/* 缓动函数 */
--ease-out-back: cubic-bezier(0.34, 1.56, 0.64, 1);
--ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);
```
---
## 3. 组件设计规范 (与实现完全匹配)
### 3.1 Button (按钮)
**Primary Button**:
```css
.btn-primary {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.625rem 1.25rem;
  font-weight: 500;
  border-radius: var(--radius-lg);
  color: white;
  background: linear-gradient(135deg, #00B4FF 0%, #00E08E 100%);
  transition: all var(--transition-normal) var(--ease-smooth);
  overflow: hidden;
}
.btn-primary::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 50%);
  opacity: 0;
  transition: opacity var(--transition-normal);
}
.btn-primary:hover {
  transform: scale(1.02);
  box-shadow: 0 10px 25px -5px rgba(0, 180, 255, 0.35);
}
.btn-primary:hover::before {
  opacity: 1;
}
.btn-primary:active {
  transform: scale(0.98);
}
```
**Secondary Button**:
```css
.btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.625rem 1.25rem;
  font-weight: 500;
  border-radius: var(--radius-lg);
  color: rgba(255, 255, 255, 0.9);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: all var(--transition-normal) var(--ease-smooth);
}
.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
}
.btn-secondary:active {
  transform: scale(0.98);
}
```
### 3.2 卡片组件
**基础卡片**:
```css
.card-modern {
  position: relative;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-xl);
  padding: 1.5rem;
  transition: all var(--transition-normal) var(--ease-smooth);
}
.card-modern:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.15);
}
```
**选中状态卡片**:
```css
.interactive-card--selected {
  background: linear-gradient(135deg, rgba(0, 180, 255, 0.08) 0%, rgba(0, 224, 142, 0.04) 100%);
  border-color: rgba(0, 180, 255, 0.16);
  box-shadow: 0 10px 24px rgba(0, 180, 255, 0.08);
}
```
### 3.3 输入框
```css
.input-modern {
  width: 100%;
  padding: 0.75rem 1rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-md);
  color: white;
  font-size: 0.875rem;
  transition: all var(--transition-normal) var(--ease-smooth);
}
.input-modern:focus {
  outline: none;
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(0, 180, 255, 0.5);
  box-shadow: 0 0 0 3px rgba(0, 180, 255, 0.1);
}
```
### 3.4 开关 (iOS风格)
```css
.switch {
  position: relative;
  width: 3rem;
  height: 1.75rem;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 9999px;
  cursor: pointer;
  transition: background var(--transition-normal);
}
.switch[data-checked="true"] {
  background: linear-gradient(135deg, #00B4FF 0%, #00E08E 100%);
}
.switch-thumb {
  position: absolute;
  top: 0.125rem;
  left: 0.125rem;
  width: 1.5rem;
  height: 1.5rem;
  background: white;
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform var(--transition-normal) var(--ease-out-back);
}
.switch[data-checked="true"] .switch-thumb {
  transform: translateX(1.25rem);
}
```
### 3.5 分段控制器
```css
.segmented-control {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  padding: 0.25rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-lg);
  position: relative;
}
.segmented-control-slider {
  position: absolute;
  top: 0.25rem;
  height: calc(100% - 0.5rem);
  background: linear-gradient(135deg, #00B4FF 0%, #00E08E 100%);
  border-radius: var(--radius-md);
  box-shadow: 0 2px 8px rgba(0, 180, 255, 0.3);
  transition: transform 300ms cubic-bezier(0.4, 0, 0.2, 1);
}
.segmented-control-item {
  position: relative;
  z-index: 10;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.25rem 0.375rem;
  font-size: 0.7rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.6);
  background: transparent;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
}
.segmented-control-item[data-active="true"] {
  color: white;
}
```
### 3.6 悬浮按钮 (FAB)
```css
.fab {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  width: 3.5rem;
  height: 3.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #00B4FF 0%, #00E08E 100%);
  border-radius: 50%;
  box-shadow: 0 10px 25px -5px rgba(0, 180, 255, 0.4);
  color: white;
  cursor: pointer;
  transition: all var(--transition-normal) var(--ease-out-back);
  z-index: 50;
}
.fab:hover {
  transform: scale(1.1);
  box-shadow: 0 15px 35px -5px rgba(0, 180, 255, 0.5);
}
.fab:active {
  transform: scale(0.95);
}
```
### 3.7 状态指示器
```css
.status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.875rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 500;
}
.status-running {
  background: rgba(16, 185, 129, 0.15);
  color: #10B981;
  border: 1px solid rgba(16, 185, 129, 0.3);
}
.status-stopped {
  background: rgba(239, 68, 68, 0.15);
  color: #EF4444;
  border: 1px solid rgba(239, 68, 68, 0.3);
}
```
---
## 4. 页面布局规范
### 4.1 通用布局原则
1. 边距：页面左右边距统一为24px，上下边距20px
2. 卡片间距：同一行卡片间距16px，垂直卡片间距20px
3. 内容层级：通过背景深浅、阴影、边框区分信息层级
4. 响应式：最小支持宽度1024px，主内容区自适应
### 4.2 Dashboard 页面布局
```
┌──────────────────────────────────────────────────────────────┐
│  🎯 Dashboard                                    [状态指示器] │
│     副标题: 实时监控与快速操作                                  │
├──────────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐  ┌─────────────────────┐            │
│  │   🔷 Gateway        │  │   ⚡ Quick          │            │
│  │   Status            │  │   Actions           │            │
│  │                     │  │                     │            │
│  │   ● Running         │  │   [Start] [Config]  │            │
│  │   Uptime: 2h 30m   │  │   [Logs] [Tasks]    │            │
│  └─────────────────────┘  └─────────────────────┘            │
│                                                              │
│  ┌──────────────────────────────────────────────────────────┐│
│  │  📊 Recent Sessions / Activity Timeline                 ││
│  │                                                          ││
│  │  ● 14:32 - Session started: cto-development-director   ││
│  │  ● 14:25 - Gateway restarted                            ││
│  └──────────────────────────────────────────────────────────┘│
│                                                              │
│                                    [+ FAB - Quick Action]    │
└──────────────────────────────────────────────────────────────┘
```
---
## 5. 交互规范
### 5.1 通用交互原则
1. 所有可交互元素悬停时有明显反馈（颜色变化/轻微放大/阴影变化）
2. 点击/激活时有缩放反馈（scale 0.98）
3. 状态变化有平滑过渡动画（200-300ms）
4. 加载状态使用骨架屏或脉冲动画提示
### 5.2 动效规范
- 按钮交互：200ms 平滑过渡
- 卡片悬停：200ms 平滑过渡 + Y轴偏移-2px
- 页面切换：300ms 淡入 + 上移10px
- 模态框：250ms 缩放进入 + 背景模糊
---
## 文档信息
- **版本**: v2.1
- **更新时间**: 2026-03-23
- **更新内容**: 与实际实现对齐，主色调调整为蓝绿渐变，补充所有已实现组件规范
- **设计师**: ux-designer