import React from 'react';
import { Monitor, Shield } from 'lucide-react';
import type { GatewayStatusModel, GeneralSettings } from './types';
import { statusDotStyle } from './utils';

interface GeneralOverviewCardsProps {
  gatewayDotColor: string;
  gatewayHeadline: string;
  gatewayStatus: GatewayStatusModel;
  settings: GeneralSettings;
}

const GeneralOverviewCards: React.FC<GeneralOverviewCardsProps> = ({
  gatewayDotColor,
  gatewayHeadline,
  gatewayStatus,
  settings,
}) => {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
      <div
        className="rounded-[24px] border p-5 xl:col-span-2"
        style={{
          background:
            'linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, rgba(45, 212, 191, 0.08) 100%)',
          borderColor: 'rgba(96, 165, 250, 0.22)',
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium" style={{ color: 'var(--app-text-muted)' }}>
              OpenClaw 运行状态
            </div>
            <div
              className="mt-2 text-2xl font-semibold leading-tight"
              style={{ color: 'var(--app-text)' }}
            >
              {settings.openclawActive ? '随时待命' : '已暂停服务'}
            </div>
            <div className="mt-3 text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
              {gatewayHeadline}
            </div>
          </div>
          <div className="h-3 w-3 rounded-full" style={statusDotStyle(gatewayDotColor)} />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl p-4" style={{ backgroundColor: 'rgba(255, 255, 255, 0.5)' }}>
            <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>运行模式</div>
            <div className="mt-2 font-semibold" style={{ color: 'var(--app-text)' }}>本机本地</div>
          </div>
          <div className="rounded-2xl p-4" style={{ backgroundColor: 'rgba(255, 255, 255, 0.5)' }}>
            <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>Gateway 版本</div>
            <div className="mt-2 font-semibold" style={{ color: 'var(--app-text)' }}>
              {gatewayStatus.version || 'unknown'}
            </div>
          </div>
          <div className="rounded-2xl p-4" style={{ backgroundColor: 'rgba(255, 255, 255, 0.5)' }}>
            <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>远程访问</div>
            <div className="mt-2 font-semibold" style={{ color: 'var(--app-text)' }}>
              {settings.exposureMode === 'off'
                ? '未开启'
                : settings.exposureMode === 'tailnet'
                  ? 'Tailnet'
                  : 'Public'}
            </div>
          </div>
        </div>
      </div>

      <div
        className="rounded-[24px] border p-5"
        style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-2xl"
            style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)' }}
          >
            <Monitor size={20} style={{ color: '#34D399' }} />
          </div>
          <div>
            <div className="text-sm font-medium" style={{ color: 'var(--app-text-muted)' }}>
              桌面体验
            </div>
            <div className="mt-1 text-lg font-semibold" style={{ color: 'var(--app-text)' }}>
              {settings.showDockIcon ? '标准桌面模式' : '轻量驻留模式'}
            </div>
          </div>
        </div>
        <div className="mt-4 space-y-2 text-sm" style={{ color: 'var(--app-text-muted)' }}>
          <div>Dock 图标：{settings.showDockIcon ? '显示' : '隐藏'}</div>
          <div>开机启动：{settings.launchAtLogin ? '已开启' : '未开启'}</div>
          <div>状态动效：{settings.playMenuBarAnimations ? '开启' : '关闭'}</div>
        </div>
      </div>

      <div
        className="rounded-[24px] border p-5"
        style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-2xl"
            style={{ backgroundColor: 'rgba(251, 191, 36, 0.12)' }}
          >
            <Shield size={20} style={{ color: '#FBBF24' }} />
          </div>
          <div>
            <div className="text-sm font-medium" style={{ color: 'var(--app-text-muted)' }}>
              互动权限
            </div>
            <div className="mt-1 text-lg font-semibold" style={{ color: 'var(--app-text)' }}>
              {settings.allowCanvas && settings.allowCamera ? '已开启常用能力' : '部分能力受限'}
            </div>
          </div>
        </div>
        <div className="mt-4 space-y-2 text-sm" style={{ color: 'var(--app-text-muted)' }}>
          <div>Canvas：{settings.allowCanvas ? '允许' : '关闭'}</div>
          <div>Camera：{settings.allowCamera ? '允许' : '关闭'}</div>
          <div>Peekaboo：{settings.enablePeekabooBridge ? '开启' : '关闭'}</div>
        </div>
      </div>
    </div>
  );
};

export default GeneralOverviewCards;
