import React from 'react';

/**
 * 全局 Loading 组件属性
 * @param visible - 是否显示
 * @param text - 加载提示文字（可选）
 * @param overlay - 是否显示遮罩层（默认 true）
 * @param size - 尺寸：'sm' | 'md' | 'lg'（默认 'md'）
 */
interface GlobalLoadingProps {
  visible: boolean;
  text?: string;
  overlay?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

/* 尺寸映射 */
const sizeMap = {
  sm: { ring: 28, stroke: 2.5, dot: 4 },
  md: { ring: 44, stroke: 3, dot: 5 },
  lg: { ring: 64, stroke: 3.5, dot: 6 },
};

const GlobalLoading: React.FC<GlobalLoadingProps> = ({
  visible,
  text,
  overlay = true,
  size = 'md',
}) => {
  if (!visible) return null;

  const { ring, stroke, dot } = sizeMap[size];
  const r = (ring - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  /* ---- 内联样式（CSS-in-JS，避免额外样式文件） ---- */
  const wrapperStyle: React.CSSProperties = overlay
    ? {
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        animation: 'gl-fade-in 200ms ease-out',
      }
    : {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
      };

  const cardStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1rem',
    padding: '1.75rem 2.5rem',
    borderRadius: 'var(--radius-xl)',
    background: 'var(--app-bg-elevated)',
    border: '1px solid var(--app-border)',
    boxShadow: '0 20px 50px rgba(0,0,0,0.35)',
  };

  /* 旋转光环 SVG（overlay 和内联模式共用） */
  const spinnerNode = (
    <div style={{ position: 'relative', width: ring, height: ring }}>
      <svg
        width={ring}
        height={ring}
        viewBox={`0 0 ${ring} ${ring}`}
        style={{ animation: 'gl-spin 1.1s linear infinite' }}
      >
        {/* 底环 */}
        <circle
          cx={ring / 2}
          cy={ring / 2}
          r={r}
          fill="none"
          stroke="var(--app-border)"
          strokeWidth={stroke}
        />
        {/* 渐变弧 */}
        <defs>
          <linearGradient id="gl-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00B4FF" />
            <stop offset="100%" stopColor="#00E08E" />
          </linearGradient>
        </defs>
        <circle
          cx={ring / 2}
          cy={ring / 2}
          r={r}
          fill="none"
          stroke="url(#gl-grad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          style={{
            animation: `gl-dash 1.4s ease-in-out infinite`,
            transformOrigin: 'center',
          }}
        />
      </svg>
    </div>
  );

  return (
    <div style={wrapperStyle} role="status" aria-live="polite">
      {/* 内嵌关键帧，只渲染一次 */}
      <style>{`
        @keyframes gl-fade-in{from{opacity:0}to{opacity:1}}
        @keyframes gl-spin{to{transform:rotate(360deg)}}
        @keyframes gl-dash{
          0%{stroke-dashoffset:${circumference * 0.75}}
          50%{stroke-dashoffset:${circumference * 0.2}}
          100%{stroke-dashoffset:${circumference * 0.75}}
        }
        @keyframes gl-dot-pulse{
          0%,80%,100%{opacity:.25;transform:scale(.85)}
          40%{opacity:1;transform:scale(1)}
        }
      `}</style>

      {overlay ? (
        /* ── 遮罩模式：卡片 + 光环 + 文字 ── */
        <div style={cardStyle}>
          {spinnerNode}
          {/* 提示文字 + 跳动圆点（仅 overlay 模式显示） */}
          {text && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                fontSize: size === 'sm' ? '0.75rem' : '0.8125rem',
                color: 'var(--app-text-muted)',
                fontFamily: 'var(--font-body)',
                letterSpacing: '0.01em',
              }}
            >
              <span>{text}</span>
              {/* 三个跳动小圆点 */}
              <span style={{ display: 'inline-flex', gap: `${dot - 1}px`, marginLeft: 2 }}>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    style={{
                      width: dot,
                      height: dot,
                      borderRadius: '50%',
                      background: 'var(--app-text-muted)',
                      animation: `gl-dot-pulse 1.2s ease-in-out ${i * 0.16}s infinite`,
                    }}
                  />
                ))}
              </span>
            </div>
          )}
        </div>
      ) : (
        /* ── 内联模式：只显示旋转光环，无文字 ── */
        spinnerNode
      )}
    </div>
  );
};

export default GlobalLoading;
