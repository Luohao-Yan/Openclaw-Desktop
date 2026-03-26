import React from 'react';
import AppButton from '../../../components/AppButton';
import type { GatewayStatusModel } from './types';
import { statusDotStyle } from './utils';

interface GatewayHealthAlertProps {
  gatewayDotColor: string;
  gatewayStatus: GatewayStatusModel;
  isGatewayActionPending: boolean;
  onOpenLogs: () => Promise<void>;
  onRetry: () => Promise<void>;
}

const GatewayHealthAlert: React.FC<GatewayHealthAlertProps> = ({
  gatewayDotColor,
  gatewayStatus,
  isGatewayActionPending,
  onOpenLogs,
  onRetry,
}) => {
  return (
    <div
      className="rounded-[24px] border p-5"
      style={{
        backgroundColor: 'rgba(248, 113, 113, 0.06)',
        borderColor: 'rgba(248, 113, 113, 0.2)',
      }}
    >
      <div className="flex items-start gap-3">
        <span className="mt-2 h-3 w-3 rounded-full" style={statusDotStyle(gatewayDotColor)} />
        <div className="min-w-0 flex-1">
          <div className="text-lg font-semibold" style={{ color: 'var(--app-text)' }}>
            Gateway 当前不可用
          </div>
          <div className="mt-2 text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
            {gatewayStatus.error || 'Gateway is not available'}
          </div>
          <div className="mt-1 text-sm" style={{ color: 'var(--app-text-muted)' }}>
            目标地址：{gatewayStatus.host || '127.0.0.1'}:{gatewayStatus.port || 18789}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <AppButton
              variant="secondary"
              disabled={isGatewayActionPending}
              onClick={() => void onRetry()}
            >
              Retry now
            </AppButton>
            <button
              type="button"
              onClick={() => void onOpenLogs()}
              className="text-sm font-medium transition-token-normal hover:opacity-80"
              style={{ color: 'var(--app-text-muted)' }}
            >
              Open logs
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GatewayHealthAlert;
