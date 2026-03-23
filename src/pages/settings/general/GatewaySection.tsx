import React from 'react';
import { ServerCog } from 'lucide-react';
import AppButton from '../../../components/AppButton';
import type { OpenClawCommandDiagnostic } from '../../../types/electron';
import ToggleRow from './ToggleRow';
import type { GatewayStatusModel, GeneralSettings, OpenClawRunMode } from './types';
import { statusDotStyle } from './utils';

interface GatewaySectionProps {
  commandDiagnostic: OpenClawCommandDiagnostic | null;
  gatewayDotColor: string;
  gatewayHeadline: string;
  gatewayStatus: GatewayStatusModel;
  isGatewayActionPending: boolean;
  loadAll: () => Promise<void>;
  onChangePathDraft: (key: 'openclawPath' | 'openclawRootDir', value: string) => void;
  onAutoRepairOpenClawCommand: () => Promise<void>;
  onGatewayRestart: () => Promise<void>;
  onGatewayToggle: (enabled: boolean) => Promise<void>;
  onOpenLogs: () => Promise<void>;
  onResetPathDraft: () => void;
  onSettingChange: <K extends keyof GeneralSettings>(
    key: K,
    value: GeneralSettings[K],
  ) => Promise<void>;
  onSavePathSettings: () => Promise<void>;
  onTestOpenClawCommand: () => Promise<void>;
  onUseDetectedCommandPath: () => void;
  pathDraft: {
    openclawPath: string;
    openclawRootDir: string;
  };
  pathDraftDirty: boolean;
  settings: GeneralSettings;
}

const GatewaySection: React.FC<GatewaySectionProps> = ({
  commandDiagnostic,
  gatewayDotColor,
  gatewayHeadline,
  gatewayStatus,
  isGatewayActionPending,
  loadAll,
  onChangePathDraft,
  onAutoRepairOpenClawCommand,
  onGatewayRestart,
  onGatewayToggle,
  onOpenLogs,
  onResetPathDraft,
  onSettingChange,
  onSavePathSettings,
  onTestOpenClawCommand,
  onUseDetectedCommandPath,
  pathDraft,
  pathDraftDirty,
  settings,
}) => {
  return (
    <div
      className="rounded-[24px] border p-6"
      style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)' }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-medium" style={{ color: 'var(--app-text-muted)' }}>
            本地连接
          </div>
          <div className="mt-2 text-2xl font-semibold" style={{ color: 'var(--app-text)' }}>
            OpenClaw Gateway
          </div>
          <div className="mt-2 text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
            管理本机运行的 Gateway，决定消息处理与控制台连接是否可用。
          </div>
        </div>
        <div
          className="flex h-11 w-11 items-center justify-center rounded-2xl"
          style={{ backgroundColor: 'rgba(59, 130, 246, 0.12)' }}
        >
          <ServerCog size={20} style={{ color: '#60A5FA' }} />
        </div>
      </div>

      <div
        className="mt-5 rounded-[20px] border p-5"
        style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', borderColor: 'var(--app-border)' }}
      >
        <ToggleRow
          checked={settings.openclawActive}
          label="OpenClaw 运行中"
          description="暂停后将停止本机 Gateway，新的请求不会继续被处理。"
          disabled={isGatewayActionPending}
          onChange={(value) => void onGatewayToggle(value)}
        />

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <div className="mb-2 text-sm font-medium" style={{ color: 'var(--app-text)' }}>
              运行位置
            </div>
            <select
              value={settings.runMode}
              onChange={(event) => void onSettingChange('runMode', event.target.value as OpenClawRunMode)}
              className="w-full rounded-2xl px-4 py-3 text-sm focus:outline-none"
              style={{
                backgroundColor: 'var(--app-bg-subtle)',
                border: '1px solid var(--app-border)',
                color: 'var(--app-text)',
              }}
            >
              <option value="local">本机（当前 Mac）</option>
            </select>
          </div>
          <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--app-bg-subtle)' }}>
            <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>连接地址</div>
            <div className="mt-2 text-sm font-semibold" style={{ color: 'var(--app-text)' }}>
              {gatewayStatus.host || '127.0.0.1'}:{gatewayStatus.port || 18789}
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-2xl p-4" style={{ backgroundColor: 'rgba(59, 130, 246, 0.06)' }}>
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full" style={statusDotStyle(gatewayDotColor)} />
            <div className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
              {gatewayHeadline}
            </div>
          </div>
          <div className="mt-3 space-y-1 text-sm" style={{ color: 'var(--app-text-muted)' }}>
            <div>版本：{gatewayStatus.version || 'unknown'}</div>
            <div>PID / 在线时长：{gatewayStatus.pid || 'n/a'} / {gatewayStatus.uptime || 'n/a'}</div>
            {gatewayStatus.error && <div>最近错误：{gatewayStatus.error}</div>}
          </div>
        </div>

        <div
          className="mt-5 rounded-2xl border p-4"
          style={{
            backgroundColor: 'var(--app-bg-subtle)',
            borderColor: 'var(--app-border)',
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
                OpenClaw CLI 诊断
              </div>
              <div className="mt-1 text-sm leading-6" style={{ color: 'var(--app-text-muted)' }}>
                用于检查桌面端当前解析到的命令路径、PATH 命中情况以及版本测试结果。
              </div>
            </div>
            <div
              className="rounded-full px-2.5 py-1 text-xs font-medium"
              style={{
                backgroundColor: commandDiagnostic?.versionSuccess
                  ? 'rgba(16, 185, 129, 0.12)'
                  : 'rgba(239, 68, 68, 0.12)',
                color: commandDiagnostic?.versionSuccess ? '#34D399' : '#F87171',
              }}
            >
              {commandDiagnostic?.versionSuccess ? '可执行' : '待修复'}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--app-bg-elevated)' }}>
              <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>当前解析命令</div>
              <div className="mt-2 break-all text-sm font-semibold" style={{ color: 'var(--app-text)' }}>
                {commandDiagnostic?.resolvedCommand || 'openclaw'}
              </div>
              <div className="mt-2 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                configured: {commandDiagnostic?.configuredPath || '未手动配置，使用 PATH'}
              </div>
            </div>

            <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--app-bg-elevated)' }}>
              <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>PATH 检测</div>
              <div className="mt-2 text-sm font-semibold" style={{ color: 'var(--app-text)' }}>
                {commandDiagnostic?.pathEnvHit ? '已命中' : '未命中'}
              </div>
              <div className="mt-2 break-all text-xs" style={{ color: 'var(--app-text-muted)' }}>
                {commandDiagnostic?.pathEnvCommand || '当前 GUI 进程 PATH 中未发现 openclaw'}
              </div>
            </div>

            <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--app-bg-elevated)' }}>
              <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>自动检测结果</div>
              <div className="mt-2 break-all text-sm font-semibold" style={{ color: 'var(--app-text)' }}>
                {commandDiagnostic?.detectedPath || '未找到候选路径'}
              </div>
              <div className="mt-2 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                source: {commandDiagnostic?.detectedSource || 'unknown'}
              </div>
            </div>

            <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--app-bg-elevated)' }}>
              <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>版本测试</div>
              <div className="mt-2 text-sm font-semibold" style={{ color: 'var(--app-text)' }}>
                {commandDiagnostic?.versionSuccess ? (commandDiagnostic.versionOutput || '命令执行成功') : '执行失败'}
              </div>
              {!commandDiagnostic?.versionSuccess && (
                <div className="mt-2 break-words text-xs" style={{ color: '#F87171' }}>
                  {commandDiagnostic?.error || 'openclaw --version 未通过'}
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <AppButton
              variant="secondary"
              size="sm"
              disabled={isGatewayActionPending}
              onClick={() => void onTestOpenClawCommand()}
            >
              测试 openclaw --version
            </AppButton>
            <AppButton
              variant="secondary"
              size="sm"
              disabled={isGatewayActionPending}
              onClick={() => void onAutoRepairOpenClawCommand()}
            >
              自动修复命令路径
            </AppButton>
          </div>
        </div>

        <div
          className="mt-5 rounded-2xl border p-4"
          style={{
            backgroundColor: 'var(--app-bg-subtle)',
            borderColor: 'var(--app-border)',
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
                OpenClaw 路径配置
              </div>
              <div className="mt-1 text-sm leading-6" style={{ color: 'var(--app-text-muted)' }}>
                你可以手动指定 CLI 可执行文件和 root 目录。保存后会立即刷新当前诊断结果。
              </div>
            </div>
            <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
              当前 root: {commandDiagnostic?.rootDir || settings.openclawRootDir || 'default ~/.openclaw'}
            </div>
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--app-text)' }}>
                openclaw 可执行文件路径
              </label>
              <input
                type="text"
                value={pathDraft.openclawPath}
                onChange={(event) => onChangePathDraft('openclawPath', event.target.value)}
                placeholder="例如 /opt/homebrew/bin/openclaw"
                className="w-full rounded-2xl px-4 py-3 text-sm focus:outline-none"
                style={{
                  backgroundColor: 'var(--app-bg-elevated)',
                  border: '1px solid var(--app-border)',
                  color: 'var(--app-text)',
                }}
              />
              <div className="mt-2 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                为空时默认使用 `openclaw` 并依赖系统 PATH。
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--app-text)' }}>
                OpenClaw root 目录
              </label>
              <input
                type="text"
                value={pathDraft.openclawRootDir}
                onChange={(event) => onChangePathDraft('openclawRootDir', event.target.value)}
                placeholder="例如 /Users/yourname/.openclaw"
                className="w-full rounded-2xl px-4 py-3 text-sm focus:outline-none"
                style={{
                  backgroundColor: 'var(--app-bg-elevated)',
                  border: '1px solid var(--app-border)',
                  color: 'var(--app-text)',
                }}
              />
              <div className="mt-2 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                为空时默认使用 `~/.openclaw`。
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <AppButton
              variant="success"
              size="sm"
              disabled={isGatewayActionPending || !pathDraftDirty}
              onClick={() => void onSavePathSettings()}
            >
              保存路径配置
            </AppButton>
            <AppButton
              variant="secondary"
              size="sm"
              disabled={isGatewayActionPending || !commandDiagnostic?.detectedPath}
              onClick={onUseDetectedCommandPath}
            >
              使用检测到的命令路径
            </AppButton>
            <AppButton
              variant="secondary"
              size="sm"
              disabled={isGatewayActionPending || !pathDraftDirty}
              onClick={onResetPathDraft}
            >
              撤销未保存修改
            </AppButton>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <AppButton
            variant="secondary"
            size="sm"
            disabled={isGatewayActionPending}
            onClick={() => void loadAll()}
          >
            Recheck
          </AppButton>
          <AppButton
            variant="secondary"
            size="sm"
            disabled={isGatewayActionPending}
            onClick={() => void onGatewayRestart()}
          >
            Restart
          </AppButton>
          <button
            type="button"
            onClick={() => void onOpenLogs()}
            className="text-sm font-medium transition-opacity duration-200 hover:opacity-80"
            style={{ color: '#60A5FA' }}
          >
            Open logs
          </button>
        </div>
      </div>
    </div>
  );
};

export default GatewaySection;
