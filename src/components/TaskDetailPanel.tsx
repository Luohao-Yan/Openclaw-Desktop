/**
 * TaskDetailPanel — 任务详情侧边栏
 *
 * 展示单个 openclaw status 任务的详细信息：
 * - 基础元数据（id / status / agent / model）
 * - 时间信息（startedAt / updatedAt）
 * - Token 用量
 * - 错误信息
 * - 终止任务操作
 */

import React, { useEffect, useState } from 'react';
import {
  X,
  Clock,
  Bot,
  Cpu,
  Zap,
  AlertCircle,
  StopCircle,
  RefreshCw,
  Hash,
} from 'lucide-react';
import AppButton from './AppButton';
import AppBadge from './AppBadge';
import type { AppBadgeVariant } from './AppBadge';

/** 任务数据结构（与 electron/ipc/tasks.ts 中 Task 保持一致） */
interface TaskItem {
  id: string;
  name: string;
  status: 'running' | 'stopped' | 'completed' | 'failed';
  startedAt?: string;
  updatedAt?: string;
  command?: string;
  sessionKey?: string;
  agent?: string;
  model?: string;
  tokensUsed?: number;
  error?: string;
}

interface TaskDetailPanelProps {
  taskId: string | null;
  onClose: () => void;
}

/** 状态色映射 */
const STATUS_CONFIG: Record<
  TaskItem['status'],
  { variant: AppBadgeVariant; label: string }
> = {
  running:   { variant: 'success', label: '运行中' },
  completed: { variant: 'info',    label: '已完成' },
  stopped:   { variant: 'neutral', label: '已停止' },
  failed:    { variant: 'danger',  label: '失败'   },
};

const formatTime = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString();
};

/** 元数据行 */
const MetaRow: React.FC<{ icon: React.ReactNode; label: string; value: React.ReactNode }> = ({
  icon, label, value,
}) => (
  <div className="flex items-start gap-3 py-2.5 border-b last:border-0" style={{ borderColor: 'var(--app-border)' }}>
    <div className="mt-0.5 shrink-0" style={{ color: 'var(--app-text-muted)' }}>{icon}</div>
    <div className="min-w-0 flex-1">
      <div className="text-xs mb-0.5" style={{ color: 'var(--app-text-muted)' }}>{label}</div>
      <div className="text-sm break-all font-medium" style={{ color: 'var(--app-text)' }}>{value}</div>
    </div>
  </div>
);

const TaskDetailPanel: React.FC<TaskDetailPanelProps> = ({ taskId, onClose }) => {
  const [task, setTask] = useState<TaskItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [killing, setKilling] = useState(false);
  const [killMsg, setKillMsg] = useState('');

  /** 加载任务详情 */
  const loadDetail = async (id: string) => {
    setLoading(true);
    setKillMsg('');
    try {
      const result = await (window.electronAPI as any).tasksDetails(id) as TaskItem | null;
      setTask(result);
    } catch {
      setTask(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (taskId) void loadDetail(taskId);
    else setTask(null);
  }, [taskId]);

  /** 终止任务 */
  const handleKill = async () => {
    if (!task) return;
    setKilling(true);
    try {
      const result = await window.electronAPI.tasksKill(task.id) as any;
      setKillMsg(result.message || (result.success ? '已终止' : '终止失败'));
      if (result.success) await loadDetail(task.id);
    } catch (err: any) {
      setKillMsg(`错误：${err.message}`);
    } finally {
      setKilling(false);
    }
  };

  if (!taskId) return null;

  const statusCfg = task ? STATUS_CONFIG[task.status] : null;

  return (
    <div
      className="flex flex-col h-full border-l"
      style={{
        width: 340,
        minWidth: 300,
        backgroundColor: 'var(--app-bg-elevated)',
        borderColor: 'var(--app-border)',
      }}
    >
      {/* 头部 */}
      <div
        className="flex items-center justify-between px-5 py-4 border-b shrink-0"
        style={{ borderColor: 'var(--app-border)' }}
      >
        <span className="text-sm font-semibold" style={{ color: 'var(--app-text)' }}>
          任务详情
        </span>
        <div className="flex items-center gap-2">
          {taskId && (
            <button
              onClick={() => void loadDetail(taskId)}
              disabled={loading}
              className="p-1.5 rounded-lg transition-opacity hover:opacity-70"
              style={{ color: 'var(--app-text-muted)' }}
              title="刷新"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-opacity hover:opacity-70"
            style={{ color: 'var(--app-text-muted)' }}
            title="关闭"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-sm" style={{ color: 'var(--app-text-muted)' }}>
            <RefreshCw size={16} className="animate-spin mr-2" />
            加载中...
          </div>
        ) : !task ? (
          <div className="flex items-center justify-center py-12 text-sm" style={{ color: 'var(--app-text-muted)' }}>
            未找到任务信息
          </div>
        ) : (
          <>
            {/* 任务名 + 状态 */}
            <div>
              <div className="text-base font-semibold mb-2" style={{ color: 'var(--app-text)' }}>
                {task.name}
              </div>
              {statusCfg && (
                <AppBadge variant={statusCfg.variant} dot>
                  {statusCfg.label}
                </AppBadge>
              )}
            </div>

            {/* 元数据 */}
            <div
              className="rounded-2xl px-4"
              style={{ backgroundColor: 'var(--app-bg-subtle)', border: '1px solid var(--app-border)' }}
            >
              <MetaRow icon={<Hash size={13} />} label="任务 ID" value={<code className="font-mono text-xs">{task.id}</code>} />
              {task.agent && <MetaRow icon={<Bot size={13} />} label="Agent" value={task.agent} />}
              {task.model && <MetaRow icon={<Cpu size={13} />} label="模型" value={task.model} />}
              {task.sessionKey && (
                <MetaRow icon={<Hash size={13} />} label="Session Key" value={<code className="font-mono text-xs">{task.sessionKey}</code>} />
              )}
              <MetaRow icon={<Clock size={13} />} label="启动时间" value={formatTime(task.startedAt)} />
              <MetaRow icon={<Clock size={13} />} label="最后更新" value={formatTime(task.updatedAt)} />
              {task.tokensUsed !== undefined && (
                <MetaRow icon={<Zap size={13} />} label="Token 用量" value={task.tokensUsed.toLocaleString()} />
              )}
            </div>

            {/* 命令 */}
            {task.command && (
              <div>
                <div className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--app-text-muted)' }}>
                  执行命令
                </div>
                <pre
                  className="rounded-xl px-4 py-3 text-xs overflow-x-auto"
                  style={{
                    backgroundColor: 'var(--app-bg-subtle)',
                    border: '1px solid var(--app-border)',
                    color: 'var(--app-text)',
                    fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                  }}
                >
                  {task.command}
                </pre>
              </div>
            )}

            {/* 错误信息 */}
            {task.error && (
              <div>
                <div className="text-xs font-semibold mb-2 uppercase tracking-wider flex items-center gap-1.5" style={{ color: '#F87171' }}>
                  <AlertCircle size={12} />
                  错误信息
                </div>
                <pre
                  className="rounded-xl px-4 py-3 text-xs overflow-x-auto"
                  style={{
                    backgroundColor: 'rgba(248,113,113,0.08)',
                    border: '1px solid rgba(248,113,113,0.25)',
                    color: '#FCA5A5',
                    fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                  }}
                >
                  {task.error}
                </pre>
              </div>
            )}

            {/* 操作 */}
            {task.status === 'running' && (
              <div className="space-y-2">
                <AppButton
                  variant="danger"
                  size="sm"
                  disabled={killing}
                  onClick={() => void handleKill()}
                  icon={<StopCircle size={13} />}
                >
                  {killing ? '终止中...' : '终止任务'}
                </AppButton>
                {killMsg && (
                  <div
                    className="text-xs rounded-lg px-3 py-2"
                    style={{
                      backgroundColor: killMsg.startsWith('错误') ? 'rgba(248,113,113,0.10)' : 'rgba(52,211,153,0.10)',
                      color: killMsg.startsWith('错误') ? '#F87171' : '#34D399',
                    }}
                  >
                    {killMsg}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default TaskDetailPanel;
