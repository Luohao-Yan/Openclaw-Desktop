# OpenClaw Desktop - 现代化 UI/UX 设计规范 v2.0

> 基于用户反馈：页面风格太老土，没有C端用户审美
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
--bg-primary: #0A0A0F;        /* 最深层背景 - 深邃紫黑 */
--bg-secondary: #12121A;      /* 卡片/面板背景 */
--bg-tertiary: #1A1A24;       /* 输入框/悬浮元素 */
--bg-elevated: #222230;       /* 模态框/高亮区域 */

/* 渐变背景 - 用于特色区域 */
--bg-gradient-primary: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%);
--bg-gradient-accent: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
--bg-gradient-glow: radial-gradient(ellipse at top, #1e3a5f 0%, transparent 50%);

/* 霓虹点缀色 */
--neon-blue: #00D4FF;
--neon-purple: #A855F7;
--neon-green: #10B981;
--neon-pink: #EC4899;
--neon-cyan: #22D3EE;

/* 文本颜色 */
--text-primary: #FFFFFF;
--text-secondary: #A1A1AA;
--text-muted: #71717A;
--text-accent: #E2E8F0;

/* 边框颜色 */
--border-subtle: rgba(255, 255, 255, 0.08);
--border-default: rgba(255, 255, 255, 0.12);
--border-accent: rgba(168, 85, 247, 0.4);
```

#### 浅色模式 (Light Mode)
```css
/* 背景层级 */
--bg-primary: #FFFFFF;
--bg-secondary: #F8FAFC;
--bg-tertiary: #F1F5F9;
--bg-elevated: #FFFFFF;

/* 渐变背景 */
--bg-gradient-primary: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
--bg-gradient-accent: linear-gradient(135deg, #818cf8 0%, #a78bfa 100%);

/* 品牌色点缀 */
--accent-blue: #4F46E5;
--accent-purple: #7C3AED;
--accent-green: #059669;

/* 文本颜色 */
--text-primary: #0F172A;
--text-secondary: #475569;
--text-muted: #94A3B8;

/* 边框颜色 */
--border-subtle: rgba(0, 0, 0, 0.05);
--border-default: rgba(0, 0, 0, 0.1);
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
--text-3xl: 1.875rem;   /* 30px - Hero 标题 */
--text-4xl: 2.25rem;     /* 36px - 强调标题 */

/* 字重 */
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;

/* 行高 */
--leading-tight: 1.25;
--leading-normal: 1.5;
--leading-relaxed: 1.625;
```

### 2.3 间距系统

```css
/* 基础间距 - 基于 4px */
--space-1: 0.25rem;   /* 4px */
--space-2: 0.5rem;    /* 8px */
--space-3: 0.75rem;   /* 12px */
--space-4: 1rem;      /* 16px */
--space-5: 1.25rem;   /* 20px */
--space-6: 1.5rem;    /* 24px */
--space-8: 2rem;      /* 32px */
--space-10: 2.5rem;   /* 40px */
--space-12: 3rem;     /* 48px */
--space-16: 4rem;     /* 64px */

/* 组件内边距 */
--padding-button: 0.625rem 1.25rem;  /* 10px 20px */
--padding-card: 1.5rem;              /* 24px */
--padding-input: 0.75rem 1rem;       /* 12px 16px */
--padding-modal: 2rem;                /* 32px */
```

### 2.4 圆角系统

```css
/* 圆角 - 大圆角营造柔和现代感 */
--radius-sm: 6px;       /* 6px - 小按钮/标签 */
--radius-md: 10px;      /* 10px - 输入框/小卡片 */
--radius-lg: 14px;       /* 14px - 卡片/面板 */
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
--shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
--shadow-glow-blue: 0 0 20px rgba(0, 212, 255, 0.3);
--shadow-glow-purple: 0 0 20px rgba(168, 85, 247, 0.3);
--shadow-glow-green: 0 0 20px rgba(16, 185, 129, 0.3);

/* 玻璃拟态效果 */
--glass-bg: rgba(255, 255, 255, 0.05);
--glass-border: rgba(255, 255, 255, 0.1);
--glass-blur: blur(12px);
```

---

## 3. 组件设计

### 3.1 Button (按钮)

**Primary Button**:
```jsx
// 深色模式
className="relative px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 
           text-white font-medium rounded-xl
           hover:scale-[1.02] hover:shadow-lg hover:shadow-purple-500/25
           active:scale-[0.98]
           transition-all duration-200 ease-out
           before:absolute before:inset-0 before:rounded-xl 
           before:bg-gradient-to-r before:from-white/10 before:to-transparent
           before:opacity-0 hover:before:opacity-100"
```

**Secondary Button**:
```jsx
className="px-5 py-2.5 bg-white/5 border border-white/10 
           text-white font-medium rounded-xl
           hover:bg-white/10 hover:border-white/20
           active:scale-[0.98]
           transition-all duration-200"
```

**Icon Button (FAB)**:
```jsx
className="fixed bottom-6 right-6 w-14 h-14 
           bg-gradient-to-r from-indigo-500 to-purple-600
           rounded-full shadow-lg shadow-purple-500/30
           flex items-center justify-center
           hover:scale-110 hover:shadow-xl hover:shadow-purple-500/40
           active:scale-95
           transition-all duration-200
           z-50"
```

### 3.2 Card (卡片)

**基础卡片**:
```jsx
className="relative bg-white/5 backdrop-blur-xl 
           border border-white/10 rounded-2xl p-6
           hover:border-white/20 hover:bg-white/8
           transition-all duration-300"
```

**玻璃拟态卡片**:
```jsx
className="relative overflow-hidden
           bg-gradient-to-br from-white/10 to-white/5
           backdrop-blur-xl border border-white/20 rounded-2xl p-6
           shadow-xl
           before:absolute before:inset-0 
           before:bg-gradient-to-br before:from-white/5 before:to-transparent
           before:pointer-events-none"
```

**状态指示卡片** (Gateway Status):
```jsx
// 运行中 - 带有脉冲动画
className="relative overflow-hidden
           bg-gradient-to-r from-emerald-500/20 to-teal-500/10
           border border-emerald-500/30 rounded-2xl p-6
           after:absolute after:top-0 after:right-0 
           after:w-24 after:h-24 after:bg-emerald-500/20 
           after:blur-3xl after:rounded-full"
```

### 3.3 Input (输入框)

**下划线风格**:
```jsx
className="w-full bg-transparent border-b border-white/20 
           py-3 text-white placeholder-white/40
           focus:border-purple-500 focus:outline-none
           transition-colors duration-200"
```

**填充风格**:
```jsx
className="w-full px-4 py-3 
           bg-white/5 border border-white/10 rounded-xl
           text-white placeholder-white/40
           focus:bg-white/10 focus:border-purple-500/50 focus:outline-none
           focus:ring-2 focus:ring-purple-500/20
           transition-all duration-200"
```

### 3.4 Switch (开关) - iOS 风格

```jsx
// 关闭状态
className="w-12 h-7 bg-white/20 rounded-full cursor-pointer
           relative transition-colors duration-300"

// 打开状态  
className="w-12 h-7 bg-gradient-to-r from-indigo-500 to-purple-600 
           rounded-full cursor-pointer relative
           shadow-inner shadow-purple-500/50
           transition-colors duration-300"

// 滑块
className="absolute top-0.5 left-0.5 w-6 h-6 
           bg-white rounded-full shadow-md
           transition-transform duration-300
           data-[checked=true]:translate-x-5"
```

### 3.5 Modal (模态框)

```jsx
className="fixed inset-0 z-50 flex items-center justify-center p-4
           bg-black/60 backdrop-blur-sm
           animate-in fade-in duration-200"

<div className="relative w-full max-w-lg 
                bg-[#12121A] border border-white/10 
                rounded-2xl shadow-2xl shadow-black/50
                animate-in zoom-in-95 duration-300"
>
  {/* 顶部装饰线条 */}
  <div className="absolute top-0 left-1/2 -translate-x-1/2 
                  w-12 h-1 bg-gradient-to-r from-transparent via-white/20 to-transparent 
                  rounded-b-full" />
</div>
```

### 3.6 Segmented Control (分段控制器) - 主题切换

```jsx
// 容器
className="relative flex items-center p-1 
           bg-white/5 border border-white/10 rounded-xl
           gap-1"

// 选项项
className="relative z-10 flex items-center gap-2 px-4 py-2
           text-sm font-medium rounded-lg
           data-[active=true]:text-white
           transition-colors duration-300"

// 滑块背景 - 选中状态
className="absolute inset-y-1 left-0 w-[calc(100%/3)] 
           bg-gradient-to-r from-indigo-500 to-purple-600
           rounded-lg shadow-lg shadow-purple-500/30
           transition-transform duration-300 ease-out"
```

---

## 4. 页面设计

### 4.1 Dashboard 页面

**布局结构**:
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
│  │  ● 14:10 - Task completed: feishu message               ││
│  └──────────────────────────────────────────────────────────┘│
│                                                              │
│                                    [+ FAB - Quick Action]    │
└──────────────────────────────────────────────────────────────┘
```

**设计要点**:
1. 大标题 + 状态指示器 (类似 Linear)
2. Gateway 状态使用大图标 + 动态效果 (脉冲发光)
3. 快捷操作使用悬浮按钮 (FAB)
4. 最近活动使用时间线 (Timeline) 展示
5. 背景使用渐变 + 光晕效果

### 4.2 Sidebar 重新设计

**当前问题**: 传统列表式

**新设计**:
```
┌────┬────────────────────────────┐
│ 📁 │ Dashboard        ──────►   │
├────┼────────────────────────────┤
│ ⚙️ │ Config                   ◄─ │ ← 左侧高亮条
├────┼────────────────────────────┤
│ 📋 │ Tasks                       │
├────┼────────────────────────────┤
│ 📄 │ Logs                        │
├────┼────────────────────────────┤
│    │                            │
│    │                            │
│    │                            │
├────┴────────────────────────────┤
│ Theme: [☀️][🌙][💻]              │
│ User:  @username                │
│ v0.5.1 Preview   [>]         │
└─────────────────────────────────┘
```

**设计要点**:
- 图标 + 文字紧凑布局
- 选中状态: 左侧高亮条 + 背景色渐变
- 悬停效果: 轻微放大 (scale 1.02) + 阴影
- 底部用户区域 + 主题切换
- 折叠时只显示图标 + 悬浮提示

### 4.3 主题切换重新设计

**当前问题**: 三个小按钮不直观

**新设计 - Segmented Control**:
```
┌─────────────────────────────────────────┐
│  Theme Preference                       │
│  ┌────────┬────────┬────────┐          │
│  │   ☀️   │   🌙   │   💻   │          │
│  │  Light │  Dark │ System │          │
│  └────────┴────────┴────────┘          │
│         ↑ 滑块动画跟随                  │
└─────────────────────────────────────────┘
```

**设计要点**:
- 使用 Segmented Control 分段控制器
- 图标 + 文字组合
- 选中状态有滑块动画 (transform)
- 实时预览效果 (立即应用主题)

### 4.4 Config 页面重新设计

**当前问题**: 表单过于传统

**新设计 - 分组卡片式布局**:
```
┌─────────────────────────────────────────────────────────────┐
│  ⚙️ Configuration                          [Save Changes]  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 📡 Gateway Settings                                     ││
│  │ ─────────────────────────────────────────────────────── ││
│  │                                                          ││
│  │  OpenClaw Path          [________________________] 📁  ││
│  │                                                        ││
│  │  Auto Start            [=========○]                   ││
│  │                                                        ││
│  │  Port                  [________] 8080                ││
│  │                                                        ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 🔔 Notifications                                        ││
│  │ ─────────────────────────────────────────────────────── ││
│  │                                                          ││
│  │  Desktop Notifications   [========○==]                 ││
│  │                                                          ││
│  │  Sound Alerts          [==========○]                   ││
│  │                                                          ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│                                         [Save Button Sticky] │
└─────────────────────────────────────────────────────────────┘
```

**设计要点**:
- 分组卡片式布局 (Card Group)
- 输入框使用下划线风格或填充风格
- 开关使用 iOS 风格
- 保存按钮固定在底部 (Sticky Footer)

---

## 5. 动效设计

### 5.1 过渡时间 (Timing)

```css
/* 快速交互 - 按钮悬停/点击 */
--transition-fast: 150ms;

/* 常规交互 - 卡片悬停/状态变化 */
--transition-normal: 200ms;

/* 页面切换 - 淡入淡出 */
--transition-page: 300ms;

/* 模态框 - 放大/缩小 */
--transition-modal: 250ms;
```

### 5.2 缓动函数 (Easing)

```css
/* 弹性效果 - 按钮/弹跳 */
--ease-out-back: cubic-bezier(0.34, 1.56, 0.64, 1);

/* 平滑 - 页面切换 */
--ease-out-smooth: cubic-bezier(0.4, 0, 0.2, 1);

/* 标准 - 常规过渡 */
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
```

### 5.3 动画效果

**页面切换**:
```css
/* 淡入 + 轻微滑动 */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

**按钮悬停**:
```css
/* 缩放 + 颜色渐变 */
transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1),
            box-shadow 200ms ease-out;

hover: {
  transform: scale(1.02);
  box-shadow: 0 10px 25px -5px rgba(168, 85, 247, 0.3);
}
```

**状态变化 - 脉冲动画**:
```css
@keyframes pulse-glow {
  0%, 100% {
    box-shadow: 0 0 20px rgba(16, 185, 129, 0.3);
  }
  50% {
    box-shadow: 0 0 40px rgba(16, 185, 129, 0.5);
  }
}

.animate-pulse-glow {
  animation: pulse-glow 2s ease-in-out infinite;
}
```

**加载状态 - 骨架屏**:
```css
@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

.skeleton {
  background: linear-gradient(
    90deg,
    rgba(255,255,255,0.05) 25%,
    rgba(255,255,255,0.1) 50%,
    rgba(255,255,255,0.05) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}
```

---

## 6. Tailwind 配置

### 6.1 完整的自定义配置

```javascript
// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  
  theme: {
    extend: {
      // 颜色系统
      colors: {
        // 深色模式背景
        'dark': {
          'bg': {
            'primary': '#0A0A0F',
            'secondary': '#12121A',
            'tertiary': '#1A1A24',
            'elevated': '#222230',
          },
        },
        // 霓虹点缀色
        'neon': {
          'blue': '#00D4FF',
          'purple': '#A855F7',
          'green': '#10B981',
          'pink': '#EC4899',
          'cyan': '#22D3EE',
        },
        // 品牌渐变色
        'brand': {
          'gradient': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        },
      },
      
      // 字体
      fontFamily: {
        'display': ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        'body': ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        'mono': ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      
      // 圆角 - 大圆角
      borderRadius: {
        'sm': '6px',
        'md': '10px',
        'lg': '14px',
        'xl': '20px',
        '2xl': '28px',
      },
      
      // 间距
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
      },
      
      // 阴影 - 柔和层次
      boxShadow: {
        'glow-blue': '0 0 20px rgba(0, 212, 255, 0.3)',
        'glow-purple': '0 0 20px rgba(168, 85, 247, 0.3)',
        'glow-green': '0 0 20px rgba(16, 185, 129, 0.3)',
        'glow-lg-purple': '0 10px 25px -5px rgba(168, 85, 247, 0.3)',
        'card': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
        'card-hover': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
      },
      
      // 背景渐变
      backgroundImage: {
        'gradient-dark': 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%)',
        'gradient-accent': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        'gradient-glow': 'radial-gradient(ellipse at top, #1e3a5f 0%, transparent 50%)',
        'glass': 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
      },
      
      // 动画
      animation: {
        'fade-in': 'fadeIn 300ms ease-out',
        'fade-in-up': 'fadeInUp 300ms ease-out',
        'slide-in-right': 'slideInRight 300ms ease-out',
        'scale-in': 'scaleIn 200ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'shimmer': 'shimmer 1.5s infinite',
      },
      
      // 关键帧
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(16, 185, 129, 0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(16, 185, 129, 0.5)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      
      // 过渡
      transitionTimingFunction: {
        'out-back': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      
      transitionDuration: {
        '250': '250ms',
      },
    },
  },
  
  plugins: [],
}
```

---

## 7. 实现检查清单

### 7.1 整体视觉风格
- [ ] 应用现代极简主义设计语言
- [ ] 实现深色/浅色模式切换
- [ ] 应用大圆角 (12-16px)
- [ ] 应用柔和层次阴影

### 7.2 Dashboard 页面
- [ ] 大标题 + 状态指示器
- [ ] Gateway 状态大图标 + 动态效果
- [ ] 快捷操作 FAB 按钮
- [ ] 时间线展示最近活动
- [ ] 背景渐变 + 光晕效果

### 7.3 Sidebar
- [ ] 图标 + 文字紧凑布局
- [ ] 选中状态左侧高亮条
- [ ] 悬停放大 + 阴影效果
- [ ] 底部用户区域

### 7.4 主题切换
- [ ] Segmented Control 分段控制器
- [ ] 图标 + 文字组合
- [ ] 滑块动画
- [ ] 实时预览效果

### 7.5 Config 页面
- [ ] 分组卡片式布局
- [ ] 下划线/填充风格输入框
- [ ] iOS 风格开关
- [ ] 固定底部保存按钮

### 7.6 动效
- [ ] 页面切换淡入 + 滑动
- [ ] 按钮悬停缩放 + 渐变
- [ ] 状态变化脉冲动画
- [ ] 加载骨架屏

---

## 8. 文件更新说明

需要修改的文件：
1. `tailwind.config.js` - 添加设计令牌
2. `src/index.css` - 添加基础样式和动画
3. `src/components/Sidebar.tsx` - 重新设计侧边栏
4. `src/pages/Dashboard.tsx` - 重新设计 Dashboard
5. `src/pages/Config.tsx` - 重新设计配置页面
6. `src/contexts/ThemeContext.tsx` - 优化主题切换
7. 新增: `src/components/SegmentedControl.tsx` - 分段控制器组件
8. 新增: `src/components/GlassCard.tsx` - 玻璃拟态卡片
9. 新增: `src/components/ModernButton.tsx` - 现代按钮组件

---

**文档版本**: v2.0
**创建时间**: 2026-03-07
**设计师**: ux-designer
**截止时间**: 2026-03-07 17:00