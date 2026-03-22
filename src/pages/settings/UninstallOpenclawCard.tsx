/**
 * UninstallOpenclawCard — 卸载 OpenClaw 功能卡片
 *
 * 在「设置 → 高级」危险操作区域展示，支持三条执行路径：
 * - Easy Path：本地模式，自动执行 openclaw uninstall 命令
 * - Remote SSH Path：远程模式，通过 SSH 在远程主机执行卸载
 * - Manual Path：SSH 失败或本地 CLI 不可用时，展示手动卸载步骤引导
 *
 * 卸载成功后自动调用 app-config:reset 清除配置，然后通过 app-config:quit 退出应用。
 */

import React, { useState } from 'react';
import { Trash2, Loader2, ExternalLink } from 'lucide-react';
import GlassCard from '../../components/GlassCard';
import AppButton from '../../components/AppButton';
import AppModal from '../../components/AppModal';
import { useI18n } from '../../i18n/I18nContext';

// ── 类型定义 ──────────────────────────────────────────────────────────────────

/** 卸载流程内部状态机 */
type UninstallState =
  | 'idle'        // 初始状态，卡片正常展示
  | 'confirming'  // Confirm_Modal 已打开，等待用户确认
  | 'running'     // Easy Path 或 SSH Path 执行中
  | 'manual'      // 展示 ManualGuidePanel（SSH 失败降级或本地 CLI 不可用）
  | 'success'     // 卸载成功，展示短暂成功提示，自动进入 resetting
  | 'error'       // Easy Path 失败，展示错误信息和输出日志
  | 'resetting'   // 正在调用 app-config:reset
  | 'resetError'  // reset 失败，展示错误提示和重试按钮
  | 'quitting';   // reset 成功，正在调用 app-config:quit 退出应用

/** 组件 Props */
interface UninstallOpenclawCardProps {
  /** 当前运行模式，从 Settings 读取 */
  runMode: 'local' | 'remote';
  /** 远程连接地址（Remote_Mode 时展示） */
  remoteHost?: string;
}

// ── ManualGuidePanel 内联子组件 ───────────────────────────────────────────────

/** 手动卸载引导面板 Props */
interface ManualGuidePanelProps {
  /** SSH 失败原因（存在时展示） */
  sshErrorMsg?: string;
  /** 点击「我已完成手动卸载」的回调 */
  onDone: () => void;
}

/**
 * ManualGuidePanel — 手动卸载步骤引导面板
 *
 * 根据当前操作系统（macOS / Linux / Windows）展示对应的服务停止命令和删除目录命令。
 * 平台命令以代码块展示，无需 i18n 翻译（命令本身与语言无关）。
 */
const ManualGuidePanel: React.FC<ManualGuidePanelProps> = ({ sshErrorMsg, onDone }) => {
  const { t } = useI18n();

  // 通过 navigator.platform 推断当前操作系统
  // navigator.platform 在 Electron 渲染进程中可用
  const platform = navigator.platform.toLowerCase();
  // macOS：platform 可能为 'macintel'、'macppc' 或 'darwin'（Electron 环境）
  // 注意：必须先判断 mac/darwin，因为 'darwin' 包含 'win' 子串
  const isMac = platform.includes('mac') || platform === 'darwin';
  const isWindows = !isMac && platform.includes('win');
  // 非 Windows 非 Mac 默认为 Linux
  const isLinux = !isWindows && !isMac;

  // macOS 手动卸载命令
  const macCommands = [
    'launchctl bootout gui/$UID/ai.openclaw.gateway',
    'rm -f ~/Library/LaunchAgents/ai.openclaw.gateway.plist',
    'rm -rf ~/.openclaw',
  ];

  // Linux 手动卸载命令
  const linuxCommands = [
    'systemctl --user disable --now openclaw-gateway.service',
    'rm -f ~/.config/systemd/user/openclaw-gateway.service',
    'systemctl --user daemon-reload',
    'rm -rf ~/.openclaw',
  ];

  // Windows 手动卸载命令（PowerShell）
  const windowsCommands = [
    'schtasks /Delete /F /TN "OpenClaw Gateway"',
    'Remove-Item -Force "$env:USERPROFILE\\.openclaw\\gateway.cmd"',
    'Remove-Item -Recurse -Force "$env:USERPROFILE\\.openclaw"',
  ];

  // 根据平台选择对应命令列表
  const commands = isWindows ? windowsCommands : isMac ? macCommands : linuxCommands;

  /** 在系统默认浏览器中打开官方卸载文档 */
  const handleOpenDocs = () => {
    window.electronAPI.openPath('https://docs.openclaw.ai/install/uninstall');
  };

  return (
    <div className="mt-4 space-y-4">
      {/* SSH 失败原因提示 */}
      {sshErrorMsg && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{
            backgroundColor: 'rgba(244, 63, 94, 0.10)',
            border: '1px solid rgba(244, 63, 94, 0.30)',
            color: '#FB7185',
          }}
        >
          {t('settings.advanced.uninstallOpenclawSshFailed')}
          <span className="ml-1 opacity-75">({sshErrorMsg})</span>
        </div>
      )}

      {/* 手动卸载步骤标题 */}
      <div className="text-sm font-semibold" style={{ color: 'var(--app-text)' }}>
        {t('settings.advanced.uninstallOpenclawManualTitle')}
      </div>

      {/* 平台对应的命令列表（代码块，无需 i18n） */}
      <div className="space-y-2">
        {commands.map((cmd, idx) => (
          <pre
            key={idx}
            className="rounded-xl px-4 py-3 text-xs overflow-auto"
            style={{
              backgroundColor: 'var(--app-bg-subtle)',
              border: '1px solid var(--app-border)',
              color: 'var(--app-text-muted)',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {cmd}
          </pre>
        ))}
      </div>

      {/* 官方文档链接 */}
      <button
        type="button"
        onClick={handleOpenDocs}
        className="flex items-center gap-1.5 text-sm transition-opacity hover:opacity-70"
        style={{ color: '#60A5FA' }}
      >
        <ExternalLink size={14} />
        <span>docs.openclaw.ai/install/uninstall</span>
      </button>

      {/* 「我已完成手动卸载」按钮 */}
      <AppButton variant="secondary" onClick={onDone}>
        {t('settings.advanced.uninstallOpenclawManualDone')}
      </AppButton>
    </div>
  );
};

// ── 主组件 ────────────────────────────────────────────────────────────────────

/**
 * UninstallOpenclawCard — 卸载 OpenClaw 功能卡片
 *
 * 作为「设置 → 高级」危险操作区域的第三张卡片渲染。
 */
const UninstallOpenclawCard: React.FC<UninstallOpenclawCardProps> = ({ runMode, remoteHost }) => {
  const { t } = useI18n();

  // ── 内部状态 ────────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<UninstallState>('idle');
  const [output, setOutput] = useState('');           // 命令输出日志
  const [errorMsg, setErrorMsg] = useState('');       // 错误信息
  const [sshErrorMsg, setSshErrorMsg] = useState(''); // SSH 失败原因（降级时展示）
  const [resetErrorMsg, setResetErrorMsg] = useState(''); // 重置错误信息

  // ── 自动重置并退出 ──────────────────────────────────────────────────────────

  /**
   * handleResetAndQuit — 自动调用 app-config:reset，成功后调用 app-config:quit
   *
   * 卸载成功后（Easy Path / SSH Path / 手动完成）自动触发，无需用户点击。
   */
  const handleResetAndQuit = async () => {
    setPhase('resetting');
    try {
      const resetResult = await window.electronAPI.appConfigReset();
      if (resetResult.success) {
        // 重置成功，退出应用
        setPhase('quitting');
        await window.electronAPI.appConfigQuit();
      } else {
        // 重置失败，展示错误提示和重试按钮
        setPhase('resetError');
        setResetErrorMsg(resetResult.error || '重置失败');
      }
    } catch (err: any) {
      setPhase('resetError');
      setResetErrorMsg(err.message || '重置异常');
    }
  };

  // ── 确认卸载 ────────────────────────────────────────────────────────────────

  /**
   * handleConfirm — 根据 runMode 决定执行路径
   *
   * - Remote Mode：调用 remote-ssh，SSH 失败时降级到 manual
   * - Local Mode：调用 local，成功后自动触发 Reset_And_Quit
   */
  const handleConfirm = async () => {
    setPhase('running');
    setOutput('');
    setErrorMsg('');
    setSshErrorMsg('');

    try {
      if (runMode === 'remote') {
        // 远程模式：通过 SSH 执行卸载
        const result = await window.electronAPI.appConfigUninstallOpenclaw({ mode: 'remote-ssh' });
        if (result.manualRequired) {
          // SSH 失败，降级到手动引导
          setSshErrorMsg(result.sshError || '');
          setPhase('manual');
        } else if (result.success) {
          // SSH 成功，自动触发重置并退出
          setPhase('success');
          await handleResetAndQuit();
        } else {
          setErrorMsg(result.error || '卸载失败');
          setOutput(result.output || '');
          setPhase('error');
        }
      } else {
        // 本地模式：执行本地卸载命令
        const result = await window.electronAPI.appConfigUninstallOpenclaw({ mode: 'local' });
        if (result.success) {
          // 卸载成功，自动触发重置并退出
          setPhase('success');
          await handleResetAndQuit();
        } else {
          setErrorMsg(result.error || '卸载失败');
          setOutput(result.output || '');
          setPhase('error');
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || '卸载异常');
      setPhase('error');
    }
  };

  // ── 描述文案 ────────────────────────────────────────────────────────────────

  /** 根据 runMode 生成描述文案，使用安全字符串替换避免正则特殊字符问题 */
  const description = runMode === 'remote' && remoteHost
    ? t('settings.advanced.uninstallOpenclawDescriptionRemote').split('{host}').join(remoteHost)
    : t('settings.advanced.uninstallOpenclawDescription');

  // ── 运行中文案 ──────────────────────────────────────────────────────────────

  const runningText = runMode === 'remote'
    ? t('settings.advanced.uninstallOpenclawSshRunning')
    : t('settings.advanced.uninstallOpenclawRunning');

  // ── 是否处于执行中状态（按钮禁用） ─────────────────────────────────────────
  const isRunning = phase === 'running' || phase === 'resetting' || phase === 'quitting';

  return (
    <>
      {/* ── 卡片外壳（与现有危险操作卡片视觉一致） ─────────────────────────── */}
      <GlassCard
        className="rounded-2xl p-5 space-y-4"
        style={{
          border: '1px solid rgba(251, 113, 133, 0.25)',
          background: 'linear-gradient(135deg, rgba(244, 63, 94, 0.06) 0%, var(--app-bg-elevated) 100%)',
        }}
      >
        <div className="flex items-start gap-4">
          {/* 红色图标区域 */}
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: 'rgba(244, 63, 94, 0.12)', color: '#FB7185' }}
          >
            <Trash2 size={18} />
          </div>

          <div className="flex-1 min-w-0">
            {/* 卡片标题 */}
            <div className="text-[15px] font-semibold" style={{ color: 'var(--app-text)' }}>
              {t('settings.advanced.uninstallOpenclaw')}
            </div>

            {/* 描述文字 */}
            <div className="mt-1 text-sm leading-6" style={{ color: 'var(--app-text-muted)' }}>
              {description}
            </div>

            {/* running 状态：加载指示器 + 进度文案 */}
            {isRunning && (
              <div className="mt-3 flex items-center gap-2 text-sm" style={{ color: 'var(--app-text-muted)' }}>
                <Loader2 size={14} className="animate-spin" />
                <span>
                  {phase === 'resetting'
                    ? t('settings.advanced.uninstallOpenclawResetting')
                    : phase === 'quitting'
                      ? t('settings.advanced.uninstallOpenclawResetting')
                      : runningText}
                </span>
              </div>
            )}

            {/* success 状态：短暂成功提示 */}
            {phase === 'success' && (
              <div
                className="mt-3 rounded-xl px-4 py-3 text-sm"
                style={{
                  backgroundColor: 'rgba(34, 197, 94, 0.10)',
                  border: '1px solid rgba(34, 197, 94, 0.30)',
                  color: '#4ADE80',
                }}
              >
                {t('settings.advanced.uninstallOpenclawSuccess')}
              </div>
            )}

            {/* error 状态：错误信息 + 命令输出日志 */}
            {phase === 'error' && (
              <div className="mt-3 space-y-2">
                <div
                  className="rounded-xl px-4 py-3 text-sm"
                  style={{
                    backgroundColor: 'rgba(244, 63, 94, 0.10)',
                    border: '1px solid rgba(244, 63, 94, 0.30)',
                    color: '#FB7185',
                  }}
                >
                  {t('settings.advanced.uninstallOpenclawError')}
                  {errorMsg && <span className="ml-1 opacity-75">({errorMsg})</span>}
                </div>
                {/* 命令输出日志（与现有 reinstallOutput 样式一致） */}
                {output && (
                  <pre
                    className="rounded-xl px-4 py-3 text-xs overflow-auto max-h-48"
                    style={{
                      backgroundColor: 'var(--app-bg-subtle)',
                      border: '1px solid var(--app-border)',
                      color: 'var(--app-text-muted)',
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                    }}
                  >
                    {output}
                  </pre>
                )}
              </div>
            )}

            {/* resetError 状态：重置失败提示 + 重试按钮 */}
            {phase === 'resetError' && (
              <div className="mt-3 space-y-3">
                <div
                  className="rounded-xl px-4 py-3 text-sm"
                  style={{
                    backgroundColor: 'rgba(244, 63, 94, 0.10)',
                    border: '1px solid rgba(244, 63, 94, 0.30)',
                    color: '#FB7185',
                  }}
                >
                  {resetErrorMsg || '重置配置失败，请重试'}
                </div>
                <AppButton variant="secondary" onClick={handleResetAndQuit}>
                  重试
                </AppButton>
              </div>
            )}

            {/* manual 状态：手动卸载引导面板 */}
            {phase === 'manual' && (
              <ManualGuidePanel
                sshErrorMsg={sshErrorMsg}
                onDone={handleResetAndQuit}
              />
            )}

            {/* idle 状态：操作按钮 */}
            {phase === 'idle' && (
              <div className="mt-4">
                <AppButton
                  variant="danger"
                  onClick={() => setPhase('confirming')}
                  icon={<Trash2 size={14} />}
                >
                  {t('settings.advanced.uninstallOpenclaw')}
                </AppButton>
              </div>
            )}
          </div>
        </div>
      </GlassCard>

      {/* ── Confirm_Modal：二次确认弹窗 ─────────────────────────────────────── */}
      <AppModal
        open={phase === 'confirming'}
        onClose={() => setPhase('idle')}
        title={t('settings.advanced.uninstallOpenclaw')}
        variant="danger"
        icon={<Trash2 size={20} />}
        footer={
          <>
            <AppButton variant="secondary" onClick={() => setPhase('idle')}>
              取消
            </AppButton>
            <AppButton variant="danger" onClick={handleConfirm}>
              {t('settings.advanced.uninstallOpenclawConfirm')}
            </AppButton>
          </>
        }
      >
        {/* 不可逆警告文案 */}
        <p className="text-sm leading-6" style={{ color: 'var(--app-text-muted)' }}>
          {t('settings.advanced.uninstallOpenclawWarning')}
        </p>
      </AppModal>
    </>
  );
};

export default UninstallOpenclawCard;
export type { UninstallOpenclawCardProps };
