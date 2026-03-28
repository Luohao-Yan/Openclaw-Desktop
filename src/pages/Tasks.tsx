import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Clock3,
  Copy,
  LoaderCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/I18nContext';

/** 翻译函数类型，用于传入模块级工具函数 */
export type TFunc = (key: TranslationKey) => string;
import AppButton from '../components/AppButton';
import AppModal from '../components/AppModal';
import AppBadge from '../components/AppBadge';
import GlassCard from '../components/GlassCard';
import {
  cronDeliveryChannelOptions,
  cronPayloadKindOptions,
  cronScheduleKindOptions,
  cronSessionTargetOptions,
  cronThinkingOptions,
  cronWakeModeOptions,
} from '../config/openclawCronManifest';
import type {
  CoreConfigOverview,
  CronJobDraft,
  CronJobRecord,
  CronPayloadDraft,
  CronPayloadSystemEvent,
  CronRunRecord,
  ElectronAPI,
} from '../types/electron';

interface AgentOption {
  id: string;
  name: string;
}

type CronFilter = 'all' | 'enabled' | 'disabled';

const electronAPI = window.electronAPI as unknown as ElectronAPI;

const inputClassName = 'w-full rounded-xl border px-4 py-3 text-sm outline-none';
const textareaClassName = `${inputClassName} min-h-[104px] resize-none`;

const sanitizeText = (value?: string) => {
  if (!value) {
    return '';
  }

  return value
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/\x1B\[[0-9;]*m/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

/** 格式化日期字符串，未设置时使用翻译键 */
export const formatDate = (dateString: string | undefined, t: TFunc) => {
  if (!dateString) {
    return t('tasks.format.notSet');
  }

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return date.toLocaleString();
};

/** 格式化相对时间，所有文本使用翻译键 */
export const formatRelativeTime = (dateString: string | undefined, t: TFunc) => {
  if (!dateString) {
    return t('tasks.format.pending');
  }

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return t('tasks.format.pending');
  }

  const diffMs = date.getTime() - Date.now();
  const diffMins = Math.round(Math.abs(diffMs) / (1000 * 60));

  if (diffMins < 1) {
    return diffMs >= 0 ? t('tasks.format.imminent') : t('tasks.format.justNow');
  }

  if (diffMins < 60) {
    return diffMs >= 0
      ? t('tasks.format.minutesLater').replace('{n}', String(diffMins))
      : t('tasks.format.minutesAgo').replace('{n}', String(diffMins));
  }

  const diffHours = Math.round(diffMins / 60);
  return diffMs >= 0
    ? t('tasks.format.hoursLater').replace('{n}', String(diffHours))
    : t('tasks.format.hoursAgo').replace('{n}', String(diffHours));
};

/** 获取调度摘要，前缀使用翻译键 */
export const getScheduleSummary = (job: CronJobRecord, t: TFunc) => {
  const schedule = job.schedule || {};

  // 优先读标准字段
  if (typeof schedule.every === 'string' && schedule.every) {
    return `${t('tasks.format.every')} ${schedule.every}`;
  }
  if (typeof schedule.at === 'string' && schedule.at) {
    return `${t('tasks.format.at')} ${schedule.at}`;
  }
  if (typeof schedule.cron === 'string' && schedule.cron) {
    return schedule.cron;
  }

  // 兼容其他可能的字段名（interval / intervalMs / period）
  if (typeof schedule.interval === 'string' && schedule.interval) {
    return `${t('tasks.format.every')} ${schedule.interval}`;
  }
  if (typeof schedule.intervalMs === 'number') {
    const ms = schedule.intervalMs as number;
    if (ms >= 3600000) return `${t('tasks.format.every')} ${Math.round(ms / 3600000)}h`;
    if (ms >= 60000) return `${t('tasks.format.every')} ${Math.round(ms / 60000)}m`;
    return `${t('tasks.format.every')} ${Math.round(ms / 1000)}s`;
  }
  if (typeof schedule.period === 'string' && schedule.period) {
    return `${t('tasks.format.every')} ${schedule.period}`;
  }

  // 尝试从 raw 里读取
  const raw = job.raw || {};
  const rawSchedule = raw.schedule as Record<string, unknown> | undefined;
  if (rawSchedule) {
    if (typeof rawSchedule.every === 'string') return `${t('tasks.format.every')} ${rawSchedule.every}`;
    if (typeof rawSchedule.at === 'string') return `${t('tasks.format.at')} ${rawSchedule.at}`;
    if (typeof rawSchedule.cron === 'string') return rawSchedule.cron;
  }

  // 最后兜底：把 schedule 对象的第一个非空值显示出来
  const firstVal = Object.values(schedule).find((v) => v != null && v !== '');
  if (firstVal != null) return String(firstVal);

  return '—';
};

export const getPayloadKind = (job: CronJobRecord) => {
  const payload = job.payload || {};
  const kind = String(payload.kind || payload.type || '').toLowerCase();
  if (kind.includes('system')) {
    return 'systemEvent';
  }
  if (kind.includes('agent') || kind.includes('message')) {
    return 'agentTurn';
  }
  if (typeof payload.text === 'string') {
    return 'systemEvent';
  }
  if (typeof payload.message === 'string') {
    return 'agentTurn';
  }
  return 'unknown';
};

/** 获取任务状态样式和标签，标签使用翻译键 */
export const getJobTone = (job: CronJobRecord, t: TFunc) => {
  if (job.enabled === false) {
    return {
      bg: 'rgba(var(--badge-rgb-neutral, 148,163,184), 0.10)',
      border: 'rgba(var(--badge-rgb-neutral, 148,163,184), 0.22)',
      text: 'rgba(var(--badge-rgb-neutral, 148,163,184), 0.85)',
      dot: 'rgba(var(--badge-rgb-neutral, 148,163,184), 0.85)',
      label: t('tasks.list.statusDisabled'),
    };
  }

  return {
    bg: 'rgba(var(--badge-rgb-success, 52,211,153), 0.10)',
    border: 'rgba(var(--badge-rgb-success, 52,211,153), 0.22)',
    text: 'rgba(var(--badge-rgb-success, 52,211,153), 0.85)',
    dot: 'rgba(var(--badge-rgb-success, 52,211,153), 0.85)',
    label: t('tasks.list.statusRunning'),
  };
};

/** 根据 payload 类型返回可读标签，使用翻译键 */
export const getPayloadLabel = (job: CronJobRecord, t: TFunc) => {
  const kind = getPayloadKind(job);
  if (kind === 'systemEvent') return t('tasks.list.payloadSystem');
  if (kind === 'agentTurn') return t('tasks.list.payloadAgent');
  return kind;
};

/* 根据调度类型返回图标颜色 */
const getScheduleColor = (job: CronJobRecord) => {
  const schedule = job.schedule || {};
  if (typeof schedule.cron === 'string') return '#f59e0b'; // cron 表达式 → 琥珀色
  if (typeof schedule.at === 'string') return '#60a5fa';   // 单次定时 → 蓝色
  return '#a78bfa'; // every 循环 → 紫色
};

const buildInitialDraft = (): CronJobDraft => ({
  name: '',
  description: '',
  agentId: '',
  enabled: true,
  sessionTarget: 'isolated',
  wakeMode: 'now',
  deleteAfterRun: false,
  schedule: {
    kind: 'every',
    every: '1h',
  },
  payload: {
    kind: 'systemEvent',
    text: '',
    mode: 'now',
  },
});

const Tasks: React.FC = () => {
  const { t } = useI18n();
  const [overview, setOverview] = useState<CoreConfigOverview | null>(null);
  const [jobs, setJobs] = useState<CronJobRecord[]>([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [runs, setRuns] = useState<CronRunRecord[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [runsLoading, setRunsLoading] = useState(false);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [error, setError] = useState('');
  // 立即执行的 loading 状态和 toast 提示
  const [runningJobId, setRunningJobId] = useState('');
  // 复制 run ID 后的反馈状态
  const [copiedRunId, setCopiedRunId] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  // toast 3 秒后自动消失
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<CronFilter>('all');
  const [draft, setDraft] = useState<CronJobDraft>(buildInitialDraft());

  const loadOverview = async () => {
    setOverviewLoading(true);
    try {
      const result = await electronAPI.coreConfigGetOverview();
      if (result.success && result.overview) {
        setOverview(result.overview);
      }
    } finally {
      setOverviewLoading(false);
    }
  };

  const loadAgents = async () => {
    try {
      const result = await electronAPI.agentsGetAll();
      if (!result?.success || !Array.isArray(result.agents)) {
        setAgents([]);
        return;
      }

      setAgents(result.agents.map((item: any) => ({
        id: String(item.id || item.name || ''),
        name: String(item.name || item.id || t('tasks.unnamedAgent')),
      })));
    } catch {
      setAgents([]);
    }
  };

  const loadJobs = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await electronAPI.cronList(true);
      if (!result.success) {
        throw new Error(result.error || t('tasks.error.loadFailed'));
      }

      const nextJobs = result.jobs || [];
      setJobs(nextJobs);
      setSelectedJobId((current) => {
        if (!nextJobs.length) {
          return '';
        }
        if (current && nextJobs.some((job) => job.id === current)) {
          return current;
        }
        return nextJobs[0]?.id || '';
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      setJobs([]);
      setSelectedJobId('');
    } finally {
      setLoading(false);
    }
  };

  const loadRuns = async (jobId: string) => {
    if (!jobId) {
      setRuns([]);
      return;
    }

    setRunsLoading(true);
    try {
      const result = await electronAPI.cronRuns(jobId, 10);
      if (!result.success) {
        setRuns([]);
        return;
      }
      setRuns(result.runs || []);
    } finally {
      setRunsLoading(false);
    }
  };

  useEffect(() => {
    void Promise.all([
      loadOverview(),
      loadAgents(),
      loadJobs(),
    ]);
  }, []);

  useEffect(() => {
    if (selectedJobId) {
      void loadRuns(selectedJobId);
    } else {
      setRuns([]);
    }
  }, [selectedJobId]);

  const filteredJobs = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return jobs.filter((job) => {
      const matchesFilter = filter === 'all'
        ? true
        : filter === 'enabled'
          ? job.enabled !== false
          : job.enabled === false;

      if (!matchesFilter) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      const haystack = [
        job.id,
        job.name,
        job.status,
        job.session,
        getScheduleSummary(job, t),
      ]
        .map((item) => sanitizeText(item))
        .join(' ')
        .toLowerCase();

      return haystack.includes(keyword);
    });
  }, [filter, jobs, search]);

  const selectedJob = useMemo(() => {
    if (!filteredJobs.length) {
      return null;
    }

    return filteredJobs.find((job) => job.id === selectedJobId) || filteredJobs[0];
  }, [filteredJobs, selectedJobId]);

  const stats = useMemo(() => {
    return {
      total: jobs.length,
      enabled: jobs.filter((job) => job.enabled !== false).length,
      disabled: jobs.filter((job) => job.enabled === false).length,
      runs: runs.length,
    };
  }, [jobs, runs.length]);

  const agentTurnPayload = draft.payload.kind === 'agentTurn'
    ? draft.payload
    : null;

  const updateDraft = (patch: Partial<CronJobDraft>) => {
    setDraft((current) => ({
      ...current,
      ...patch,
    }));
  };

  const updatePayload = (patch: Partial<CronPayloadDraft>) => {
    setDraft((current) => ({
      ...current,
      payload: {
        ...current.payload,
        ...patch,
      } as CronPayloadDraft,
    }));
  };

  const switchPayloadKind = (kind: 'systemEvent' | 'agentTurn') => {
    setDraft((current) => ({
      ...current,
      sessionTarget: kind === 'agentTurn' ? 'isolated' : current.sessionTarget,
      payload: kind === 'systemEvent'
        ? {
            kind,
            text: '',
          }
        : {
            kind,
            message: '',
            thinking: 'low',
            deliver: false,
            announce: true,
            timeoutSeconds: undefined,
            channel: 'feishu',
            to: '',
          },
    }));
  };

  const switchScheduleKind = (kind: 'at' | 'every' | 'cron') => {
    setDraft((current) => ({
      ...current,
      schedule: kind === 'at'
        ? { kind, at: '' }
        : kind === 'every'
          ? { kind, every: '1h' }
          : { kind, cron: '' },
    }));
  };

  const resetDraft = () => {
    setDraft(buildInitialDraft());
  };

  const openCreateModal = () => {
    resetDraft();
    setShowCreateModal(true);
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    resetDraft();
  };

  const handleCreate = async () => {
    setSaving(true);
    setError('');
    try {
      const payload: CronJobDraft = {
        ...draft,
        agentId: draft.agentId || undefined,
        description: draft.description || undefined,
        payload: draft.payload.kind === 'systemEvent'
          ? {
              ...draft.payload,
            } as CronPayloadSystemEvent
          : draft.payload,
      };

      const result = await electronAPI.cronCreate(payload);
      if (!result.success) {
        throw new Error(result.error || t('tasks.error.createFailed'));
      }

      closeCreateModal();
      await loadJobs();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setSaving(false);
    }
  };

  const [drawerOpen, setDrawerOpen] = useState(false);

  /* 打开抽屉并加载运行历史 */
  const handleSelectJob = (job: CronJobRecord) => {
    setSelectedJobId(job.id);
    setDrawerOpen(true);
    void loadRuns(job.id);
  };

  /* 关闭抽屉 */
  const handleCloseDrawer = () => {
    setDrawerOpen(false);
  };

  /* 启用/停用任务 */
  const handleToggleEnabled = async (job: CronJobRecord) => {
    const action = job.enabled === false ? electronAPI.cronEnable : electronAPI.cronDisable;
    const result = await action(job.id);
    if (!result.success) {
      setError(result.error || t('tasks.error.updateFailed'));
      return;
    }
    await loadJobs();
  };

  const handleRunNow = async (job: CronJobRecord) => {
    setRunningJobId(job.id);
    setToast(null);
    setError('');
    try {
      const result = await electronAPI.cronRun(job.id, true);
      if (!result.success) {
        setError(result.error || t('tasks.error.runFailed'));
        setToast({ type: 'error', message: result.error || t('tasks.error.runFailed') });
        return;
      }
      setToast({ type: 'success', message: t('tasks.toast.runSuccess').replace('{name}', job.name || '') });
      // 刷新运行历史和任务列表
      await Promise.all([loadRuns(job.id), loadJobs()]);
    } catch (err: any) {
      const msg = err?.message || t('tasks.error.runException');
      setError(msg);
      setToast({ type: 'error', message: msg });
    } finally {
      setRunningJobId('');
    }
  };

  const handleRemove = async (job: CronJobRecord) => {
    if (!confirm(t('tasks.confirm.delete').replace('{name}', job.name || ''))) {
      return;
    }

    const result = await electronAPI.cronRemove(job.id);
    if (!result.success) {
      setError(result.error || t('tasks.error.deleteFailed'));
      return;
    }

    await loadJobs();
  };

  return (
    /* 页面内容区域：使用 page-content 统一内边距 --space-6 */
    <div className="space-y-6 page-content">
      {/* Toast 提示 */}
      {toast && (
        <div className="fixed top-5 right-5 z-[60]">
          <div
            className="flex items-center gap-2.5 rounded-2xl border px-5 py-3 text-sm font-medium shadow-lg"
            style={{
              backgroundColor: toast.type === 'success' ? 'var(--app-toast-success-bg)' : 'var(--app-toast-error-bg)',
              borderColor: toast.type === 'success' ? 'var(--app-toast-success-border)' : 'var(--app-toast-error-border)',
              color: toast.type === 'success' ? 'var(--app-toast-success-text)' : 'var(--app-toast-error-text)',
            }}
          >
            {toast.message}
            <button onClick={() => setToast(null)} className="ml-2 opacity-60 hover:opacity-100 cursor-pointer">
              <X size={14} />
            </button>
          </div>
        </div>
      )}
      {/* 顶部渐变标题卡片 */}
      <GlassCard
        variant="gradient"
        className="relative rounded-[20px] px-5 py-4"
        style={{
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.14) 0%, rgba(139, 92, 246, 0.10) 50%, rgba(59, 130, 246, 0.06) 100%)',
          backdropFilter: 'blur(18px)',
          border: 'none',
        }}
      >
        {/* 右上角装饰光晕 */}
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full blur-3xl" style={{ backgroundColor: 'rgba(99, 102, 241, 0.16)' }} />
        <div className="pointer-events-none absolute bottom-0 right-20 h-32 w-32 rounded-full blur-3xl" style={{ backgroundColor: 'rgba(139, 92, 246, 0.12)' }} />

        <div className="relative flex items-center gap-4">
          {/* 左侧：图标 + 标题 */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div
              className="h-9 w-9 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' }}
            >
              <Clock3 size={18} style={{ color: 'white' }} />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight" style={{ color: 'var(--app-text)' }}>
                {t('tasks.pageTitle')}
              </h1>
            </div>
          </div>

          {/* 分隔线 */}
          <div className="h-6 w-px shrink-0" style={{ backgroundColor: 'var(--app-border)' }} />

          {/* 内联统计指标 pill 组 */}
          <div className="flex items-center gap-2 shrink-0">
            {[
              { icon: Clock3, value: stats.total, label: t('tasks.stats.total'), color: '#60a5fa' },
              { icon: PlayCircle, value: stats.enabled, label: t('tasks.stats.enabled'), color: '#34d399' },
              { icon: X, value: stats.disabled, label: t('tasks.stats.disabled'), color: '#f87171' },
              { icon: Sparkles, value: stats.runs, label: t('tasks.stats.recentRuns'), color: '#a78bfa' },
            ].map((m) => {
              const Icon = m.icon;
              return (
                <div
                  key={m.label}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs"
                  style={{ backgroundColor: `${m.color}12`, border: `1px solid ${m.color}20` }}
                  title={m.label}
                >
                  <Icon size={13} style={{ color: m.color }} />
                  <span className="font-semibold tabular-nums" style={{ color: m.color }}>{m.value}</span>
                  <span className="hidden xl:inline" style={{ color: 'var(--app-text-muted)' }}>{m.label}</span>
                </div>
              );
            })}
          </div>

          {/* 弹性间距 */}
          <div className="flex-1" />

          {/* 操作按钮区 */}
          <div className="flex items-center gap-2 shrink-0">
            <AppButton
              variant="secondary"
              onClick={() => {
                void loadJobs();
                void loadOverview();
              }}
              disabled={loading || overviewLoading}
              icon={<RefreshCw size={14} className={loading || overviewLoading ? 'animate-spin' : ''} />}
            >
              {t('tasks.refresh')}
            </AppButton>
            <AppButton
              variant="primary"
              onClick={openCreateModal}
              icon={<Plus size={14} />}
            >
              {t('tasks.newJob')}
            </AppButton>
          </div>
        </div>
      </GlassCard>

      {error ? (
        <div
          className="rounded-2xl border px-4 py-3 text-sm"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.10)',
            borderColor: 'rgba(239, 68, 68, 0.24)',
            color: '#FCA5A5',
          }}
        >
          <div className="whitespace-pre-wrap">{error}</div>
          {/* 配置无效时显示一键修复按钮 */}
          {(error.includes('配置文件无效') || error.includes('Config invalid') || error.includes('Invalid config')) ? (
            <div className="mt-3">
              <AppButton
                variant="secondary"
                onClick={() => void electronAPI.gatewayRepairCompatibility().then(() => {
                  setError('');
                  void loadJobs();
                })}
                icon={<Wrench size={13} />}
              >
                {t('tasks.doctorFix')}
              </AppButton>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 主内容区：全宽任务列表 */}
      <div
        className="rounded-[28px] border overflow-hidden"
        style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)' }}
      >
        {/* 列表工具栏：搜索 + 筛选 */}
        <div
          className="flex flex-wrap items-center gap-3 px-5 py-4 border-b"
          style={{ borderColor: 'var(--app-border)' }}
        >
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('tasks.list.searchPlaceholder')}
            className="flex-1 min-w-[160px] rounded-xl border px-3 py-2 text-sm outline-none"
            style={{
              backgroundColor: 'var(--app-bg)',
              borderColor: 'var(--app-border)',
              color: 'var(--app-text)',
            }}
          />
          <div className="flex gap-1.5">
            {/* 筛选按钮：全部、启用、停用 */}
            {([
              { key: 'all', label: `${t('tasks.list.filterAll')} ${jobs.length}` },
              { key: 'enabled', label: `${t('tasks.list.filterEnabled')} ${stats.enabled}` },
              { key: 'disabled', label: `${t('tasks.list.filterDisabled')} ${stats.disabled}` },
            ] as const).map((item) => {
              const isActive = filter === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setFilter(item.key as CronFilter)}
                  className="rounded-full px-3 py-1.5 text-xs font-medium"
                  style={{
                    backgroundColor: isActive ? 'var(--app-active-bg)' : 'var(--app-bg-subtle)',
                    border: `1px solid ${isActive ? 'var(--app-active-border)' : 'var(--app-border)'}`,
                    color: isActive ? 'var(--app-active-text)' : 'var(--app-text-muted)',
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 任务卡片列表 */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <LoaderCircle size={22} className="animate-spin" style={{ color: 'var(--app-text-muted)' }} />
          </div>
        ) : filteredJobs.length ? (
          <div>
            {filteredJobs.map((job, jobIndex) => {
              const tone = getJobTone(job, t);
              const scheduleColor = getScheduleColor(job);
              const scheduleSummary = getScheduleSummary(job, t);
              const payloadLabel = getPayloadLabel(job, t);
              return (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => handleSelectJob(job)}
                  className="w-full px-5 py-4 text-left transition-colors hover:bg-white/[0.03] active:bg-white/[0.05] group"
                  style={jobIndex > 0 ? { borderTop: '1px solid var(--app-border)' } : undefined}
                >
                  <div className="flex items-center gap-4">
                    {/* 左侧：调度类型图标圆圈 */}
                    <div
                      className="shrink-0 h-10 w-10 rounded-2xl flex items-center justify-center"
                      style={{
                        background: `linear-gradient(135deg, ${scheduleColor}22 0%, ${scheduleColor}10 100%)`,
                        border: `1px solid ${scheduleColor}30`,
                      }}
                    >
                      <Clock3 size={16} style={{ color: scheduleColor }} />
                    </div>

                    {/* 中间：任务名 + 调度摘要 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold truncate" style={{ color: 'var(--app-text)' }}>
                          {sanitizeText(job.name)}
                        </span>
                        {/* 启用/停用状态 badge：tone 提供动态颜色，直接用 style 覆盖 */}
                        <AppBadge
                          size="sm"
                          style={{ backgroundColor: tone.bg, borderColor: tone.border, color: tone.text }}
                        >
                          {tone.label}
                        </AppBadge>
                      </div>
                      {/* 调度摘要 + payload 类型 */}
                      <div className="mt-1 flex items-center gap-3 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                        <span className="flex items-center gap-1">
                          <Clock3 size={11} style={{ color: scheduleColor }} />
                          <span style={{ color: scheduleColor }}>{scheduleSummary}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Sparkles size={11} />
                          {payloadLabel}
                        </span>
                        {job.session && (
                          <span className="flex items-center gap-1">
                            <span
                              className="inline-block h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: 'var(--app-text-muted)' }}
                            />
                            {job.session}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 右侧：下次运行时间 + 箭头 */}
                    <div className="hidden sm:flex items-center gap-3 shrink-0">
                      {job.nextRunAt ? (
                        <div className="text-right">
                          <div
                            className="text-xs font-semibold tabular-nums"
                            style={{ color: '#6ee7b7' }}
                          >
                            {formatRelativeTime(job.nextRunAt, t)}
                          </div>
                          <div className="text-[10px] mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
                            {t('tasks.list.nextRun')}
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>—</div>
                      )}
                      {/* 上次状态指示点 */}
                      {job.status && (
                        <div
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{
                            backgroundColor: job.status.toLowerCase().includes('ok') || job.status.toLowerCase().includes('success')
                              ? '#22c55e'
                              : job.status.toLowerCase().includes('err') || job.status.toLowerCase().includes('fail')
                                ? '#ef4444'
                                : '#94a3b8',
                          }}
                          title={`上次状态: ${job.status}`}
                        />
                      )}
                      {/* 箭头 */}
                      <div
                        className="transition-transform group-hover:translate-x-0.5"
                        style={{ color: 'var(--app-text-muted)' }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div
              className="h-12 w-12 rounded-2xl flex items-center justify-center mb-3"
              style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.08) 100%)', border: '1px solid rgba(99,102,241,0.18)' }}
            >
              <Clock3 size={22} style={{ color: '#a5b4fc' }} />
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>{t('tasks.list.emptyTitle')}</p>
            <p className="mt-1 text-xs" style={{ color: 'var(--app-text-muted)' }}>{t('tasks.list.emptyDesc')}</p>
          </div>
        )}
      </div>

      {/* ── 右侧详情抽屉 ── */}
      {/* 遮罩层：点击关闭抽屉 */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40"
          style={{ backgroundColor: 'rgba(0,0,0,0.35)' }}
          onClick={handleCloseDrawer}
        />
      )}
      {/* 抽屉面板：从右侧滑入 */}
      <div
        className="fixed top-0 right-0 bottom-0 z-50 flex flex-col"
        style={{
          width: '480px',
          backgroundColor: 'var(--app-bg-elevated)',
          borderLeft: '1px solid var(--app-border)',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.28)',
          transform: drawerOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {selectedJob ? (
          <>
            {/* 抽屉头部：渐变背景 + 任务名 + 关闭按钮 */}
            <div
              className="relative px-5 pt-5 pb-4 shrink-0 overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.08) 100%)',
                borderBottom: '1px solid rgba(99,102,241,0.16)',
              }}
            >
              {/* 装饰光晕 */}
              <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full blur-3xl" style={{ backgroundColor: 'rgba(99,102,241,0.18)' }} />
              <div className="relative flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {/* 任务名称 */}
                  <h2 className="text-base font-semibold truncate" style={{ color: 'var(--app-text)' }}>
                    {sanitizeText(selectedJob.name)}
                  </h2>
                  {/* 状态 badge 组 */}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {(() => {
                      const tone = getJobTone(selectedJob, t);
                      return (
                        <AppBadge
                          size="sm"
                          style={{ backgroundColor: tone.bg, borderColor: tone.border, color: tone.text }}
                        >
                          {tone.label}
                        </AppBadge>
                      );
                    })()}
                    <AppBadge size="sm" variant="default" icon={<Clock3 size={10} />}>
                      {getScheduleSummary(selectedJob, t)}
                    </AppBadge>
                    {selectedJob.nextRunAt && (
                      <AppBadge size="sm" variant="success">
                        {/* 「下次」前缀使用翻译键 */}
                        {t('tasks.detail.nextPrefix')} {formatRelativeTime(selectedJob.nextRunAt, t)}
                      </AppBadge>
                    )}
                    <AppBadge size="sm" variant="neutral">
                      {getPayloadKind(selectedJob)}
                    </AppBadge>
                  </div>
                </div>
                {/* 关闭按钮 */}
                <button
                  type="button"
                  onClick={handleCloseDrawer}
                  className="shrink-0 rounded-xl p-1.5 transition-colors hover:bg-white/10"
                  style={{ color: 'var(--app-text-muted)' }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* 操作按钮行 */}
              <div className="relative mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleRunNow(selectedJob)}
                  disabled={runningJobId === selectedJob.id}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer hover:brightness-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:brightness-100 shadow-sm"
                  style={{ backgroundColor: 'rgb(99,102,241)', color: '#fff' }}
                >
                  {runningJobId === selectedJob.id ? <LoaderCircle size={14} className="animate-spin" /> : <PlayCircle size={14} />}
                  {/* 立即执行 / 执行中… 按钮文本 */}
                  {runningJobId === selectedJob.id ? t('tasks.detail.running') : t('tasks.detail.runNow')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleToggleEnabled(selectedJob)}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer hover:brightness-110 active:scale-95 shadow-sm"
                  style={{ backgroundColor: 'var(--app-bg)', color: 'var(--app-text)', border: '1px solid var(--app-border)' }}
                >
                  {selectedJob.enabled === false ? <PlayCircle size={14} /> : <X size={14} />}
                  {/* 启用 / 停用 按钮文本 */}
                  {selectedJob.enabled === false ? t('tasks.detail.enable') : t('tasks.detail.disable')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleRemove(selectedJob)}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer hover:brightness-110 active:scale-95 shadow-sm"
                  style={{ backgroundColor: 'rgb(239,68,68)', color: '#fff' }}
                >
                  <X size={14} />
                  {/* 删除按钮文本 */}
                  {t('tasks.detail.delete')}
                </button>
              </div>
            </div>

            {/* 抽屉可滚动内容区 */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">

              {/* 基本信息 */}
              <div
                className="rounded-2xl border px-4 py-3.5"
                style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)' }}
              >
                {/* 基本信息区域标题 */}
                <div className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--app-text-muted)' }}>{t('tasks.detail.basicInfo')}</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                  {/* 基本信息字段列表：使用翻译键替换硬编码标签 */}
                  {([
                    { label: t('tasks.detail.jobId'), value: selectedJob.id },
                    { label: t('tasks.detail.schedule'), value: getScheduleSummary(selectedJob, t) },
                    { label: t('tasks.detail.nextRun'), value: formatDate(selectedJob.nextRunAt, t) },
                    (selectedJob as any).lastRunAt ? { label: t('tasks.detail.lastRun'), value: formatDate((selectedJob as any).lastRunAt, t) } : null,
                    selectedJob.status ? { label: t('tasks.detail.lastStatus'), value: selectedJob.status } : null,
                    (selectedJob as any).lastDurationMs != null ? { label: t('tasks.detail.lastDuration'), value: `${(selectedJob as any).lastDurationMs} ms` } : null,
                    (selectedJob as any).agentId ? { label: 'Agent ID', value: String((selectedJob as any).agentId) } : null,
                    { label: t('tasks.detail.createdAt'), value: formatDate(selectedJob.createdAt, t) },
                    { label: t('tasks.detail.updatedAt'), value: formatDate(selectedJob.updatedAt, t) },
                  ] as const).filter(Boolean).map((item) => (
                    <div key={item!.label} className="flex items-start gap-2 min-w-0">
                      <span className="shrink-0 text-[11px] pt-0.5 w-16" style={{ color: 'var(--app-text-muted)' }}>{item!.label}</span>
                      <span className="text-[11px] font-semibold break-all" style={{ color: 'var(--app-text)' }}>{item!.value}</span>
                    </div>
                  ))}
                  {/* 上次错误单独一行 */}
                  {(selectedJob as any).lastError && (
                    <div className="col-span-2 flex items-start gap-2">
                      {/* 上次错误标签 */}
                      <span className="shrink-0 text-[11px] pt-0.5 w-16" style={{ color: '#f87171' }}>{t('tasks.detail.lastError')}</span>
                      <span className="text-[11px] break-all" style={{ color: '#fca5a5' }}>
                        {sanitizeText(String((selectedJob as any).lastError))}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Payload 详情 */}
              <div
                className="rounded-2xl border px-4 py-3.5"
                style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)' }}
              >
                <div className="flex items-center justify-between mb-3">
                  {/* 载荷区域标题 */}
                  <div className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--app-text-muted)' }}>{t('tasks.detail.payloadTitle')}</div>
                  {/* Payload 类型 badge */}
                  <AppBadge size="sm" variant="default">
                    {getPayloadKind(selectedJob)}
                  </AppBadge>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {Object.entries(selectedJob.payload || {}).map(([k, v]) => (
                    <div key={k} className="flex items-start gap-2 min-w-0">
                      <span className="shrink-0 text-[11px] pt-0.5 w-16 font-mono" style={{ color: 'var(--app-text-muted)' }}>{k}</span>
                      <span className="text-[11px] font-semibold break-all" style={{ color: 'var(--app-text)' }}>{String(v ?? '')}</span>
                    </div>
                  ))}
                </div>
                {/* Delivery 配置（如有） */}
                {(selectedJob as any).delivery && (
                  <>
                    {/* 投递配置区域标题 */}
                    <div className="mt-3 mb-2 text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--app-text-muted)' }}>{t('tasks.detail.deliveryTitle')}</div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                      {Object.entries((selectedJob as any).delivery).map(([k, v]) => (
                        <div key={k} className="flex items-start gap-2 min-w-0">
                          <span className="shrink-0 text-[11px] pt-0.5 w-16 font-mono" style={{ color: 'var(--app-text-muted)' }}>{k}</span>
                          <span className="text-[11px] font-semibold break-all" style={{ color: 'var(--app-text)' }}>{String(v ?? '')}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* 运行历史 */}
              <div
                className="rounded-2xl border px-4 py-3.5"
                style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)' }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--app-text-muted)' }}>{t('tasks.history.title')}</div>
                  {runsLoading ? (
                    <LoaderCircle size={13} className="animate-spin" style={{ color: 'var(--app-text-muted)' }} />
                  ) : (
                    <span className="text-[11px]" style={{ color: 'var(--app-text-muted)' }}>{t('tasks.history.recentCount').replace('{n}', String(runs.length))}</span>
                  )}
                </div>
                {runs.length ? (
                  <div className="space-y-1.5">
                    {runs.map((run, index) => {
                      /* 根据状态决定颜色 */
                      const isOk = (run.status || '').toLowerCase().includes('ok') || (run.status || '').toLowerCase().includes('success') || (run.status || '').toLowerCase().includes('done');
                      const isErr = (run.status || '').toLowerCase().includes('err') || (run.status || '').toLowerCase().includes('fail');
                      const statusColor = isOk ? '#34d399' : isErr ? '#f87171' : '#94a3b8';
                      const statusBg = isOk ? 'rgba(52,211,153,0.10)' : isErr ? 'rgba(239,68,68,0.10)' : 'rgba(148,163,184,0.10)';
                      const statusBorder = isOk ? 'rgba(52,211,153,0.20)' : isErr ? 'rgba(239,68,68,0.20)' : 'rgba(148,163,184,0.18)';
                      return (
                        <div
                          key={`${run.runId || run.id || index}`}
                          className="flex items-start gap-2.5 rounded-xl px-3 py-2.5"
                          style={{ backgroundColor: 'var(--app-bg-elevated)', border: '1px solid var(--app-border)' }}
                        >
                          {/* 状态指示点 */}
                          <div className="mt-1 h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: statusColor }} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="flex items-center gap-1 min-w-0">
                                <span className="text-[11px] font-medium truncate" style={{ color: 'var(--app-text)' }}>
                                  {run.runId || run.id || `Run #${index + 1}`}
                                </span>
                                {/* 复制 run ID 按钮 */}
                                {(run.runId || run.id) && (
                                  <button
                                    type="button"
                                    className="shrink-0 p-0.5 rounded transition-colors hover:bg-white/10"
                                    style={{ color: copiedRunId === (run.runId || run.id) ? '#34d399' : 'var(--app-text-muted)' }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const id = run.runId || run.id || '';
                                      void navigator.clipboard.writeText(id);
                                      setCopiedRunId(id);
                                      setTimeout(() => setCopiedRunId((prev) => prev === id ? '' : prev), 1500);
                                    }}
                                    title={copiedRunId === (run.runId || run.id) ? 'Copied' : 'Copy ID'}
                                  >
                                    {copiedRunId === (run.runId || run.id)
                                      ? <Check size={11} />
                                      : <Copy size={11} />}
                                  </button>
                                )}
                              </span>
                              <span
                                className="shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                                style={{ backgroundColor: statusBg, border: `1px solid ${statusBorder}`, color: statusColor }}
                              >
                                {run.status || 'unknown'}
                              </span>
                            </div>
                            <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]" style={{ color: 'var(--app-text-muted)' }}>
                              {run.startedAt && <span>{t('tasks.history.start')} {formatDate(run.startedAt, t)}</span>}
                              {run.finishedAt && <span>{t('tasks.history.end')} {formatDate(run.finishedAt, t)}</span>}
                              {run.summary && <span className="w-full truncate">{run.summary}</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-[11px] py-3 text-center" style={{ color: 'var(--app-text-muted)' }}>{t('tasks.history.empty')}</div>
                )}
              </div>

            </div>
          </>
        ) : null}
      </div>


      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm"
        style={{
          backgroundColor: 'var(--app-bg-elevated)',
          borderColor: 'var(--app-border)',
          color: 'var(--app-text-muted)',
        }}
      >
        {/* 页脚统计文本：使用翻译键 + 参数替换 */}
        <div>{t('tasks.list.footer').replace('{total}', String(stats.total)).replace('{enabled}', String(stats.enabled))}</div>
        <div>{overview ? `OpenClaw ${overview.openclawVersion}` : t('tasks.loadingConfig')}</div>
      </div>


      {/* ── 新建 Cron 任务 Modal ── */}
      {/* 新建定时任务弹窗 */}
      <AppModal
        open={showCreateModal}
        onClose={closeCreateModal}
        title={t('tasks.create.title')}
        icon={<Clock3 size={20} />}
        variant="default"
        size="xl"
        disableClose={saving}
        footer={
          <>
            {/* 取消按钮 */}
            <AppButton variant="secondary" onClick={closeCreateModal} disabled={saving}>
              {t('tasks.create.cancel')}
            </AppButton>
            {/* 保存按钮 */}
            <AppButton
              variant="primary"
              onClick={() => void handleCreate()}
              disabled={saving || !draft.name.trim()}
              icon={saving ? <LoaderCircle size={14} className="animate-spin" /> : undefined}
            >
              {t('tasks.create.save')}
            </AppButton>
          </>
        }
      >
        {/* 副标题说明 */}
        <p className="text-sm mb-5" style={{ color: 'var(--app-text-muted)' }}>
          {t('tasks.create.subtitle')}
        </p>

        {/* 内容区：限制最大高度并允许滚动 */}
        <div style={{ maxHeight: '60vh', overflowY: 'auto' }} className="space-y-4">

          {/* ── Basics ── */}
          <section
            className="rounded-2xl border p-5"
            style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-bg-subtle)' }}
          >
            <div className="text-sm font-semibold mb-4" style={{ color: 'var(--app-text)' }}>{t('tasks.basics')}</div>
            <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-x-4 gap-y-4">
              {/* Name（名称） */}
              <div className="pt-3 text-sm" style={{ color: 'var(--app-text-muted)' }}>{t('tasks.name')}</div>
              <input
                value={draft.name}
                onChange={(event) => updateDraft({ name: event.target.value })}
                placeholder={t('tasks.namePlaceholder')}
                className={inputClassName}
                style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
              />

              {/* Description（描述） */}
              <div className="pt-3 text-sm" style={{ color: 'var(--app-text-muted)' }}>{t('tasks.description')}</div>
              <input
                value={draft.description || ''}
                onChange={(event) => updateDraft({ description: event.target.value })}
                placeholder={t('tasks.descriptionPlaceholder')}
                className={inputClassName}
                style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
              />

              {/* Agent ID（智能体 ID） */}
              <div className="pt-3 text-sm" style={{ color: 'var(--app-text-muted)' }}>{t('tasks.agentId')}</div>
              <select
                value={draft.agentId || ''}
                onChange={(event) => updateDraft({ agentId: event.target.value })}
                className={inputClassName}
                style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
              >
                <option value="">{t('tasks.create.agentIdPlaceholder')}</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>{agent.name}</option>
                ))}
              </select>

              {/* Enabled（启用开关） */}
              <div className="pt-2 text-sm" style={{ color: 'var(--app-text-muted)' }}>{t('tasks.enabled')}</div>
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => updateDraft({ enabled: !draft.enabled })}
                  className="relative h-7 w-14 rounded-full transition-token-normal"
                  style={{ backgroundColor: draft.enabled ? 'var(--app-active-bg)' : 'var(--app-bg-subtle)', border: '1px solid var(--app-border)' }}
                >
                  <span
                    className="absolute top-0.5 h-6 w-6 rounded-full bg-white transition-token-normal"
                    style={{ left: draft.enabled ? '30px' : '2px' }}
                  />
                </button>
              </div>

              {/* Session target（会话目标） */}
              <div className="pt-3 text-sm" style={{ color: 'var(--app-text-muted)' }}>{t('tasks.sessionTarget')}</div>
              <div className="flex flex-wrap gap-2">
                {cronSessionTargetOptions.map((item) => {
                  const value = item.value as 'main' | 'isolated';
                  const isActive = draft.sessionTarget === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => updateDraft({ sessionTarget: value })}
                      className="rounded-xl px-4 py-2 text-sm font-medium transition-colors"
                      style={{
                        backgroundColor: isActive ? 'var(--app-active-bg)' : 'var(--app-bg)',
                        border: `1px solid ${isActive ? 'var(--app-active-border)' : 'var(--app-border)'}`,
                        color: isActive ? 'var(--app-active-text)' : 'var(--app-text)',
                      }}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>

              {/* Wake mode（唤醒模式） */}
              <div className="pt-3 text-sm" style={{ color: 'var(--app-text-muted)' }}>{t('tasks.wakeMode')}</div>
              <div>
                <div className="flex flex-wrap gap-2">
                  {cronWakeModeOptions.map((item) => {
                    const value = item.value as 'now' | 'next-heartbeat';
                    const isActive = draft.wakeMode === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          updateDraft({ wakeMode: value });
                        }}
                        className="rounded-xl px-4 py-2 text-sm font-medium transition-colors"
                        style={{
                          backgroundColor: isActive ? 'var(--app-active-bg)' : 'var(--app-bg)',
                          border: `1px solid ${isActive ? 'var(--app-active-border)' : 'var(--app-border)'}`,
                          color: isActive ? 'var(--app-active-text)' : 'var(--app-text)',
                        }}
                      >
                        {value}
                      </button>
                    );
                  })}
                </div>
                {/* Wake mode 提示文本 */}
                <div className="mt-2 text-xs leading-6" style={{ color: 'var(--app-text-muted)' }}>
                  {t('tasks.create.wakeModeHint')}
                </div>
              </div>
            </div>
          </section>

          {/* ── Schedule ── */}
          <section
            className="rounded-2xl border p-5"
            style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-bg-subtle)' }}
          >
            {/* 调度配置区域标题 */}
            <div className="text-sm font-semibold mb-4" style={{ color: 'var(--app-text)' }}>{t('tasks.create.scheduleTitle')}</div>
            <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-x-4 gap-y-4">
              {/* 调度类型 */}
              <div className="pt-3 text-sm" style={{ color: 'var(--app-text-muted)' }}>{t('tasks.create.scheduleType')}</div>
              <div>
                <div className="flex flex-wrap gap-2">
                  {cronScheduleKindOptions.map((item) => {
                    const value = item.value as 'at' | 'every' | 'cron';
                    const isActive = draft.schedule.kind === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => switchScheduleKind(value)}
                        className="rounded-xl px-4 py-2 text-sm font-medium transition-colors"
                        style={{
                          backgroundColor: isActive ? 'var(--app-active-bg)' : 'var(--app-bg)',
                          border: `1px solid ${isActive ? 'var(--app-active-border)' : 'var(--app-border)'}`,
                          color: isActive ? 'var(--app-active-text)' : 'var(--app-text)',
                        }}
                      >
                        {value}
                      </button>
                    );
                  })}
                </div>
                {/* 调度类型提示 */}
                <div className="mt-2 text-xs leading-6" style={{ color: 'var(--app-text-muted)' }}>
                  {t('tasks.create.scheduleTypeHint')}
                </div>
              </div>

              {/* 调度值输入 */}
              <div className="pt-3 text-sm" style={{ color: 'var(--app-text-muted)' }}>
                {draft.schedule.kind === 'at' ? 'At' : draft.schedule.kind === 'every' ? 'Every' : 'Cron'}
              </div>
              <input
                value={
                  draft.schedule.kind === 'at'
                    ? draft.schedule.at
                    : draft.schedule.kind === 'every'
                      ? draft.schedule.every
                      : draft.schedule.cron
                }
                onChange={(event) => {
                  const value = event.target.value;
                  if (draft.schedule.kind === 'at') {
                    updateDraft({ schedule: { kind: 'at', at: value } });
                    return;
                  }
                  if (draft.schedule.kind === 'every') {
                    updateDraft({ schedule: { kind: 'every', every: value } });
                    return;
                  }
                  updateDraft({ schedule: { kind: 'cron', cron: value } });
                }}
                placeholder={
                  draft.schedule.kind === 'at'
                    ? '2026-03-11T07:00:00'
                    : draft.schedule.kind === 'every'
                      ? '1h'
                      : '0 7 * * *'
                }
                className={inputClassName}
                style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
              />
            </div>
          </section>

          {/* ── Payload ── */}
          <section
            className="rounded-2xl border p-5"
            style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-bg-subtle)' }}
          >
            {/* Payload 区域标题 */}
            <div className="text-sm font-semibold" style={{ color: 'var(--app-text)' }}>{t('tasks.payload')}</div>
            {/* Payload 副标题 */}
            <div className="mt-1 mb-4 text-xs" style={{ color: 'var(--app-text-muted)' }}>
              {t('tasks.create.payloadSubtitle')}
            </div>
            <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-x-4 gap-y-4">
              {/* Payload Kind（类型） */}
              <div className="pt-3 text-sm" style={{ color: 'var(--app-text-muted)' }}>{t('tasks.kind')}</div>
              <div className="flex flex-wrap gap-2">
                {cronPayloadKindOptions.map((item) => {
                  const value = item.value as 'systemEvent' | 'agentTurn';
                  const isActive = draft.payload.kind === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => switchPayloadKind(value)}
                      className="rounded-xl px-4 py-2 text-sm font-medium transition-colors"
                      style={{
                        backgroundColor: isActive ? 'var(--app-active-bg)' : 'var(--app-bg)',
                        border: `1px solid ${isActive ? 'var(--app-active-border)' : 'var(--app-border)'}`,
                        color: isActive ? 'var(--app-active-text)' : 'var(--app-text)',
                      }}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>

              {/* systemEvent 字段 */}
              {draft.payload.kind === 'systemEvent' ? (
                <>
                  {/* System event text（系统事件文本） */}
                  <div className="pt-3 text-sm" style={{ color: 'var(--app-text-muted)' }}>{t('tasks.systemEventText')}</div>
                  <textarea
                    value={draft.payload.text}
                    onChange={(event) => updatePayload({ text: event.target.value })}
                    className={textareaClassName}
                    style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                  />
                </>
              ) : agentTurnPayload ? (
                <>
                  {/* Message（消息） */}
                  <div className="pt-3 text-sm" style={{ color: 'var(--app-text-muted)' }}>{t('tasks.message')}</div>
                  <textarea
                    value={agentTurnPayload.message}
                    onChange={(event) => updatePayload({ message: event.target.value })}
                    placeholder={t('tasks.create.messagePlaceholder')}
                    className={textareaClassName}
                    style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                  />

                  {/* Thinking（思考模式） */}
                  <div className="pt-3 text-sm" style={{ color: 'var(--app-text-muted)' }}>{t('tasks.thinking')}</div>
                  <select
                    value={agentTurnPayload.thinking || ''}
                    onChange={(event) => updatePayload({ thinking: event.target.value as any })}
                    className={inputClassName}
                    style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                  >
                    <option value="">{t('tasks.optional')}</option>
                    {cronThinkingOptions.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>

                  {/* Timeout（超时时间） */}
                  <div className="pt-3 text-sm" style={{ color: 'var(--app-text-muted)' }}>{t('tasks.timeout')}</div>
                  <input
                    type="number"
                    value={agentTurnPayload.timeoutSeconds || ''}
                    onChange={(event) => updatePayload({ timeoutSeconds: Number(event.target.value || 0) || undefined })}
                    placeholder={t('tasks.create.timeoutPlaceholder')}
                    className={inputClassName}
                    style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                  />

                  {/* Delivery（投递方式） */}
                  <div className="pt-3 text-sm" style={{ color: 'var(--app-text-muted)' }}>{t('tasks.delivery')}</div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { key: true, label: t('tasks.create.deliveryAnnounce') },
                      { key: false, label: t('tasks.create.deliveryNone') },
                    ].map((item) => {
                      const isActive = agentTurnPayload.deliver === item.key;
                      return (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => updatePayload({ deliver: item.key, announce: item.key })}
                          className="rounded-xl px-4 py-2 text-sm font-medium transition-colors"
                          style={{
                            backgroundColor: isActive ? 'var(--app-active-bg)' : 'var(--app-bg)',
                            border: `1px solid ${isActive ? 'var(--app-active-border)' : 'var(--app-border)'}`,
                            color: isActive ? 'var(--app-active-text)' : 'var(--app-text)',
                          }}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Channel（渠道） */}
                  <div className="pt-3 text-sm" style={{ color: 'var(--app-text-muted)' }}>{t('tasks.channel')}</div>
                  <div className="flex flex-wrap gap-2">
                    {cronDeliveryChannelOptions.map((item) => {
                      const channel = item.value;
                      const isActive = (agentTurnPayload.channel || 'last') === channel;
                      return (
                        <button
                          key={channel}
                          type="button"
                          onClick={() => updatePayload({ channel })}
                          className="rounded-xl px-4 py-2 text-sm font-medium transition-colors"
                          style={{
                            backgroundColor: isActive ? 'var(--app-active-bg)' : 'var(--app-bg)',
                            border: `1px solid ${isActive ? 'var(--app-active-border)' : 'var(--app-border)'}`,
                            color: isActive ? 'var(--app-active-text)' : 'var(--app-text)',
                          }}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* To（接收方） */}
                  <div className="pt-3 text-sm" style={{ color: 'var(--app-text-muted)' }}>{t('tasks.to')}</div>
                  <input
                    value={agentTurnPayload.to || ''}
                    onChange={(event) => updatePayload({ to: event.target.value })}
                    placeholder={t('tasks.create.toPlaceholder')}
                    className={inputClassName}
                    style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                  />
                </>
              ) : null}
            </div>
          </section>
        </div>
      </AppModal>
    </div>
  );
};

export default Tasks;
