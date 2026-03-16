// ============================================================================
// SetupSkeleton — 骨架屏组件
// 在环境检测、本机检查、渠道配置等耗时操作期间显示占位内容，
// 布局结构与实际内容一致，避免加载完成后的布局跳动。
// @see 需求 3.1 — 环境检测开始时立即显示骨架屏
// @see 需求 3.2 — 显示当前正在检测的项目名称
// @see 需求 3.3 — 耗时超过 3 秒时显示预估剩余时间
// @see 需求 3.4 — 骨架屏使用与实际内容相同的布局结构
// ============================================================================

import React from 'react';
import { Clock, Loader2 } from 'lucide-react';

// ============================================================================
// 类型定义
// ============================================================================

export interface SetupSkeletonProps {
  /** 骨架屏布局类型，匹配实际内容结构 */
  variant: 'environment-check' | 'local-check' | 'channels' | 'generic';
  /** 当前正在检测的项目名称 */
  activeLabel?: string;
  /** 预估剩余时间（秒） */
  estimatedRemaining?: number;
}

// ============================================================================
// 基础骨架块组件
// ============================================================================

/** 脉冲动画占位块 */
const Bone: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div
    className={`animate-pulse rounded-lg ${className}`}
    style={{ backgroundColor: 'var(--app-border)' }}
  />
);

// ============================================================================
// 状态提示栏 — 显示当前检测项 + 预估剩余时间
// ============================================================================

/** 检测状态提示栏 */
const StatusBar: React.FC<{
  activeLabel?: string;
  estimatedRemaining?: number;
}> = ({ activeLabel, estimatedRemaining }) => {
  // 没有任何提示信息时不渲染
  if (!activeLabel && !estimatedRemaining) return null;

  return (
    <div
      className="mb-4 flex items-center gap-3 rounded-xl border px-4 py-2.5"
      style={{
        backgroundColor: 'var(--app-bg)',
        borderColor: 'var(--app-border)',
      }}
    >
      {/* 旋转加载图标 */}
      <Loader2 size={14} className="animate-spin shrink-0" style={{ color: 'var(--app-active-text)' }} />

      {/* 当前检测项名称 */}
      {activeLabel && (
        <span className="text-xs font-medium" style={{ color: 'var(--app-text)' }}>
          正在检测：{activeLabel}
        </span>
      )}

      {/* 预估剩余时间（仅当 > 0 时显示） */}
      {estimatedRemaining != null && estimatedRemaining > 0 && (
        <span
          className="ml-auto flex items-center gap-1.5 text-xs"
          style={{ color: 'var(--app-text-muted)' }}
        >
          <Clock size={12} />
          预计还需 {estimatedRemaining} 秒
        </span>
      )}
    </div>
  );
};

// ============================================================================
// environment-check 变体 — 模拟检测项分组布局
// 对应 SetupLocalEnvironmentPage 中的 CheckGroup 结构
// ============================================================================

const EnvironmentCheckSkeleton: React.FC = () => (
  <div className="space-y-5">
    {/* 模拟两个检测分组：必要条件 + 可选条件 */}
    {[4, 2].map((itemCount, gi) => (
      <div key={gi} className="space-y-2">
        {/* 分组标题占位 */}
        <Bone className="h-4 w-20 mb-2" />
        {/* 检测项卡片占位 */}
        {Array.from({ length: itemCount }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-2xl border p-4"
            style={{
              backgroundColor: 'var(--app-bg)',
              borderColor: 'var(--app-border)',
            }}
          >
            <div className="flex items-center gap-3">
              {/* 状态图标占位 */}
              <Bone className="h-4 w-4 rounded-full" />
              <div className="space-y-1.5">
                {/* 检测项名称占位 */}
                <Bone className="h-3.5 w-32" />
                {/* 状态说明占位 */}
                <Bone className="h-3 w-48" />
              </div>
            </div>
          </div>
        ))}
      </div>
    ))}
  </div>
);

// ============================================================================
// local-check 变体 — 模拟三列检测结果布局
// 对应 SetupLocalCheckPage 中的三列网格
// ============================================================================

const LocalCheckSkeleton: React.FC = () => (
  <div className="space-y-4">
    {/* 三列检测结果卡片 */}
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border p-4"
          style={{
            backgroundColor: 'var(--app-bg)',
            borderColor: 'var(--app-border)',
          }}
        >
          {/* 标签占位 */}
          <Bone className="h-3.5 w-16" />
          {/* 值占位 */}
          <Bone className="mt-3 h-3.5 w-24" />
        </div>
      ))}
    </div>

    {/* 详情区域占位 */}
    <div
      className="rounded-2xl border p-5 space-y-2"
      style={{
        backgroundColor: 'var(--app-bg)',
        borderColor: 'var(--app-border)',
      }}
    >
      <Bone className="h-3.5 w-3/4" />
      <Bone className="h-3.5 w-1/2" />
    </div>
  </div>
);

// ============================================================================
// channels 变体 — 模拟渠道卡片网格布局
// 对应 SetupChannelsPage 中的双栏网格
// ============================================================================

const ChannelsSkeleton: React.FC = () => (
  <div className="grid grid-cols-2 gap-3">
    {Array.from({ length: 6 }).map((_, i) => (
      <div
        key={i}
        className="rounded-2xl border"
        style={{
          backgroundColor: 'var(--app-bg)',
          borderColor: 'var(--app-border)',
        }}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            {/* 渠道颜色标识点占位 */}
            <Bone className="h-3 w-3 rounded-full" />
            <div className="space-y-1.5">
              {/* 渠道名称占位 */}
              <Bone className="h-3.5 w-20" />
              {/* 渠道描述占位 */}
              <Bone className="h-3 w-32" />
            </div>
          </div>
          {/* 开关占位 */}
          <Bone className="h-7 w-14 rounded-full" />
        </div>
      </div>
    ))}
  </div>
);

// ============================================================================
// generic 变体 — 通用骨架屏
// ============================================================================

const GenericSkeleton: React.FC = () => (
  <div className="space-y-4">
    <Bone className="h-6 w-3/4" />
    <Bone className="h-4 w-1/2" />
    <div className="space-y-3 mt-6">
      <Bone className="h-12 w-full" />
      <Bone className="h-12 w-full" />
      <Bone className="h-12 w-5/6" />
    </div>
    <div className="flex gap-3 mt-6">
      <Bone className="h-10 w-28" />
      <Bone className="h-10 w-28" />
    </div>
  </div>
);

// ============================================================================
// 变体映射
// ============================================================================

/** 变体 → 骨架屏组件映射 */
const variantMap: Record<SetupSkeletonProps['variant'], React.FC> = {
  'environment-check': EnvironmentCheckSkeleton,
  'local-check': LocalCheckSkeleton,
  channels: ChannelsSkeleton,
  generic: GenericSkeleton,
};

// ============================================================================
// SetupSkeleton 主组件
// ============================================================================

/**
 * 骨架屏组件 — 在耗时操作期间显示与实际内容结构一致的占位内容。
 *
 * - `environment-check`：模拟检测项分组布局（必要条件 + 可选条件）
 * - `local-check`：模拟三列检测结果布局
 * - `channels`：模拟渠道卡片双栏网格
 * - `generic`：通用骨架屏
 *
 * 支持显示当前检测项名称（activeLabel）和预估剩余时间（estimatedRemaining）。
 * 预估剩余时间仅在检测耗时超过 3 秒后由父组件传入。
 */
const SetupSkeleton: React.FC<SetupSkeletonProps> = ({
  variant,
  activeLabel,
  estimatedRemaining,
}) => {
  const VariantComponent = variantMap[variant];

  return (
    <div>
      {/* 状态提示栏：当前检测项 + 预估剩余时间 */}
      <StatusBar activeLabel={activeLabel} estimatedRemaining={estimatedRemaining} />
      {/* 对应变体的骨架屏内容 */}
      <VariantComponent />
    </div>
  );
};

export default SetupSkeleton;
