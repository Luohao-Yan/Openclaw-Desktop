import React, { useState, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { BarChart3, TrendingUp, MessageSquare, Clock, AlertTriangle } from 'lucide-react';
import GlassCard from './GlassCard';
import type { DailyStats } from '../types/electron';

/** 时间范围类型 */
type TimeRange = '7d' | '30d' | 'all';

/** 组件 Props */
interface HistoryStatsPanelProps {
  agentId: string;
  stats: DailyStats[];
  /** 独立会话总数（从 sessions.json 获取，不重复计数） */
  totalSessions: number;
  loading: boolean;
}

// ── 纯函数：按时间范围过滤统计数据 ──────────────────────────────────────────

/**
 * 根据选定的时间范围过滤 DailyStats 数组。
 * 以当前日期为基准，按日期字符串比较进行过滤。
 */
export function filterStatsByRange(
  stats: DailyStats[],
  range: '7d' | '30d' | 'all',
): DailyStats[] {
  if (range === 'all') return stats;

  const now = new Date();
  now.setHours(23, 59, 59, 999);
  const days = range === '7d' ? 7 : 30;
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  return stats.filter((s) => s.date >= cutoffStr);
}

// ── 纯函数：计算汇总指标 ────────────────────────────────────────────────────

/**
 * 根据 DailyStats 数组计算汇总指标。
 */
export function computeSummary(stats: DailyStats[]): {
  totalTokens: number;
  totalSessions: number;
  avgResponseMs: number;
  avgErrorRate: number;
  tokenEstimated: boolean;
} {
  if (stats.length === 0) {
    return { totalTokens: 0, totalSessions: 0, avgResponseMs: 0, avgErrorRate: 0, tokenEstimated: true };
  }

  let totalTokens = 0;
  let totalSessions = 0;
  let weightedResponseSum = 0;
  let errorRateSum = 0;
  let allEstimated = true;

  for (const s of stats) {
    totalTokens += s.tokenUsage;
    totalSessions += s.sessionCount;
    weightedResponseSum += s.avgResponseMs * s.sessionCount;
    errorRateSum += s.errorRate;
    if (!s.tokenEstimated) allEstimated = false;
  }

  const avgResponseMs = totalSessions > 0 ? weightedResponseSum / totalSessions : 0;
  const avgErrorRate = errorRateSum / stats.length;

  return { totalTokens, totalSessions, avgResponseMs, avgErrorRate, tokenEstimated: allEstimated };
}

// ── 辅助：格式化数字显示 ────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

// ── 配置 ────────────────────────────────────────────────────────────────────

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: '7d', label: '近 7 天' },
  { value: '30d', label: '近 30 天' },
  { value: 'all', label: '全部' },
];

/** 图表配置：每个图表有独立的颜色、图标、格式化器 */
const CHART_CONFIGS = [
  { key: 'tokenUsage' as const, title: 'Token 消耗', color: '#6366f1', icon: TrendingUp, formatter: formatNumber },
  { key: 'sessionCount' as const, title: '会话量', color: '#10b981', icon: MessageSquare, formatter: formatNumber, allowDecimals: false },
  { key: 'avgResponseMs' as const, title: '平均响应时间', color: '#f59e0b', icon: Clock, formatter: formatMs },
  { key: 'errorRate' as const, title: '错误率', color: '#ef4444', icon: AlertTriangle, formatter: (v: number) => `${v.toFixed(1)}%` },
];

// ── 组件 ────────────────────────────────────────────────────────────────────

const HistoryStatsPanel: React.FC<HistoryStatsPanelProps> = ({ stats, totalSessions, loading }) => {
  const [range, setRange] = useState<TimeRange>('30d');
  const filteredStats = useMemo(() => filterStatsByRange(stats, range), [stats, range]);
  const summary = useMemo(() => computeSummary(filteredStats), [filteredStats]);

  // ── 空状态 ──────────────────────────────────────────────────────────────

  if (!loading && stats.length === 0) {
    return (
      <GlassCard className="p-8">
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="rounded-2xl p-4" style={{ backgroundColor: 'rgba(99,102,241,0.08)' }}>
            <BarChart3 className="w-10 h-10" style={{ color: '#6366f1', opacity: 0.6 }} />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--app-text)' }}>
              暂无历史数据
            </p>
            <p className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
              开始使用 Agent 后将自动记录统计数据
            </p>
          </div>
        </div>
      </GlassCard>
    );
  }

  // ── 加载状态 ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <GlassCard className="p-8">
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--app-border)', borderTopColor: 'transparent' }} />
          <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>加载统计数据...</p>
        </div>
      </GlassCard>
    );
  }

  // ── 汇总指标卡片 ──────────────────────────────────────────────────────

  const summaryCards = [
    { label: 'Token 消耗', value: `${summary.tokenEstimated ? '≈ ' : ''}${formatNumber(summary.totalTokens)}`, bg: 'rgba(99,102,241,0.08)', color: '#6366f1', icon: TrendingUp },
    { label: '总会话', value: `${formatNumber(totalSessions)} 次`, bg: 'rgba(16,185,129,0.08)', color: '#10b981', icon: MessageSquare },
    { label: '响应时间', value: formatMs(summary.avgResponseMs), bg: 'rgba(245,158,11,0.08)', color: '#f59e0b', icon: Clock },
    { label: '错误率', value: `${summary.avgErrorRate.toFixed(1)}%`, bg: 'rgba(239,68,68,0.08)', color: '#ef4444', icon: AlertTriangle },
  ];

  return (
    <GlassCard className="p-6">
      {/* 标题行 */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-semibold" style={{ color: 'var(--app-text)' }}>
          历史统计
        </h3>
        {/* 时间范围切换：胶囊按钮组 */}
        <div className="flex gap-1 rounded-full p-1" style={{ backgroundColor: 'var(--app-bg-subtle)' }}>
          {TIME_RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className="px-3 py-1 text-xs font-medium rounded-full transition-all duration-200"
              style={{
                backgroundColor: range === opt.value ? 'var(--app-text)' : 'transparent',
                color: range === opt.value ? 'var(--app-bg)' : 'var(--app-text-muted)',
                boxShadow: range === opt.value ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
              }}
              onClick={() => setRange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 汇总指标卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="rounded-xl p-3.5 flex items-center gap-3"
              style={{ backgroundColor: card.bg }}
            >
              <div className="rounded-lg p-2" style={{ backgroundColor: `${card.color}18` }}>
                <Icon className="w-4 h-4" style={{ color: card.color }} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium truncate" style={{ color: card.color }}>
                  {card.label}
                </p>
                <p className="text-lg font-bold leading-tight" style={{ color: 'var(--app-text)' }}>
                  {card.value}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* 趋势图表 2×2 网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {CHART_CONFIGS.map((cfg) => {
          const Icon = cfg.icon;
          return (
            <div
              key={cfg.key}
              className="rounded-xl p-4 outline-none"
              style={{ backgroundColor: `${cfg.color}06` }}
              tabIndex={-1}
            >
              {/* 图表标题行 */}
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
                <p className="text-xs font-semibold" style={{ color: cfg.color }}>
                  {cfg.title}
                </p>
              </div>
              {/* 图表区域 */}
              <div className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={filteredStats} margin={{ top: 6, right: 12, left: 4, bottom: 2 }}>
                    {/* 渐变填充定义 */}
                    <defs>
                      <linearGradient id={`fill-${cfg.key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={cfg.color} stopOpacity={0.15} />
                        <stop offset="95%" stopColor={cfg.color} stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    {/* 网格线：仅水平，极淡 */}
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--app-border)"
                      strokeOpacity={0.3}
                      vertical={false}
                    />
                    {/* X 轴：底部柔和轴线 + 圆角刻度 */}
                    <XAxis
                      dataKey="date"
                      axisLine={{ stroke: 'var(--app-border)', strokeWidth: 1 }}
                      tickLine={false}
                      tick={{
                        fontSize: 10,
                        fill: 'var(--app-text-muted)',
                        fontWeight: 500,
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                      }}
                      tickFormatter={(v: string) => {
                        const parts = v.slice(5).split('-');
                        return `${parseInt(parts[0])}/${parseInt(parts[1])}`;
                      }}
                      tickMargin={8}
                      minTickGap={36}
                      padding={{ left: 8, right: 8 }}
                    />
                    {/* Y 轴：隐藏轴线，精简刻度 */}
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{
                        fontSize: 10,
                        fill: 'var(--app-text-muted)',
                        fontWeight: 500,
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                      }}
                      tickFormatter={cfg.formatter}
                      width={54}
                      tickMargin={6}
                      tickCount={4}
                      allowDecimals={'allowDecimals' in cfg ? cfg.allowDecimals : true}
                      domain={['auto', 'auto']}
                    />
                    {/* Tooltip */}
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--app-bg-elevated)',
                        border: '1px solid var(--app-border)',
                        borderRadius: '10px',
                        color: 'var(--app-text)',
                        fontSize: 12,
                        boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
                        padding: '8px 12px',
                      }}
                      formatter={(value) => [cfg.formatter(Number(value ?? 0)), cfg.title]}
                      labelFormatter={(label) => `${String(label)}`}
                      cursor={{ stroke: cfg.color, strokeWidth: 1, strokeDasharray: '3 3', strokeOpacity: 0.5 }}
                    />
                    {/* 面积图：渐变填充 + 平滑曲线 */}
                    <Area
                      type="monotone"
                      dataKey={cfg.key}
                      stroke={cfg.color}
                      strokeWidth={2}
                      fill={`url(#fill-${cfg.key})`}
                      dot={false}
                      activeDot={{ r: 4, fill: cfg.color, stroke: '#fff', strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
};

export default HistoryStatsPanel;
