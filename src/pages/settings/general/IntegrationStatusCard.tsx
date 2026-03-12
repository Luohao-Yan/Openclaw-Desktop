import React from 'react';
import {
  AlertCircle,
  Bug,
  Camera,
  ExternalLink,
  Globe,
  Sparkles,
} from 'lucide-react';

interface IntegrationStatusCardProps {
  onOpenLogs: () => Promise<void>;
}

const IntegrationStatusCard: React.FC<IntegrationStatusCardProps> = ({
  onOpenLogs,
}) => {
  return (
    <div
      className="rounded-[24px] border p-6"
      style={{
        backgroundColor: 'rgba(59, 130, 246, 0.05)',
        borderColor: 'rgba(59, 130, 246, 0.14)',
      }}
    >
      <div className="flex items-start gap-4">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
          style={{ backgroundColor: 'rgba(59, 130, 246, 0.12)' }}
        >
          <Sparkles size={20} style={{ color: '#60A5FA' }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold" style={{ color: 'var(--app-text)' }}>
            当前集成状态
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
            <div className="flex items-start gap-2">
              <AlertCircle size={15} className="mt-1 shrink-0" />
              <span>Gateway 的检测、启动、停止与重启已经接入 Electron IPC。</span>
            </div>
            <div className="flex items-start gap-2">
              <Globe size={15} className="mt-1 shrink-0" />
              <span>Tailscale 的状态检测与 Serve / Funnel 曝光模式已接通本地命令能力。</span>
            </div>
            <div className="flex items-start gap-2">
              <Camera size={15} className="mt-1 shrink-0" />
              <span>桌面偏好和权限开关会继续通过现有设置存储持久化。</span>
            </div>
            <div className="flex items-start gap-2">
              <Bug size={15} className="mt-1 shrink-0" />
              <span>日志入口会直接打开本地 Gateway 日志文件，方便排查问题。</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void onOpenLogs()}
            className="mt-4 inline-flex items-center gap-2 text-sm font-medium transition-opacity duration-200 hover:opacity-80"
            style={{ color: '#60A5FA' }}
          >
            <ExternalLink size={14} />
            Open gateway log
          </button>
        </div>
      </div>
    </div>
  );
};

export default IntegrationStatusCard;
