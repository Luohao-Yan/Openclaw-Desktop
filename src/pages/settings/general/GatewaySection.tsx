import React, { useState, useEffect } from 'react';
import { ServerCog, Wifi, WifiOff, Eye, EyeOff } from 'lucide-react';
import AppButton from '../../../components/AppButton';
import type { OpenClawCommandDiagnostic } from '../../../types/electron';
import ToggleRow from './ToggleRow';
import type { GatewayStatusModel, GeneralSettings, OpenClawRunMode } from './types';
import { statusDotStyle } from './utils';

/** 远程连接表单暂存状态 */
interface RemoteConnectionDraft {
  host: string;
  port: string;
  protocol: 'http' | 'https';
  token: string;
}

/** 已保存的远程连接配置（从 settings 传入） */
interface SavedRemoteConnection {
  host?: string;
  port?: number;
  protocol?: 'http' | 'https';
  token?: string;
}

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
  /** 已保存的远程连接配置，用于切换到 remote 模式时回显已保存的表单值 */
  savedRemoteConnection?: SavedRemoteConnection;
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
  savedRemoteConnection,
}) => {
  const isRemote = settings.runMode === 'remote';

  // 远程连接表单状态（优先从 savedRemoteConnection 回显已保存的配置）
  const [remoteDraft, setRemoteDraft] = useState<RemoteConnectionDraft>({
    host: savedRemoteConnection?.host ?? '',
    port: savedRemoteConnection?.port ? String(savedRemoteConnection.port) : '3000',
    protocol: savedRemoteConnection?.protocol ?? 'http',
    token: savedRemoteConnection?.token ?? '',
  });

  // 当 savedRemoteConnection 更新（页面加载后异步回填），同步更新表单
  useEffect(() => {
    if (savedRemoteConnection) {
      setRemoteDraft({
        host: savedRemoteConnection.host ?? '',
        port: savedRemoteConnection.port ? String(savedRemoteConnection.port) : '3000',
        protocol: savedRemoteConnection.protocol ?? 'http',
        token: savedRemoteConnection.token ?? '',
      });
    }
  }, [savedRemoteConnection]);
  const [showToken, setShowToken] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isSavingConnection, setIsSavingConnection] = useState(false);
  const [connectionMsg, setConnectionMsg] = useState('');
  const [connectionOk, setConnectionOk] = useState<boolean | null>(null);

  const showConnectionMsg = (msg: string, ok: boolean) => {
    setConnectionMsg(msg);
    setConnectionOk(ok);
    setTimeout(() => setConnectionMsg(''), 5000);
  };

  /** 测试远程连接 */
  const handleTestRemoteConnection = async () => {
    if (!remoteDraft.host.trim()) {
      showConnectionMsg('请先填写远程主机地址', false);
      return;
    }
    setIsTestingConnection(true);
    try {
      const result = await window.electronAPI.remoteOpenClawTestConnection?.({
        host: remoteDraft.host.trim(),
        port: parseInt(remoteDraft.port, 10) || 3000,
        protocol: remoteDraft.protocol,
        token: remoteDraft.token.trim() || undefined,
      });
      if (result?.success) {
        showConnectionMsg(`连接成功！远程版本: ${result.version || 'unknown'}`, true);
      } else {
        showConnectionMsg(`连接失败：${result?.error || '未知错误'}`, false);
      }
    } catch (err: any) {
      showConnectionMsg(`连接异常：${err.message}`, false);
    } finally {
      setIsTestingConnection(false);
    }
  };

  /** 保存远程连接配置并切换运行模式 */
  const handleSaveRemoteConnection = async () => {
    if (!remoteDraft.host.trim()) {
      showConnectionMsg('请先填写远程主机地址', false);
      return;
    }
    setIsSavingConnection(true);
    try {
      const result = await window.electronAPI.remoteOpenClawSaveConnection?.({
        host: remoteDraft.host.trim(),
        port: parseInt(remoteDraft.port, 10) || 3000,
        protocol: remoteDraft.protocol,
        token: remoteDraft.token.trim() || undefined,
      });
      if (result?.success) {
        showConnectionMsg('远程连接已保存，应用已切换到远程模式', true);
        await onSettingChange('runMode', 'remote');
      } else {
        showConnectionMsg(`保存失败：${result?.error || '未知错误'}`, false);
      }
    } catch (err: any) {
      showConnectionMsg(`保存异常：${err.message}`, false);
    } finally {
      setIsSavingConnection(false);
    }
  };

  /** 切换回本地模式 */
  const handleSwitchToLocal = async () => {
    await onSettingChange('runMode', 'local');
    setConnectionMsg('');
    setConnectionOk(null);
  };

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

        {/* 运行模式切换 */}
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
              <option value="remote">远程 OpenClaw 服务器</option>
            </select>
          </div>
          <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--app-bg-subtle)' }}>
            <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>连接地址</div>
            <div className="mt-2 text-sm font-semibold" style={{ color: 'var(--app-text)' }}>
              {isRemote
                ? '远程连接已开启，请填写下方表单'
                : `${gatewayStatus.host || '127.0.0.1'}:${gatewayStatus.port || 18789}`}
            </div>
          </div>
        </div>

        {/* 远程连接配置卡片（runMode === 'remote' 时展开） */}
        {isRemote && (
          <div
            className="mt-5 rounded-2xl border p-4 space-y-4"
            style={{
              backgroundColor: 'rgba(99, 102, 241, 0.06)',
              borderColor: 'rgba(99, 102, 241, 0.25)',
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wifi size={15} style={{ color: '#818CF8' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--app-text)' }}>
                  远程连接配置
                </span>
              </div>
              <button
                onClick={() => void handleSwitchToLocal()}
                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg transition-opacity hover:opacity-70"
                style={{ color: '#F87171', backgroundColor: 'rgba(244,63,94,0.10)' }}
              >
                <WifiOff size={11} />
                切回本地模式
              </button>
            </div>

            {/* 协议 + 主机 + 端口 */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[120px_1fr_100px]">
              <div>
                <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--app-text-muted)' }}>
                  协议
                </label>
                <select
                  value={remoteDraft.protocol}
                  onChange={(e) => setRemoteDraft((d) => ({ ...d, protocol: e.target.value as 'http' | 'https' }))}
                  className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none"
                  style={{
                    backgroundColor: 'var(--app-bg-elevated)',
                    border: '1px solid var(--app-border)',
                    color: 'var(--app-text)',
                  }}
                >
                  <option value="http">http</option>
                  <option value="https">https</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--app-text-muted)' }}>
                  主机 / IP
                </label>
                <input
                  type="text"
                  value={remoteDraft.host}
                  onChange={(e) => setRemoteDraft((d) => ({ ...d, host: e.target.value }))}
                  placeholder="例如 192.168.1.100 或 my-server.com"
                  className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none"
                  style={{
                    backgroundColor: 'var(--app-bg-elevated)',
                    border: '1px solid var(--app-border)',
                    color: 'var(--app-text)',
                  }}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--app-text-muted)' }}>
                  端口
                </label>
                <input
                  type="number"
                  value={remoteDraft.port}
                  onChange={(e) => setRemoteDraft((d) => ({ ...d, port: e.target.value }))}
                  placeholder="3000"
                  className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none"
                  style={{
                    backgroundColor: 'var(--app-bg-elevated)',
                    border: '1px solid var(--app-border)',
                    color: 'var(--app-text)',
                  }}
                />
              </div>
            </div>

            {/* 访问令牌 (Token) */}
            <div>
              <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--app-text-muted)' }}>
                访问令牌（Token）— 可选
              </label>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={remoteDraft.token}
                  onChange={(e) => setRemoteDraft((d) => ({ ...d, token: e.target.value }))}
                  placeholder="Bearer token 或空着不需要认证"
                  className="w-full rounded-xl px-3 py-2.5 pr-10 text-sm focus:outline-none"
                  style={{
                    backgroundColor: 'var(--app-bg-elevated)',
                    border: '1px solid var(--app-border)',
                    color: 'var(--app-text)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowToken((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-opacity hover:opacity-70"
                  style={{ color: 'var(--app-text-muted)' }}
                  title={showToken ? '隐藏' : '显示'}
                >
                  {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* 操作按钮行 */}
            <div className="flex flex-wrap items-center gap-2">
              <AppButton
                variant="secondary"
                size="sm"
                disabled={isTestingConnection || isSavingConnection}
                onClick={() => void handleTestRemoteConnection()}
              >
                {isTestingConnection ? '测试中...' : '测试连接'}
              </AppButton>
              <AppButton
                variant="success"
                size="sm"
                disabled={isTestingConnection || isSavingConnection || !remoteDraft.host.trim()}
                onClick={() => void handleSaveRemoteConnection()}
              >
                {isSavingConnection ? '保存中...' : '保存并切换'}
              </AppButton>
            </div>

            {/* 连接结果提示 */}
            {connectionMsg && (
              <div
                className="rounded-xl px-3 py-2.5 text-xs"
                style={{
                  backgroundColor: connectionOk ? 'rgba(16,185,129,0.10)' : 'rgba(244,63,94,0.10)',
                  border: `1px solid ${connectionOk ? 'rgba(16,185,129,0.30)' : 'rgba(244,63,94,0.30)'}`,
                  color: connectionOk ? '#34D399' : '#F87171',
                }}
              >
                {connectionMsg}
              </div>
            )}
          </div>
        )}

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
            className="text-sm font-medium transition-token-normal hover:opacity-80"
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
