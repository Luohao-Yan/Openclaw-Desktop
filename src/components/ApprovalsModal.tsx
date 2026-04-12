/**
 * ApprovalsModal — 审批策略管理弹窗
 *
 * 展示当前生效的 exec-approvals allowlist，支持：
 * - 查看所有规则（pattern / agent）
 * - 添加新规则
 * - 移除已有规则
 * - 本地 / gateway / node 三种目标切换
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Plus, ShieldCheck, Trash2, RefreshCw, AlertTriangle } from 'lucide-react';
import AppModal from './AppModal';
import AppButton from './AppButton';
import type { ApprovalAllowlistEntry, ApprovalsTarget, ApprovalsGetResult } from '../types/electron';

/** 扩展 electronAPI 类型（approvals 方法在运行时已暴露，IDE 类型合并可能滞后） */
interface ApprovalsAPI {
  approvalsGet: (target: ApprovalsTarget) => Promise<ApprovalsGetResult>;
  approvalsAllowlistAdd: (pattern: string, agent: string, target: ApprovalsTarget) => Promise<{ success: boolean; error?: string }>;
  approvalsAllowlistRemove: (pattern: string) => Promise<{ success: boolean; error?: string }>;
}
const approvalsAPI = window.electronAPI as unknown as ApprovalsAPI;

interface ApprovalsModalProps {
  open: boolean;
  onClose: () => void;
}

/** 目标选项 */
const TARGET_OPTIONS: Array<{ label: string; value: string; target: ApprovalsTarget }> = [
  { label: '本地', value: 'local', target: { kind: 'local' } },
  { label: 'Gateway', value: 'gateway', target: { kind: 'gateway' } },
];

const ApprovalsModal: React.FC<ApprovalsModalProps> = ({ open, onClose }) => {
  const [targetKey, setTargetKey] = useState<string>('local');
  const [entries, setEntries] = useState<ApprovalAllowlistEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 新增规则表单状态
  const [newPattern, setNewPattern] = useState('');
  const [newAgent, setNewAgent] = useState('*');
  const [adding, setAdding] = useState(false);
  const [addMsg, setAddMsg] = useState('');

  const currentTarget = TARGET_OPTIONS.find((o) => o.value === targetKey)?.target ?? { kind: 'local' };

  /** 加载 allowlist */
  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await approvalsAPI.approvalsGet(currentTarget);
      if (result.success && result.data?.allowlist) {
        setEntries(result.data.allowlist);
      } else {
        setEntries([]);
        if (!result.success) setError(result.error || '获取失败');
      }
    } catch (err: any) {
      setError(err.message || '获取失败');
    } finally {
      setLoading(false);
    }
  }, [currentTarget]);

  useEffect(() => {
    if (open) void loadEntries();
  }, [open, loadEntries]);

  /** 添加规则 */
  const handleAdd = async () => {
    if (!newPattern.trim()) return;
    setAdding(true);
    setAddMsg('');
    try {
      const result = await approvalsAPI.approvalsAllowlistAdd(
        newPattern.trim(),
        newAgent.trim() || '*',
        currentTarget,
      );
      if (result.success) {
        setNewPattern('');
        setNewAgent('*');
        setAddMsg('规则已添加');
        await loadEntries();
        setTimeout(() => setAddMsg(''), 3000);
      } else {
        setAddMsg(`添加失败：${result.error || '未知错误'}`);
      }
    } catch (err: any) {
      setAddMsg(`添加失败：${err.message}`);
    } finally {
      setAdding(false);
    }
  };

  /** 移除规则 */
  const handleRemove = async (pattern: string) => {
    try {
      const result = await approvalsAPI.approvalsAllowlistRemove(pattern);
      if (result.success) {
        await loadEntries();
      } else {
        setError(result.error || '移除失败');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title="执行审批策略（Approvals）"
      icon={<ShieldCheck size={20} />}
      variant="warning"
      size="lg"
      footer={
        <AppButton variant="secondary" onClick={onClose}>
          关闭
        </AppButton>
      }
    >
      <div className="space-y-5">
        {/* 目标切换 */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium" style={{ color: 'var(--app-text-muted)' }}>
            目标：
          </span>
          {TARGET_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTargetKey(opt.value)}
              className="rounded-lg px-3 py-1 text-xs font-medium transition-all"
              style={{
                backgroundColor: targetKey === opt.value ? 'rgba(99,102,241,0.18)' : 'var(--app-bg-subtle)',
                color: targetKey === opt.value ? '#818CF8' : 'var(--app-text-muted)',
                border: `1px solid ${targetKey === opt.value ? 'rgba(99,102,241,0.35)' : 'var(--app-border)'}`,
              }}
            >
              {opt.label}
            </button>
          ))}
          <button
            onClick={loadEntries}
            disabled={loading}
            className="ml-auto flex items-center gap-1 text-xs transition-opacity hover:opacity-70"
            style={{ color: 'var(--app-text-muted)' }}
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            刷新
          </button>
        </div>

        {/* 说明 */}
        <div
          className="rounded-xl px-4 py-3 text-xs leading-6"
          style={{
            backgroundColor: 'rgba(251,191,36,0.08)',
            border: '1px solid rgba(251,191,36,0.20)',
            color: 'var(--app-text-muted)',
          }}
        >
          <span className="font-medium" style={{ color: '#FBBF24' }}>Allowlist 规则</span>：
          符合 pattern 的命令执行请求将被自动放行，无需人工审批。
          Pattern 支持 glob 格式，例如 <code className="text-xs font-mono">~/Projects/**</code>。
        </div>

        {/* 错误提示 */}
        {error && (
          <div
            className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
            style={{ backgroundColor: 'rgba(244,63,94,0.10)', color: '#F87171' }}
          >
            <AlertTriangle size={14} />
            {error}
          </div>
        )}

        {/* 现有规则列表 */}
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--app-text-muted)' }}>
            当前规则 ({entries.length})
          </div>
          {loading ? (
            <div className="text-sm py-4 text-center" style={{ color: 'var(--app-text-muted)' }}>
              加载中...
            </div>
          ) : entries.length === 0 ? (
            <div
              className="rounded-xl px-4 py-6 text-sm text-center"
              style={{ backgroundColor: 'var(--app-bg-subtle)', color: 'var(--app-text-muted)' }}
            >
              暂无规则，所有命令执行都需要审批。
            </div>
          ) : (
            <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
              {entries.map((entry) => (
                <div
                  key={entry.pattern}
                  className="flex items-center justify-between gap-3 rounded-xl px-4 py-2.5"
                  style={{ backgroundColor: 'var(--app-bg-subtle)', border: '1px solid var(--app-border)' }}
                >
                  <div className="min-w-0 flex-1">
                    <code className="text-xs font-mono" style={{ color: 'var(--app-text)' }}>
                      {entry.pattern}
                    </code>
                    {entry.agent && (
                      <span className="ml-2 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                        agent: {entry.agent}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => void handleRemove(entry.pattern)}
                    className="shrink-0 flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-opacity hover:opacity-70"
                    style={{ color: '#F87171', backgroundColor: 'rgba(244,63,94,0.10)' }}
                    title="移除规则"
                  >
                    <Trash2 size={12} />
                    移除
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 添加新规则 */}
        <div
          className="rounded-2xl border p-4 space-y-3"
          style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderColor: 'var(--app-border)' }}
        >
          <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--app-text-muted)' }}>
            添加规则
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_160px]">
            <div>
              <label className="mb-1.5 block text-xs" style={{ color: 'var(--app-text-muted)' }}>
                Pattern（glob 路径）
              </label>
              <input
                type="text"
                value={newPattern}
                onChange={(e) => setNewPattern(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd(); }}
                placeholder="例如 ~/Projects/**"
                className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none font-mono"
                style={{
                  backgroundColor: 'var(--app-bg-elevated)',
                  border: '1px solid var(--app-border)',
                  color: 'var(--app-text)',
                }}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs" style={{ color: 'var(--app-text-muted)' }}>
                Agent（* 表示全部）
              </label>
              <input
                type="text"
                value={newAgent}
                onChange={(e) => setNewAgent(e.target.value)}
                placeholder="* 或 agent-id"
                className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
                style={{
                  backgroundColor: 'var(--app-bg-elevated)',
                  border: '1px solid var(--app-border)',
                  color: 'var(--app-text)',
                }}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <AppButton
              variant="success"
              size="sm"
              disabled={adding || !newPattern.trim()}
              onClick={() => void handleAdd()}
              icon={<Plus size={13} />}
            >
              {adding ? '添加中...' : '添加规则'}
            </AppButton>
            {addMsg && (
              <span
                className="text-xs"
                style={{ color: addMsg.startsWith('添加失败') ? '#F87171' : '#34D399' }}
              >
                {addMsg}
              </span>
            )}
          </div>
        </div>
      </div>
    </AppModal>
  );
};

export default ApprovalsModal;
