/** @type {import('tailwindcss').Config} */
export default {
  darkMode: {
    selector: '[data-theme="dark"]'
  },
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  
  theme: {
    extend: {
      // 颜色系统
      colors: {
        // 深色模式背景
        dark: {
          bg: {
            primary: '#0A0A0F',
            secondary: '#12121A',
            tertiary: '#1A1A24',
            elevated: '#222230',
          },
        },
        // 科技风格青绿色系
        tech: {
          cyan: '#00B4FF',        // 科技蓝
          green: '#00E08E',       // 科技绿
          teal: '#00D0B6',        // 青绿色
          mint: '#2FE6B1',        // 薄荷绿
          aqua: '#00E6FF',        // 水蓝
        },
        // 品牌渐变色 - 青绿色系
        brand: {
          gradient: 'linear-gradient(135deg, #00B4FF 0%, #00E08E 100%)',
        },
      },
      
      // 字体
      fontFamily: {
        display: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        body: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      
      // 圆角 - 大圆角营造柔和现代感
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '14px',
        xl: '20px',
        '2xl': '28px',
      },
      
      // 间距
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
      },
      
      // 阴影 - 科技青绿光晕
      boxShadow: {
        'glow-cyan': '0 0 20px rgba(0, 180, 255, 0.3)',
        'glow-green': '0 0 20px rgba(0, 224, 142, 0.3)',
        'glow-teal': '0 0 20px rgba(0, 208, 182, 0.3)',
        'glow-lg-cyan': '0 10px 25px -5px rgba(0, 180, 255, 0.3)',
        'card': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
        'card-hover': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
      },
      
      // 背景渐变 - 科技风格
      backgroundImage: {
        'gradient-dark': 'linear-gradient(135deg, #0a0f1a 0%, #071426 50%, #050a1c 100%)',
        'gradient-accent': 'linear-gradient(135deg, #00B4FF 0%, #00E08E 100%)',
        'gradient-glow': 'radial-gradient(ellipse at top, rgba(0, 180, 255, 0.15) 0%, transparent 50%)',
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
          '0%, 100%': { boxShadow: '0 0 20px rgba(0, 224, 142, 0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(0, 224, 142, 0.5)' },
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