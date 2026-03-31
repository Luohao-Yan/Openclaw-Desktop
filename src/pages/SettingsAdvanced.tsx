import React, { useState, useEffect } from 'react';
import { AlertTriangle, RotateCcw, Download } from 'lucide-react';
import AppButton from '../components/AppButton';
import GlassCard from '../components/GlassCard';
import { useI18n } from '../i18n/I18nContext';
import UninstallOpenclawCard from './settings/UninstallOpenclawCard';
import OpenClawVersionPanel from './settings/OpenClawVersionPanel';

const SettingsAdvanced: React.FC = () => {
  const { t } = useI18n();

  // 重置状态
  const [isResetting, setIsResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [resetConfirm, setResetConfirm] = useState(false);

  // 重装状态
  const [isReinstalling, setIsReinstalling] = useState(false);
  const [reinstallMessage, setReinstallMessage] = useState('');
  const [reinstallOutput, setReinstallOutput] = useState('');
  const [reinstallConfirm, setReinstallConfirm] = useState(false);

  // 运行模式和远程主机地址（用于传入 UninstallOpenclawCard）
  const [runMode, setRunMode] = useState<'local' | 'remote'>('local');
  const [remoteHost, setRemoteHost] = useState<string | undefined>(undefined);

  /** 从 settings 读取 runMode 和远程连接地址 */
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const result = await window.electronAPI.settingsGet<{
          runMode?: 'local' | 'remote';
          remoteConnection?: { host?: string };
        }>();
        if (result.success && result.settings) {
          setRunMode(result.settings.runMode || 'local');
          setRemoteHost(result.settings.remoteConnection?.host);
        }
      } catch {
        // 读取失败时保持默认值 local
      }
    };
    void loadSettings();
  }, []);

  /** 重置应用配置 */
  const handleReset = async () => {
    if (!resetConfirm) {
      setResetConfirm(true);
      return;
    }
    try {
      setIsResetting(true);
      setResetMessage('');
      const result = await window.electronAPI.appConfigReset();
      if (result.success) {
        setResetMessage(t('settings.advanced.resetAppSuccess'));
      } else {
        setResetMessage(`错误：${result.error || '重置失败'}`);
      }
    } catch (err: any) {
      setResetMessage(`错误：${err.message}`);
    } finally {
      setIsResetting(false);
      setResetConfirm(false);
    }
  };

  /** 重装 OpenClaw */
  const handleReinstall = async () => {
    if (!reinstallConfirm) {
      setReinstallConfirm(true);
      return;
    }
    try {
      setIsReinstalling(true);
      setReinstallMessage(t('settings.advanced.reinstallOpenclawRunning'));
      setReinstallOutput('');
      const result = await window.electronAPI.appConfigReinstallOpenclaw();
      if (result.success) {
        setReinstallMessage(t('settings.advanced.reinstallOpenclawSuccess'));
      } else {
        setReinstallMessage(`错误：${result.error || '重装失败'}`);
      }
      if (result.output) {
        setReinstallOutput(result.output);
      }
    } catch (err: any) {
      setReinstallMessage(`错误：${err.message}`);
    } finally {
      setIsReinstalling(false);
      setReinstallConfirm(false);
    }
  };

  return (
    <div className="space-y-6 p-1">
      {/* OpenClaw 版本管理 */}
      <OpenClawVersionPanel />

      {/* 危险操作区域标题 */}
      <div className="flex items-center gap-2">
        <AlertTriangle size={16} style={{ color: '#FB7185' }} />
        <span className="text-sm font-semibold uppercase tracking-widest" style={{ color: '#FB7185' }}>
          {t('settings.advanced.dangerZone')}
        </span>
      </div>

      {/* 重置应用配置 */}
      <GlassCard
        className="rounded-2xl p-5 space-y-4"
        style={{
          border: '1px solid rgba(251, 113, 133, 0.25)',
          background: 'linear-gradient(135deg, rgba(244, 63, 94, 0.06) 0%, var(--app-bg-elevated) 100%)',
        }}
      >
        <div className="flex items-start gap-4">
          {/* 图标 */}
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: 'rgba(244, 63, 94, 0.12)', color: '#FB7185' }}
          >
            <RotateCcw size={18} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold" style={{ color: 'var(--app-text)' }}>
              {t('settings.advanced.resetApp')}
            </div>
            <div className="mt-1 text-sm leading-6" style={{ color: 'var(--app-text-muted)' }}>
              {t('settings.advanced.resetAppDescription')}
            </div>

            {/* 二次确认提示 */}
            {resetConfirm && (
              <div
                className="mt-3 rounded-xl px-4 py-3 text-sm"
                style={{
                  backgroundColor: 'rgba(244, 63, 94, 0.10)',
                  border: '1px solid rgba(244, 63, 94, 0.30)',
                  color: '#FB7185',
                }}
              >
                {t('settings.advanced.resetAppConfirm')}
              </div>
            )}

            {/* 操作结果 */}
            {resetMessage && (
              <div
                className="mt-3 rounded-xl px-4 py-3 text-sm"
                style={{
                  backgroundColor: resetMessage.startsWith('错误')
                    ? 'rgba(244, 63, 94, 0.10)'
                    : 'rgba(34, 197, 94, 0.10)',
                  border: `1px solid ${resetMessage.startsWith('错误') ? 'rgba(244, 63, 94, 0.30)' : 'rgba(34, 197, 94, 0.30)'}`,
                  color: resetMessage.startsWith('错误') ? '#FB7185' : '#4ADE80',
                }}
              >
                {resetMessage}
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <AppButton
                variant="danger"
                onClick={handleReset}
                disabled={isResetting}
                icon={<RotateCcw size={14} />}
              >
                {isResetting ? '重置中...' : resetConfirm ? '确认重置' : t('settings.advanced.resetApp')}
              </AppButton>
              {resetConfirm && (
                <AppButton
                  variant="secondary"
                  onClick={() => setResetConfirm(false)}
                >
                  取消
                </AppButton>
              )}
            </div>
          </div>
        </div>
      </GlassCard>

      {/* 重装 OpenClaw */}
      <GlassCard
        className="rounded-2xl p-5 space-y-4"
        style={{
          border: '1px solid rgba(251, 113, 133, 0.25)',
          background: 'linear-gradient(135deg, rgba(244, 63, 94, 0.06) 0%, var(--app-bg-elevated) 100%)',
        }}
      >
        <div className="flex items-start gap-4">
          {/* 图标 */}
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: 'rgba(244, 63, 94, 0.12)', color: '#FB7185' }}
          >
            <Download size={18} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold" style={{ color: 'var(--app-text)' }}>
              {t('settings.advanced.reinstallOpenclaw')}
            </div>
            <div className="mt-1 text-sm leading-6" style={{ color: 'var(--app-text-muted)' }}>
              {t('settings.advanced.reinstallOpenclawDescription')}
            </div>

            {/* 二次确认提示 */}
            {reinstallConfirm && (
              <div
                className="mt-3 rounded-xl px-4 py-3 text-sm"
                style={{
                  backgroundColor: 'rgba(244, 63, 94, 0.10)',
                  border: '1px solid rgba(244, 63, 94, 0.30)',
                  color: '#FB7185',
                }}
              >
                {t('settings.advanced.reinstallOpenclawConfirm')}
              </div>
            )}

            {/* 操作结果 */}
            {reinstallMessage && (
              <div
                className="mt-3 rounded-xl px-4 py-3 text-sm"
                style={{
                  backgroundColor: reinstallMessage.startsWith('错误')
                    ? 'rgba(244, 63, 94, 0.10)'
                    : 'rgba(34, 197, 94, 0.10)',
                  border: `1px solid ${reinstallMessage.startsWith('错误') ? 'rgba(244, 63, 94, 0.30)' : 'rgba(34, 197, 94, 0.30)'}`,
                  color: reinstallMessage.startsWith('错误') ? '#FB7185' : '#4ADE80',
                }}
              >
                {reinstallMessage}
              </div>
            )}

            {/* 安装输出日志 */}
            {reinstallOutput && (
              <pre
                className="mt-3 rounded-xl px-4 py-3 text-xs overflow-auto max-h-48"
                style={{
                  backgroundColor: 'var(--app-bg-subtle)',
                  border: '1px solid var(--app-border)',
                  color: 'var(--app-text-muted)',
                  fontFamily: 'monospace',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {reinstallOutput}
              </pre>
            )}

            <div className="mt-4 flex gap-2">
              <AppButton
                variant="danger"
                onClick={handleReinstall}
                disabled={isReinstalling}
                icon={<Download size={14} />}
              >
                {isReinstalling
                  ? t('settings.advanced.reinstallOpenclawRunning')
                  : reinstallConfirm
                    ? '确认重装'
                    : t('settings.advanced.reinstallOpenclaw')}
              </AppButton>
              {reinstallConfirm && (
                <AppButton
                  variant="secondary"
                  onClick={() => setReinstallConfirm(false)}
                >
                  取消
                </AppButton>
              )}
            </div>
          </div>
        </div>
      </GlassCard>

      {/* 卸载 OpenClaw — 第三张危险操作卡片 */}
      <UninstallOpenclawCard runMode={runMode} remoteHost={remoteHost} />
    </div>
  );
};

export default SettingsAdvanced;
