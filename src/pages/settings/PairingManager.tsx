/**
 * 配对管理组件（PairingManager）
 * 管理 DM 配对审批和节点配对列表
 * - DM 配对审批：自动加载待审批请求，卡片式展示，一键批准
 * - 手动输入配对码审批（折叠区域）
 * - DM 策略选择器（持久化到 electron-store，不写入 OpenClaw 配置文件）
 * - 节点配对列表（持久化到 electron-store，不写入 OpenClaw 配置文件）
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  User,
  XCircle,
} from 'lucide-react';
import AppButton from '../../components/AppButton';
import AppBadge from '../../components/AppBadge';
import GlassCard from '../../components/GlassCard';
import { useI18n } from '../../i18n/I18nContext';
import type { PairingNode } from '../../utils/channelOps';

// ============================================================
// 类型定义
// ============================================================

interface PairingManagerProps {
  /** 已配置的渠道列表（用于渠道切换下拉框） */
  configuredChannels?: string[];
}

/** 待审批配对请求 */
interface PairingRequest {
  senderId: string;
  code: string;
  accountId: string;
  createdAt?: string;
  expiresAt?: string;
}

type DmPolicyValue = 'auto' | 'manual' | 'deny';

interface PolicyOption {
  value: DmPolicyValue;
  labelKey: string;
  descKey: string;
  icon: React.ReactNode;
}

// ============================================================
// 常量
// ============================================================

const PAIRING_CHANNELS = ['feishu', 'telegram', 'whatsapp', 'signal', 'imessage', 'discord', 'slack'];

/** 自动刷新间隔（毫秒） */
const AUTO_REFRESH_INTERVAL = 15000;

const POLICY_OPTIONS: PolicyOption[] = [
  { value: 'auto', labelKey: 'channels.pairingDmAuto', descKey: 'channels.pairingDmAutoDesc', icon: <ShieldCheck className="h-4 w-4" /> },
  { value: 'manual', labelKey: 'channels.pairingDmManual', descKey: 'channels.pairingDmManualDesc', icon: <User className="h-4 w-4" /> },
  { value: 'deny', labelKey: 'channels.pairingDmDeny', descKey: 'channels.pairingDmDenyDesc', icon: <XCircle className="h-4 w-4" /> },
];

// ============================================================
// 组件
// ============================================================

const PairingManager: React.FC<PairingManagerProps> = ({ configuredChannels: externalChannels }) => {
  const { t } = useI18n();

  // ── 状态 ──────────────────────────────────────────────────
  const [pendingRequests, setPendingRequests] = useState<PairingRequest[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [approvingCode, setApprovingCode] = useState<string | null>(null);
  const [approveResult, setApproveResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedChannel, setSelectedChannel] = useState('feishu');
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualCode, setManualCode] = useState('');

  // 配对配置（从 electron-store 读取，独立于 OpenClaw 配置文件）
  const [currentPolicy, setCurrentPolicy] = useState<DmPolicyValue>('manual');
  const [nodes, setNodes] = useState<PairingNode[]>([]);
  const [configLoaded, setConfigLoaded] = useState(false);

  // 节点管理
  const [showAddForm, setShowAddForm] = useState(false);
  const [newNodeId, setNewNodeId] = useState('');
  const [newNodeName, setNewNodeName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // 自动刷新定时器
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 可用渠道列表（优先使用外部传入的已配置渠道）
  const availableChannels = (externalChannels && externalChannels.length > 0)
    ? externalChannels
    : PAIRING_CHANNELS;

  // ── 从 electron-store 加载配对配置 ───────────────────────
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const result = await window.electronAPI.pairingConfigGet();
        if (result.success && result.config) {
          const cfg = result.config as any;
          setCurrentPolicy(cfg?.dm?.policy || 'manual');
          setNodes(Array.isArray(cfg?.nodes) ? cfg.nodes : []);
        }
      } catch {
        // 读取失败时使用默认值
      } finally {
        setConfigLoaded(true);
      }
    };
    void loadConfig();
  }, []);

  // ── 保存配对配置到 electron-store ────────────────────────
  const savePairingConfig = useCallback(async (policy: DmPolicyValue, nodeList: PairingNode[]) => {
    try {
      await window.electronAPI.pairingConfigSet({
        dm: { policy },
        nodes: nodeList,
      });
    } catch {
      // 保存失败静默处理，不影响 UI 交互
    }
  }, []);

  // ── 加载待审批请求 ────────────────────────────────────────
  const loadPendingRequests = useCallback(async () => {
    setLoadingPending(true);
    try {
      // 最小 600ms 加载时间，确保用户能看到刷新动画
      const [result] = await Promise.all([
        window.electronAPI.pairingList(selectedChannel),
        new Promise((r) => setTimeout(r, 600)),
      ]);
      if (result.success && Array.isArray(result.requests)) {
        setPendingRequests(result.requests);
      } else {
        setPendingRequests([]);
      }
    } catch {
      setPendingRequests([]);
    } finally {
      setLoadingPending(false);
    }
  }, [selectedChannel]);

  // 首次加载 + 切换渠道时刷新
  useEffect(() => {
    void loadPendingRequests();
  }, [loadPendingRequests]);

  // 自动轮询
  useEffect(() => {
    timerRef.current = setInterval(() => { void loadPendingRequests(); }, AUTO_REFRESH_INTERVAL);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [loadPendingRequests]);

  // ── 审批处理 ──────────────────────────────────────────────
  const handleApprove = async (code: string) => {
    setApprovingCode(code);
    setApproveResult(null);
    try {
      const result = await window.electronAPI.pairingApprove(selectedChannel, code);
      if (result.success) {
        setApproveResult({ type: 'success', text: t('channels.pairingApproveSuccess' as any) });
        // 从列表中移除已审批的请求
        setPendingRequests((prev) => prev.filter((r) => r.code !== code));
        setManualCode('');
      } else {
        setApproveResult({ type: 'error', text: result.error || t('channels.pairingApproveFailed' as any) });
      }
    } catch (err: any) {
      setApproveResult({ type: 'error', text: err.message || 'Unknown error' });
    } finally {
      setApprovingCode(null);
    }
  };

  // ── DM 策略变更（直接写入 electron-store） ───────────────
  const handlePolicyChange = async (policy: DmPolicyValue) => {
    setCurrentPolicy(policy);
    await savePairingConfig(policy, nodes);
  };

  // ── 节点操作（直接写入 electron-store） ──────────────────
  const handleAddNode = async () => {
    const trimmedId = newNodeId.trim();
    if (!trimmedId) return;
    const node: PairingNode = { id: trimmedId, name: newNodeName.trim() || undefined, status: 'active' };
    const nextNodes = [...nodes, node];
    setNodes(nextNodes);
    await savePairingConfig(currentPolicy, nextNodes);
    setNewNodeId(''); setNewNodeName(''); setShowAddForm(false);
  };

  const handleDeleteNode = async (nodeId: string) => {
    const nextNodes = nodes.filter((n) => n.id !== nodeId);
    setNodes(nextNodes);
    await savePairingConfig(currentPolicy, nextNodes);
    setConfirmDeleteId(null);
  };

  /** 格式化剩余时间 */
  const formatTimeLeft = (expiresAt?: string) => {
    if (!expiresAt) return '';
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return t('channels.pairingExpired' as any);
    const mins = Math.ceil(diff / 60000);
    return mins > 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
  };

  return (
    <GlassCard className="rounded-2xl p-6">
      {/* ── 标题 ──────────────────────────────────────────── */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold" style={{ color: 'var(--app-text)' }}>
            {t('channels.pairing' as any)}
          </h3>
          <p className="mt-1 text-sm" style={{ color: 'var(--app-text-muted)' }}>
            {t('channels.pairingDescription' as any)}
          </p>
        </div>
        {/* 渠道切换 */}
        <select
          value={selectedChannel}
          onChange={(e) => setSelectedChannel(e.target.value)}
          className="rounded-xl px-3 py-2 text-sm outline-none"
          style={{ backgroundColor: 'var(--app-bg)', border: '1px solid var(--app-border)', color: 'var(--app-text)' }}
        >
          {availableChannels.map((ch) => (
            <option key={ch} value={ch}>{ch}</option>
          ))}
        </select>
      </div>

      {/* ── 待审批请求区域 ────────────────────────────────── */}
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
              {t('channels.pairingPendingList' as any)}
            </span>
            {pendingRequests.length > 0 && (
              <span
                className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold"
                style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
              >
                {pendingRequests.length}
              </span>
            )}
          </div>
          {/* 刷新待审批列表：loading 时自动显示 spinner */}
          <AppButton
            size="xs"
            variant="secondary"
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => void loadPendingRequests()}
            loading={loadingPending}
          >
            {t('channels.pairingRefresh' as any)}
          </AppButton>
        </div>

        {/* 审批结果提示 */}
        {approveResult && (
          <div
            className="mb-3 flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm"
            style={{
              backgroundColor: approveResult.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              color: approveResult.type === 'success' ? '#22c55e' : '#ef4444',
            }}
          >
            {approveResult.type === 'success' ? <CheckCircle className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
            <span>{approveResult.text}</span>
          </div>
        )}

        {/* 请求卡片列表 */}
        {pendingRequests.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-2 rounded-2xl py-10"
            style={{ backgroundColor: 'var(--app-bg-subtle)', border: '1px dashed var(--app-border)' }}
          >
            <ShieldCheck className="h-8 w-8" style={{ color: 'var(--app-text-muted)', opacity: 0.4 }} />
            <span className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
              {t('channels.pairingNoPending' as any)}
            </span>
            <span className="text-xs" style={{ color: 'var(--app-text-muted)', opacity: 0.6 }}>
              {t('channels.pairingNoPendingHint' as any)}
            </span>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingRequests.map((req) => {
              const isApproving = approvingCode === req.code;
              const timeLeft = formatTimeLeft(req.expiresAt);
              const isExpired = timeLeft === t('channels.pairingExpired' as any);
              return (
                <div
                  key={`${req.accountId}-${req.code}`}
                  className="flex items-center justify-between rounded-2xl px-5 py-4 transition-all"
                  style={{
                    backgroundColor: 'var(--app-bg-subtle)',
                    border: '1px solid var(--app-border)',
                    opacity: isExpired ? 0.5 : 1,
                  }}
                >
                  {/* 左侧信息 */}
                  <div className="flex flex-col gap-1.5">
                    {/* 用户 ID */}
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4" style={{ color: 'var(--app-text-muted)' }} />
                      <span className="text-sm font-medium font-mono" style={{ color: 'var(--app-text)' }}>
                        {req.senderId || '—'}
                      </span>
                      {req.accountId !== 'default' && (
                        <span
                          className="rounded-md px-1.5 py-0.5 text-xs"
                          style={{ backgroundColor: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}
                        >
                          {req.accountId}
                        </span>
                      )}
                    </div>
                    {/* 配对码 + 剩余时间 */}
                    <div className="flex items-center gap-3">
                      <span
                        className="rounded-lg px-2.5 py-1 text-sm font-bold font-mono tracking-[0.2em]"
                        style={{ backgroundColor: 'rgba(59,130,246,0.08)', color: 'var(--app-text)' }}
                      >
                        {req.code}
                      </span>
                      {timeLeft && (
                        <span className="flex items-center gap-1 text-xs" style={{ color: isExpired ? '#ef4444' : 'var(--app-text-muted)' }}>
                          <Clock className="h-3 w-3" />
                          {timeLeft}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 审批按钮：loading 时自动显示 spinner */}
                  <AppButton
                    size="sm"
                    variant="primary"
                    icon={<CheckCircle className="h-4 w-4" />}
                    onClick={() => void handleApprove(req.code)}
                    loading={isApproving}
                    disabled={isApproving || isExpired}
                  >
                    {isApproving ? t('channels.pairingApproving' as any) : t('channels.pairingApproveBtn' as any)}
                  </AppButton>
                </div>
              );
            })}
          </div>
        )}

        {/* 手动输入配对码（折叠） */}
        <button
          type="button"
          onClick={() => setShowManualInput(!showManualInput)}
          className="mt-3 flex items-center gap-1 text-xs transition-colors hover:opacity-80"
          style={{ color: 'var(--app-text-muted)' }}
        >
          {showManualInput ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {t('channels.pairingManualInput' as any)}
        </button>
        {showManualInput && (
          <div className="mt-2 flex items-center gap-2">
            <input
              type="text"
              value={manualCode}
              onChange={(e) => { setManualCode(e.target.value.toUpperCase()); setApproveResult(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && manualCode.trim()) void handleApprove(manualCode.trim()); }}
              className="flex-1 rounded-xl px-3 py-2 text-sm font-mono tracking-widest outline-none"
              style={{ backgroundColor: 'var(--app-bg)', border: '1px solid var(--app-border)', color: 'var(--app-text)' }}
              placeholder="TV2KZ7QR"
              maxLength={8}
            />
            <AppButton
              size="sm"
              variant="primary"
              icon={<CheckCircle className="h-4 w-4" />}
              onClick={() => { if (manualCode.trim()) void handleApprove(manualCode.trim()); }}
              disabled={!manualCode.trim() || approvingCode !== null}
            >
              {t('channels.pairingApproveBtn' as any)}
            </AppButton>
          </div>
        )}
      </div>

      {/* ── DM 配对策略 ──────────────────────────────────── */}
      <div className="mb-6">
        <label className="mb-3 block text-sm font-medium" style={{ color: 'var(--app-text)' }}>
          {t('channels.pairingDmPolicy' as any)}
        </label>
        {/* configLoaded 为 false 时显示骨架，避免策略选中状态闪烁 */}
        {!configLoaded ? (
          <div className="h-16 animate-pulse rounded-xl" style={{ backgroundColor: 'var(--app-bg-subtle)' }} />
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {POLICY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handlePolicyChange(opt.value)}
              className="flex items-start gap-3 rounded-xl px-4 py-3 text-left transition-token-normal"
              style={
                currentPolicy === opt.value
                  ? {
                      backgroundColor: 'var(--app-active-bg, rgba(59,130,246,0.1))',
                      border: '2px solid var(--app-active-border, #3b82f6)',
                      color: 'var(--app-active-text, #3b82f6)',
                    }
                  : {
                      backgroundColor: 'var(--app-bg)',
                      border: '2px solid var(--app-border)',
                      color: 'var(--app-text)',
                    }
              }
            >
              <span className="mt-0.5 shrink-0">{opt.icon}</span>
              <div>
                <div className="text-sm font-medium">{t(opt.labelKey as any)}</div>
                <div className="mt-0.5 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                  {t(opt.descKey as any)}
                </div>
              </div>
            </button>
          ))}
        </div>
        )}
      </div>

      {/* ── 节点配对列表 ──────────────────────────────────── */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <label className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
            {t('channels.pairingNodes' as any)}
          </label>
          <AppButton size="xs" variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setShowAddForm(true)}>
            {t('channels.pairingAddNode' as any)}
          </AppButton>
        </div>

        {showAddForm && (
          <div
            className="mb-4 flex flex-wrap items-end gap-3 rounded-xl p-4"
            style={{ backgroundColor: 'var(--app-bg-subtle)', border: '1px solid var(--app-border)' }}
          >
            <div className="flex-1" style={{ minWidth: '140px' }}>
              <label className="mb-1 block text-xs" style={{ color: 'var(--app-text-muted)' }}>{t('channels.pairingNodeId' as any)}</label>
              <input
                type="text" value={newNodeId} onChange={(e) => setNewNodeId(e.target.value)}
                className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                style={{ backgroundColor: 'var(--app-bg)', border: '1px solid var(--app-border)', color: 'var(--app-text)' }}
                placeholder="node-1"
              />
            </div>
            <div className="flex-1" style={{ minWidth: '140px' }}>
              <label className="mb-1 block text-xs" style={{ color: 'var(--app-text-muted)' }}>{t('channels.pairingNodeName' as any)}</label>
              <input
                type="text" value={newNodeName} onChange={(e) => setNewNodeName(e.target.value)}
                className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                style={{ backgroundColor: 'var(--app-bg)', border: '1px solid var(--app-border)', color: 'var(--app-text)' }}
                placeholder="生产节点"
              />
            </div>
            <div className="flex gap-2">
              <AppButton size="sm" variant="primary" onClick={handleAddNode}>{t('common.confirm' as any)}</AppButton>
              <AppButton size="sm" variant="secondary" onClick={() => { setShowAddForm(false); setNewNodeId(''); setNewNodeName(''); }}>
                {t('common.cancel' as any)}
              </AppButton>
            </div>
          </div>
        )}

        {nodes.length === 0 ? (
          <div
            className="rounded-xl py-8 text-center text-sm"
            style={{ color: 'var(--app-text-muted)', backgroundColor: 'var(--app-bg-subtle)', border: '1px dashed var(--app-border)' }}
          >
            {t('channels.pairingNodes' as any)} — 0
          </div>
        ) : (
          <div className="space-y-2">
            {nodes.map((node) => (
              <div
                key={node.id}
                className="flex items-center justify-between rounded-xl px-4 py-3"
                style={{ backgroundColor: 'var(--app-bg-subtle)', border: '1px solid var(--app-border)' }}
              >
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>{node.id}</span>
                  {node.name && <span className="text-sm" style={{ color: 'var(--app-text-muted)' }}>{node.name}</span>}
                  {/* 节点状态 badge */}
                  <AppBadge
                    variant={node.status === 'active' ? 'success' : 'neutral'}
                    size="sm"
                  >
                    {node.status || 'active'}
                  </AppBadge>
                </div>
                {confirmDeleteId === node.id ? (
                  <div className="flex items-center gap-2">
                    <AppButton size="xs" variant="danger" onClick={() => handleDeleteNode(node.id)}>{t('common.confirm' as any)}</AppButton>
                    <AppButton size="xs" variant="secondary" onClick={() => setConfirmDeleteId(null)}>{t('common.cancel' as any)}</AppButton>
                  </div>
                ) : (
                  <AppButton size="xs" variant="danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setConfirmDeleteId(node.id)}>
                    {t('channels.pairingDeleteNode' as any)}
                  </AppButton>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </GlassCard>
  );
};

export default PairingManager;
