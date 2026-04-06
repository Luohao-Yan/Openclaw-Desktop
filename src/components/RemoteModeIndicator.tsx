/**
 * 远程模式指示器组件
 *
 * 在侧边栏底部显示远程连接状态，包括：
 * - 连接状态圆点（绿色=已连接、红色=已断开、黄色=连接中/错误）
 * - 实例标签（别名或 host:port）
 * - 延迟信息（毫秒）
 *
 * 支持折叠模式（仅显示状态圆点）和展开模式（显示完整信息）。
 */

import React from 'react';
import type { ConnectionStatus } from '../../types/remote';
import { useI18n } from '../i18n/I18nContext';

export interface RemoteModeIndicatorProps {
  /** 当前连接的实例别名或 host:port */
  instanceLabel: string;
  /** 连接状态 */
  status: ConnectionStatus;
  /** 延迟（毫秒） */
  latencyMs?: number;
  /** 是否折叠模式（仅显示圆点） */
  collapsed?: boolean;
}

/** 根据连接状态返回圆点颜色 */
function getStatusColor(status: ConnectionStatus): string {
  switch (status) {
    case 'connected':
      return '#22C55E'; // 绿色
    case 'disconnected':
      return '#EF4444'; // 红色
    case 'connecting':
      return '#F59E0B'; // 黄色
    case 'error':
      return '#F59E0B'; // 黄色
    default:
      return '#9CA3AF'; // 灰色
  }
}

/** 根据连接状态返回 i18n key */
function getStatusKey(status: ConnectionStatus): string {
  switch (status) {
    case 'connected':
      return 'remote.connected';
    case 'disconnected':
      return 'remote.disconnected';
    case 'connecting':
      return 'remote.connecting';
    case 'error':
      return 'remote.error';
    default:
      return 'remote.disconnected';
  }
}

const RemoteModeIndicator: React.FC<RemoteModeIndicatorProps> = ({
  instanceLabel,
  status,
  latencyMs,
  collapsed = false,
}) => {
  const { t } = useI18n();
  const dotColor = getStatusColor(status);
  const statusText = t(getStatusKey(status) as any);

  // 折叠模式：仅显示状态圆点
  if (collapsed) {
    return (
      <div
        className="flex items-center justify-center p-2 rounded-lg"
        title={`${t('remote.indicator.label' as any)}: ${instanceLabel || statusText}`}
        style={{ backgroundColor: 'transparent' }}
      >
        {/* 状态圆点 */}
        <span
          className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{
            backgroundColor: dotColor,
            boxShadow: status === 'connected' ? `0 0 6px ${dotColor}` : 'none',
          }}
        />
      </div>
    );
  }

  // 展开模式：显示完整信息
  return (
    <div
      className="rounded-xl border p-3"
      style={{
        borderColor: 'var(--app-border)',
      }}
    >
      {/* 标题行 */}
      <div
        className="text-[10px] font-medium uppercase tracking-[0.08em] mb-1.5"
        style={{ color: 'var(--app-text-muted)' }}
      >
        {t('remote.indicator.label' as any)}
      </div>

      {/* 状态行：圆点 + 实例标签 */}
      <div className="flex items-center gap-2">
        {/* 状态圆点 */}
        <span
          className="inline-block w-2 h-2 rounded-full flex-shrink-0"
          style={{
            backgroundColor: dotColor,
            boxShadow: status === 'connected' ? `0 0 6px ${dotColor}` : 'none',
          }}
        />
        {/* 实例标签 */}
        <span
          className="text-[11px] font-mono font-medium truncate"
          style={{ color: 'var(--app-text)' }}
        >
          {instanceLabel || statusText}
        </span>
      </div>

      {/* 底部行：状态文字 + 延迟 */}
      <div className="flex items-center justify-between mt-1">
        <span
          className="text-[10px]"
          style={{ color: dotColor }}
        >
          {statusText}
        </span>
        {latencyMs !== undefined && status === 'connected' && (
          <span
            className="text-[10px] font-mono"
            style={{ color: 'var(--app-text-muted)' }}
          >
            {latencyMs}ms
          </span>
        )}
      </div>
    </div>
  );
};

export default RemoteModeIndicator;
