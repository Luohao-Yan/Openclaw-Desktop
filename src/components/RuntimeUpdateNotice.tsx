import React from 'react';
import type { DesktopRuntimeInfo } from '../contexts/DesktopRuntimeContext';

interface RuntimeUpdateNoticeProps {
  className?: string;
  message?: string;
  runtimeInfo: DesktopRuntimeInfo | null;
}

const RuntimeUpdateNotice: React.FC<RuntimeUpdateNoticeProps> = ({
  className = '',
  message,
  runtimeInfo,
}) => {
  if (!runtimeInfo) {
    return null;
  }

  return (
    <div
      className={`rounded-xl border px-4 py-3 text-sm ${className}`.trim()}
      style={{
        backgroundColor: 'rgba(251, 191, 36, 0.10)',
        borderColor: 'rgba(251, 191, 36, 0.24)',
        color: '#FDE68A',
      }}
    >
      {message || `当前是 ${runtimeInfo.appVersionLabel}。桌面端有一部分新能力还未完成加载，请先重启应用完成更新。`}
    </div>
  );
};

export default RuntimeUpdateNotice;
