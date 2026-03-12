import React, { useEffect, useMemo, useState } from 'react';
import {
  Clock3,
  LoaderCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import AppButton from '../components/AppButton';
import GlassCard from '../components/GlassCard';
import {
  cronCommandDefinitions,
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

const formatDate = (dateString?: string) => {
  if (!dateString) {
    return '未设置';
  }

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return date.toLocaleString();
};

const formatRelativeTime = (dateString?: string) => {
  if (!dateString) {
    return '待定';
  }

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return '待定';
  }

  const diffMs = date.getTime() - Date.now();
  const diffMins = Math.round(Math.abs(diffMs) / (1000 * 60));

  if (diffMins < 1) {
    return diffMs >= 0 ? '即将开始' : '刚刚';
  }

  if (diffMins < 60) {
    return diffMs >= 0 ? `${diffMins}m 后` : `${diffMins}m 前`;
  }

  const diffHours = Math.round(diffMins / 60);
  return diffMs >= 0 ? `${diffHours}h 后` : `${diffHours}h 前`;
};

const getNestedValue = (
  target: Record<string, unknown> | undefined,
  path: string,
) => {
  return path
    .split('.')
    .filter(Boolean)
    .reduce<unknown>((current, segment) => {
      if (typeof current !== 'object' || current === null) {
        return undefined;
      }

      return (current as Record<string, unknown>)[segment];
    }, target);
};

const getScheduleSummary = (job: CronJobRecord) => {
  const schedule = job.schedule || {};
  if (typeof schedule.every === 'string') {
    return `every ${schedule.every}`;
  }
  if (typeof schedule.at === 'string') {
    return `at ${schedule.at}`;
  }
  if (typeof schedule.cron === 'string') {
    return schedule.cron;
  }
  return '未识别';
};

const getPayloadKind = (job: CronJobRecord) => {
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

const getJobTone = (job: CronJobRecord) => {
  if (job.enabled === false) {
    return {
      bg: 'rgba(148, 163, 184, 0.14)',
      border: 'rgba(148, 163, 184, 0.22)',
      text: '#CBD5E1',
      label: 'disabled',
    };
  }

  return {
    bg: 'rgba(34, 197, 94, 0.14)',
    border: 'rgba(34, 197, 94, 0.22)',
    text: '#86EFAC',
    label: 'ok',
  };
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
        name: String(item.name || item.id || '未命名 Agent'),
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
        throw new Error(result.error || '读取 cron 任务失败');
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
        getScheduleSummary(job),
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

  const configSummary = useMemo(() => {
    if (!overview) {
      return [];
    }

    return [
      {
        label: '默认 Provider',
        value: String(
          overview.draft.provider
            || getNestedValue(overview.rawConfig, 'agents.defaults.provider')
            || '未设置',
        ),
      },
      {
        label: '默认 Model',
        value: String(
          overview.draft.model
            || getNestedValue(overview.rawConfig, 'agents.defaults.model')
            || '未设置',
        ),
      },
      {
        label: 'Workspace',
        value: String(
          overview.draft.workspaceRoot
            || getNestedValue(overview.rawConfig, 'workspace.root')
            || '未设置',
        ),
      },
      {
        label: 'Gateway',
        value: `${String(overview.draft.host || getNestedValue(overview.rawConfig, 'gateway.host') || '127.0.0.1')}:${
          String(overview.draft.port || getNestedValue(overview.rawConfig, 'gateway.port') || '18789')
        }`,
      },
    ];
  }, [overview]);

  const commandReference = useMemo(() => {
    return cronCommandDefinitions.map((item) => [item.command, ...item.subcommands].join(' '));
  }, []);

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
            mode: current.wakeMode,
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
              mode: draft.wakeMode,
            } as CronPayloadSystemEvent
          : draft.payload,
      };

      const result = await electronAPI.cronCreate(payload);
      if (!result.success) {
        throw new Error(result.error || '创建 cron 任务失败');
      }

      closeCreateModal();
      await loadJobs();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = async (job: CronJobRecord) => {
    const action = job.enabled === false ? electronAPI.cronEnable : electronAPI.cronDisable;
    const result = await action(job.id);
    if (!result.success) {
      setError(result.error || '更新 cron 状态失败');
      return;
    }
    await loadJobs();
  };

  const handleRunNow = async (job: CronJobRecord) => {
    const result = await electronAPI.cronRun(job.id, true);
    if (!result.success) {
      setError(result.error || '执行 cron 任务失败');
      return;
    }
    await loadRuns(job.id);
  };

  const handleRemove = async (job: CronJobRecord) => {
    if (!confirm(`确认删除 cron 任务 ${job.name} 吗？`)) {
      return;
    }

    const result = await electronAPI.cronRemove(job.id);
    if (!result.success) {
      setError(result.error || '删除 cron 任务失败');
      return;
    }

    await loadJobs();
  };

  return (
    <div className="space-y-6 p-6">
      {/* 顶部渐变标题卡片，参照设置页面设计语言 */}
      <GlassCard
        variant="gradient"
        className="relative rounded-[28px] px-6 py-5"
        style={{
          background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.12) 0%, rgba(245, 158, 11, 0.08) 48%, rgba(255, 255, 255, 0.02) 100%)',
          backdropFilter: 'blur(18px)',
          border: 'none',
        }}
      >
        {/* 右上角装饰光晕 */}
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full blur-3xl" style={{ backgroundColor: 'rgba(251, 191, 36, 0.18)' }} />
        <div className="pointer-events-none absolute bottom-0 right-20 h-32 w-32 rounded-full blur-3xl" style={{ backgroundColor: 'rgba(245, 158, 11, 0.14)' }} />

        <div className="relative flex items-start justify-between gap-4">
          <div className="max-w-2xl">
            {/* badge 标签 */}
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                color: 'var(--app-text)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <Clock3 size={14} />
              Gateway Scheduler
            </div>
            <h1 className="mt-2 text-3xl font-semibold leading-tight" style={{ color: 'var(--app-text)' }}>
              Cron 任务
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
              管理 Gateway cron jobs，查看运行历史，并按不同 session target / payload 类型创建任务。
            </p>
          </div>

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
              Refresh
            </AppButton>
            <AppButton
              variant="primary"
              onClick={openCreateModal}
              icon={<Plus size={14} />}
            >
              New Job
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
                运行 doctor --fix 修复配置
              </AppButton>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: '总任务数', value: stats.total, icon: Clock3 },
          { label: '启用中', value: stats.enabled, icon: PlayCircle },
          { label: '已停用', value: stats.disabled, icon: X },
          { label: '最近记录', value: stats.runs, icon: Sparkles },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className="rounded-2xl border p-4"
              style={{
                backgroundColor: 'var(--app-bg-elevated)',
                borderColor: 'var(--app-border)',
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.14em]" style={{ color: 'var(--app-text-muted)' }}>
                    {item.label}
                  </div>
                  <div className="mt-3 text-2xl font-semibold" style={{ color: 'var(--app-text)' }}>
                    {item.value}
                  </div>
                </div>
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-2xl"
                  style={{
                    backgroundColor: 'var(--app-active-bg)',
                    color: 'var(--app-active-text)',
                  }}
                >
                  <Icon size={18} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="grid min-h-[680px] grid-cols-1 overflow-hidden rounded-[28px] border xl:grid-cols-[320px_minmax(0,1fr)]"
        style={{
          backgroundColor: 'var(--app-bg-elevated)',
          borderColor: 'var(--app-border)',
        }}
      >
        <div
          className="border-b p-5 xl:border-b-0 xl:border-r"
          style={{ borderColor: 'var(--app-border)' }}
        >
          <div>
            <h2 className="text-xl font-semibold" style={{ color: 'var(--app-text)' }}>
              Cron Jobs
            </h2>
            <p className="mt-1 text-sm leading-6" style={{ color: 'var(--app-text-muted)' }}>
              管理定时任务并查看下次执行时间。
            </p>
          </div>

          <div className="mt-4 space-y-3">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索任务名称..."
              className={inputClassName}
              style={{
                backgroundColor: 'var(--app-bg)',
                borderColor: 'var(--app-border)',
                color: 'var(--app-text)',
              }}
            />

            <div className="flex gap-2">
              {[
                { key: 'all', label: `全部 ${jobs.length}` },
                { key: 'enabled', label: `启用 ${stats.enabled}` },
                { key: 'disabled', label: `停用 ${stats.disabled}` },
              ].map((item) => {
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

          <div className="mt-5 space-y-2">
            {filteredJobs.length ? filteredJobs.map((job) => {
              const tone = getJobTone(job);
              const isActive = selectedJob?.id === job.id;
              return (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => setSelectedJobId(job.id)}
                  className="w-full rounded-2xl border px-4 py-3 text-left transition-all duration-200"
                  style={{
                    backgroundColor: isActive ? 'rgba(59, 130, 246, 0.10)' : 'transparent',
                    borderColor: isActive ? 'rgba(59, 130, 246, 0.22)' : 'transparent',
                    boxShadow: isActive ? 'inset 0 0 0 1px rgba(59, 130, 246, 0.16)' : 'none',
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold" style={{ color: 'var(--app-text)' }}>
                        {sanitizeText(job.name)}
                      </div>
                      <div className="mt-1 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                        {getScheduleSummary(job)}
                      </div>
                    </div>
                    <div
                      className="shrink-0 rounded-full px-2 py-1 text-xs font-semibold"
                      style={{
                        backgroundColor: tone.bg,
                        border: `1px solid ${tone.border}`,
                        color: tone.text,
                      }}
                    >
                      {tone.label}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full px-2 py-1 text-[11px]" style={{ backgroundColor: 'var(--app-bg-subtle)', color: 'var(--app-text-muted)' }}>
                      {job.session || 'isolated'}
                    </span>
                    <span className="rounded-full px-2 py-1 text-[11px]" style={{ backgroundColor: 'var(--app-bg-subtle)', color: 'var(--app-text-muted)' }}>
                      {getPayloadKind(job)}
                    </span>
                    <span className="rounded-full px-2 py-1 text-[11px]" style={{ backgroundColor: 'var(--app-bg-subtle)', color: 'var(--app-text-muted)' }}>
                      {formatRelativeTime(job.nextRunAt)}
                    </span>
                  </div>
                </button>
              );
            }) : (
              <div className="rounded-2xl border px-4 py-5 text-sm" style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text-muted)' }}>
                当前没有 cron 任务。
              </div>
            )}
          </div>
        </div>

        <div className="p-6">
          {selectedJob ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--app-text-muted)' }}>
                    Cron Details
                  </div>
                  <h2 className="mt-2 text-3xl font-semibold" style={{ color: 'var(--app-text)' }}>
                    {sanitizeText(selectedJob.name)}
                  </h2>
                  <p className="mt-2 text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
                    查看任务详情、最近运行记录，以及当前默认运行环境。
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <AppButton
                    variant="secondary"
                    onClick={() => void handleRunNow(selectedJob)}
                  >
                    立即执行
                  </AppButton>
                  <AppButton
                    variant="secondary"
                    onClick={() => void handleToggleEnabled(selectedJob)}
                  >
                    {selectedJob.enabled === false ? '启用' : '停用'}
                  </AppButton>
                  <AppButton
                    variant="danger"
                    onClick={() => void handleRemove(selectedJob)}
                  >
                    删除
                  </AppButton>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
                {[
                  { label: '任务 ID', value: selectedJob.id },
                  { label: '会话目标', value: selectedJob.session || 'isolated' },
                  selectedJob.agentId ? { label: 'Agent ID', value: selectedJob.agentId } : null,
                  { label: '调度方式', value: getScheduleSummary(selectedJob) },
                  { label: '下次运行', value: formatDate(selectedJob.nextRunAt) },
                  { label: '上次运行', value: formatDate(selectedJob.lastRunAt) },
                  selectedJob.status ? { label: '上次状态', value: selectedJob.status } : null,
                  selectedJob.lastError ? { label: '上次错误', value: selectedJob.lastError } : null,
                  selectedJob.lastDurationMs != null ? { label: '上次耗时', value: `${selectedJob.lastDurationMs} ms` } : null,
                  { label: '创建时间', value: formatDate(selectedJob.createdAt) },
                  { label: '更新时间', value: formatDate(selectedJob.updatedAt) },
                ].filter(Boolean).map((item) => (
                  <div
                    key={item.label}
                    className="rounded-2xl border p-4"
                    style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)' }}
                  >
                    <div className="text-xs uppercase tracking-[0.14em]" style={{ color: 'var(--app-text-muted)' }}>
                      {item.label}
                    </div>
                    <div className="mt-2 break-all text-sm font-medium" style={{ color: 'var(--app-text)' }}>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_340px]">
                <div className="space-y-4">
                  <div
                    className="rounded-[24px] border p-5"
                    style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)' }}
                  >
                    <h3 className="text-base font-semibold" style={{ color: 'var(--app-text)' }}>
                      Payload 详情
                    </h3>
                    <pre
                      className="mt-4 overflow-x-auto rounded-2xl border p-4 text-xs leading-6"
                      style={{
                        backgroundColor: 'var(--app-bg-elevated)',
                        borderColor: 'var(--app-border)',
                        color: 'var(--app-text-muted)',
                      }}
                    >
                      {JSON.stringify(selectedJob.payload || {}, null, 2)}
                    </pre>
                    {selectedJob.delivery ? (
                      <>
                        <h3 className="mt-5 text-base font-semibold" style={{ color: 'var(--app-text)' }}>
                          Delivery 配置
                        </h3>
                        <pre
                          className="mt-4 overflow-x-auto rounded-2xl border p-4 text-xs leading-6"
                          style={{
                            backgroundColor: 'var(--app-bg-elevated)',
                            borderColor: 'var(--app-border)',
                            color: 'var(--app-text-muted)',
                          }}
                        >
                          {JSON.stringify(selectedJob.delivery, null, 2)}
                        </pre>
                      </>
                    ) : null}
                  </div>

                  <div
                    className="rounded-[24px] border p-5"
                    style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)' }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-base font-semibold" style={{ color: 'var(--app-text)' }}>
                        Run History
                      </h3>
                      {runsLoading ? (
                        <LoaderCircle size={16} className="animate-spin" style={{ color: 'var(--app-text-muted)' }} />
                      ) : null}
                    </div>
                    <div className="mt-4 space-y-2">
                      {runs.length ? runs.map((run, index) => (
                        <div
                          key={`${run.runId || run.id || index}`}
                          className="rounded-2xl border p-3"
                          style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)' }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
                              {run.runId || run.id || `Run ${index + 1}`}
                            </div>
                            <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
                              {run.status || 'unknown'}
                            </div>
                          </div>
                          <div className="mt-2 text-xs leading-6" style={{ color: 'var(--app-text-muted)' }}>
                            <div>开始：{formatDate(run.startedAt)}</div>
                            <div>结束：{formatDate(run.finishedAt)}</div>
                            {run.summary ? <div>摘要：{run.summary}</div> : null}
                          </div>
                        </div>
                      )) : (
                        <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
                          暂无运行记录。
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div
                    className="rounded-[24px] border p-5"
                    style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)' }}
                  >
                    <h3 className="text-base font-semibold" style={{ color: 'var(--app-text)' }}>
                      默认运行配置
                    </h3>
                    <div className="mt-4 space-y-2">
                      {configSummary.map((item) => (
                        <div
                          key={item.label}
                          className="rounded-2xl border p-3"
                          style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)' }}
                        >
                          <div className="text-xs uppercase tracking-[0.12em]" style={{ color: 'var(--app-text-muted)' }}>
                            {item.label}
                          </div>
                          <div className="mt-2 break-all text-sm font-medium" style={{ color: 'var(--app-text)' }}>
                            {item.value}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div
                    className="rounded-[24px] border p-5"
                    style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)' }}
                  >
                    <h3 className="text-base font-semibold" style={{ color: 'var(--app-text)' }}>
                      命令参考
                    </h3>
                    <div className="mt-4 space-y-2">
                      {commandReference.map((command) => (
                        <div
                          key={command}
                          className="rounded-2xl border p-3 font-mono text-xs leading-6"
                          style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)', color: 'var(--app-text-muted)' }}
                        >
                          {command}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-xl">
              <h2 className="text-2xl font-semibold" style={{ color: 'var(--app-text)' }}>
                Select a job to inspect details and run history.
              </h2>
              <p className="mt-2 text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
                提示：可以点击 `New Job` 创建一个新的 cron 任务；不同 session target 和 payload 类型会显示不同表单字段。
              </p>
            </div>
          )}
        </div>
      </div>

      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm"
        style={{
          backgroundColor: 'var(--app-bg-elevated)',
          borderColor: 'var(--app-border)',
          color: 'var(--app-text-muted)',
        }}
      >
        <div>共 {stats.total} 个 cron 任务，其中启用 {stats.enabled} 个。</div>
        <div>{overview ? `OpenClaw ${overview.openclawVersion}` : '正在读取 OpenClaw 配置...'}</div>
      </div>

      {showCreateModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-6">
          <div
            className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-[32px] border p-6"
            style={{
              backgroundColor: 'rgba(24, 31, 36, 0.98)',
              borderColor: 'rgba(255, 255, 255, 0.12)',
              boxShadow: '0 30px 80px rgba(0, 0, 0, 0.45)',
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-3xl font-semibold" style={{ color: '#F8FAFC' }}>
                  New cron job
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-7" style={{ color: 'rgba(226, 232, 240, 0.74)' }}>
                  Create a schedule that wakes OpenClaw via the Gateway. 不同的 session target 和 payload 类型会切换不同字段。
                </p>
              </div>
              <button
                type="button"
                onClick={closeCreateModal}
                className="rounded-xl p-2"
                style={{ color: 'rgba(226, 232, 240, 0.74)' }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6 space-y-6">
              <section className="rounded-[24px] border p-5" style={{ borderColor: 'rgba(255, 255, 255, 0.08)', backgroundColor: 'rgba(255, 255, 255, 0.03)' }}>
                <div className="text-sm font-semibold" style={{ color: '#F8FAFC' }}>Basics</div>
                <div className="mt-4 grid grid-cols-[160px_minmax(0,1fr)] gap-x-4 gap-y-4">
                  <div className="pt-3 text-sm" style={{ color: 'rgba(226, 232, 240, 0.72)' }}>Name</div>
                  <input
                    value={draft.name}
                    onChange={(event) => updateDraft({ name: event.target.value })}
                    placeholder="Required (e.g. “Daily summary”)"
                    className={inputClassName}
                    style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', borderColor: 'rgba(255, 255, 255, 0.10)', color: '#F8FAFC' }}
                  />

                  <div className="pt-3 text-sm" style={{ color: 'rgba(226, 232, 240, 0.72)' }}>Description</div>
                  <input
                    value={draft.description || ''}
                    onChange={(event) => updateDraft({ description: event.target.value })}
                    placeholder="Optional notes"
                    className={inputClassName}
                    style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', borderColor: 'rgba(255, 255, 255, 0.10)', color: '#F8FAFC' }}
                  />

                  <div className="pt-3 text-sm" style={{ color: 'rgba(226, 232, 240, 0.72)' }}>Agent ID</div>
                  <select
                    value={draft.agentId || ''}
                    onChange={(event) => updateDraft({ agentId: event.target.value })}
                    className={inputClassName}
                    style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', borderColor: 'rgba(255, 255, 255, 0.10)', color: '#F8FAFC' }}
                  >
                    <option value="">Optional (default agent)</option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}
                      </option>
                    ))}
                  </select>

                  <div className="pt-2 text-sm" style={{ color: 'rgba(226, 232, 240, 0.72)' }}>Enabled</div>
                  <div className="flex items-center">
                    <button
                      type="button"
                      onClick={() => updateDraft({ enabled: !draft.enabled })}
                      className="relative h-7 w-14 rounded-full transition-all duration-200"
                      style={{ backgroundColor: draft.enabled ? '#0A84FF' : 'rgba(255, 255, 255, 0.14)' }}
                    >
                      <span
                        className="absolute top-0.5 h-6 w-6 rounded-full bg-white transition-all duration-200"
                        style={{ left: draft.enabled ? '30px' : '2px' }}
                      />
                    </button>
                  </div>

                  <div className="pt-3 text-sm" style={{ color: 'rgba(226, 232, 240, 0.72)' }}>Session target</div>
                  <div className="flex flex-wrap gap-2">
                    {cronSessionTargetOptions.map((item) => {
                      const value = item.value as 'main' | 'isolated';
                      const isActive = draft.sessionTarget === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => updateDraft({ sessionTarget: value })}
                          className="rounded-xl px-4 py-2 text-sm font-medium"
                          style={{
                            backgroundColor: isActive ? '#0A84FF' : 'rgba(255, 255, 255, 0.08)',
                            color: '#F8FAFC',
                          }}
                        >
                          {value}
                        </button>
                      );
                    })}
                  </div>

                  <div className="pt-3 text-sm" style={{ color: 'rgba(226, 232, 240, 0.72)' }}>Wake mode</div>
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
                              if (draft.payload.kind === 'systemEvent') {
                                updatePayload({ mode: value });
                              }
                            }}
                            className="rounded-xl px-4 py-2 text-sm font-medium"
                            style={{
                              backgroundColor: isActive ? '#0A84FF' : 'rgba(255, 255, 255, 0.08)',
                              color: '#F8FAFC',
                            }}
                          >
                            {value}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-2 text-xs leading-6" style={{ color: 'rgba(226, 232, 240, 0.58)' }}>
                      System event 会使用这个 wake mode。Agent turn 默认走独立会话执行。
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-[24px] border p-5" style={{ borderColor: 'rgba(255, 255, 255, 0.08)', backgroundColor: 'rgba(255, 255, 255, 0.03)' }}>
                <div className="text-sm font-semibold" style={{ color: '#F8FAFC' }}>Schedule</div>
                <div className="mt-4 grid grid-cols-[160px_minmax(0,1fr)] gap-x-4 gap-y-4">
                  <div className="pt-3 text-sm" style={{ color: 'rgba(226, 232, 240, 0.72)' }}>Kind</div>
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
                            className="rounded-xl px-4 py-2 text-sm font-medium"
                            style={{
                              backgroundColor: isActive ? '#0A84FF' : 'rgba(255, 255, 255, 0.08)',
                              color: '#F8FAFC',
                            }}
                          >
                            {value}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-2 text-xs leading-6" style={{ color: 'rgba(226, 232, 240, 0.58)' }}>
                      “At” 单次执行，“Every” 按间隔循环，“Cron” 使用 5 段表达式。
                    </div>
                  </div>

                  <div className="pt-3 text-sm" style={{ color: 'rgba(226, 232, 240, 0.72)' }}>
                    {draft.schedule.kind === 'at' ? 'At' : draft.schedule.kind === 'every' ? 'Every' : 'Cron'}
                  </div>
                  <input
                    value={draft.schedule.kind === 'at'
                      ? draft.schedule.at
                      : draft.schedule.kind === 'every'
                        ? draft.schedule.every
                        : draft.schedule.cron}
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
                    placeholder={draft.schedule.kind === 'at' ? '2026-03-11T07:00:00' : draft.schedule.kind === 'every' ? '1h' : '0 7 * * *'}
                    className={inputClassName}
                    style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', borderColor: 'rgba(255, 255, 255, 0.10)', color: '#F8FAFC' }}
                  />
                </div>
              </section>

              <section className="rounded-[24px] border p-5" style={{ borderColor: 'rgba(255, 255, 255, 0.08)', backgroundColor: 'rgba(255, 255, 255, 0.03)' }}>
                <div className="text-sm font-semibold" style={{ color: '#F8FAFC' }}>Payload</div>
                <div className="mt-2 text-sm leading-6" style={{ color: 'rgba(226, 232, 240, 0.60)' }}>
                  不同 payload 会显示不同的表单字段。
                </div>

                <div className="mt-4 grid grid-cols-[160px_minmax(0,1fr)] gap-x-4 gap-y-4">
                  <div className="pt-3 text-sm" style={{ color: 'rgba(226, 232, 240, 0.72)' }}>Kind</div>
                  <div className="flex flex-wrap gap-2">
                    {cronPayloadKindOptions.map((item) => {
                      const value = item.value as 'systemEvent' | 'agentTurn';
                      const isActive = draft.payload.kind === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => switchPayloadKind(value)}
                          className="rounded-xl px-4 py-2 text-sm font-medium"
                          style={{
                            backgroundColor: isActive ? '#0A84FF' : 'rgba(255, 255, 255, 0.08)',
                            color: '#F8FAFC',
                          }}
                        >
                          {value}
                        </button>
                      );
                    })}
                  </div>

                  {draft.payload.kind === 'systemEvent' ? (
                    <>
                      <div className="pt-3 text-sm" style={{ color: 'rgba(226, 232, 240, 0.72)' }}>System event text</div>
                      <textarea
                        value={draft.payload.text}
                        onChange={(event) => updatePayload({ text: event.target.value })}
                        className={textareaClassName}
                        style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', borderColor: 'rgba(255, 255, 255, 0.10)', color: '#F8FAFC' }}
                      />
                    </>
                  ) : agentTurnPayload ? (
                    <>
                      <div className="pt-3 text-sm" style={{ color: 'rgba(226, 232, 240, 0.72)' }}>Message</div>
                      <textarea
                        value={agentTurnPayload.message}
                        onChange={(event) => updatePayload({ message: event.target.value })}
                        placeholder="What should OpenClaw do?"
                        className={textareaClassName}
                        style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', borderColor: 'rgba(255, 255, 255, 0.10)', color: '#F8FAFC' }}
                      />

                      <div className="pt-3 text-sm" style={{ color: 'rgba(226, 232, 240, 0.72)' }}>Thinking</div>
                      <select
                        value={agentTurnPayload.thinking || ''}
                        onChange={(event) => updatePayload({ thinking: event.target.value as any })}
                        className={inputClassName}
                        style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', borderColor: 'rgba(255, 255, 255, 0.10)', color: '#F8FAFC' }}
                      >
                        <option value="">Optional</option>
                        {cronThinkingOptions.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>

                      <div className="pt-3 text-sm" style={{ color: 'rgba(226, 232, 240, 0.72)' }}>Timeout</div>
                      <input
                        type="number"
                        value={agentTurnPayload.timeoutSeconds || ''}
                        onChange={(event) => updatePayload({ timeoutSeconds: Number(event.target.value || 0) || undefined })}
                        placeholder="Seconds (optional)"
                        className={inputClassName}
                        style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', borderColor: 'rgba(255, 255, 255, 0.10)', color: '#F8FAFC' }}
                      />

                      <div className="pt-3 text-sm" style={{ color: 'rgba(226, 232, 240, 0.72)' }}>Delivery</div>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { key: true, label: 'Announce summary' },
                          { key: false, label: 'None' },
                        ].map((item) => {
                          const isActive = agentTurnPayload.deliver === item.key;
                          return (
                            <button
                              key={item.label}
                              type="button"
                              onClick={() => updatePayload({ deliver: item.key, announce: item.key })}
                              className="rounded-xl px-4 py-2 text-sm font-medium"
                              style={{
                                backgroundColor: isActive ? '#0A84FF' : 'rgba(255, 255, 255, 0.08)',
                                color: '#F8FAFC',
                              }}
                            >
                              {item.label}
                            </button>
                          );
                        })}
                      </div>

                      <div className="pt-3 text-sm" style={{ color: 'rgba(226, 232, 240, 0.72)' }}>Channel</div>
                      <div className="flex flex-wrap gap-2">
                        {cronDeliveryChannelOptions.map((item) => {
                          const channel = item.value;
                          const isActive = (agentTurnPayload.channel || 'last') === channel;
                          return (
                            <button
                              key={channel}
                              type="button"
                              onClick={() => updatePayload({ channel })}
                              className="rounded-xl px-4 py-2 text-sm font-medium"
                              style={{
                                backgroundColor: isActive ? '#0A84FF' : 'rgba(255, 255, 255, 0.08)',
                                color: '#F8FAFC',
                              }}
                            >
                              {item.label}
                            </button>
                          );
                        })}
                      </div>

                      <div className="pt-3 text-sm" style={{ color: 'rgba(226, 232, 240, 0.72)' }}>To</div>
                      <input
                        value={agentTurnPayload.to || ''}
                        onChange={(event) => updatePayload({ to: event.target.value })}
                        placeholder="Optional override (phone number / chat id / Discord channel)"
                        className={inputClassName}
                        style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', borderColor: 'rgba(255, 255, 255, 0.10)', color: '#F8FAFC' }}
                      />
                    </>
                  ) : null
                  }
                </div>
              </section>
            </div>

            <div className="mt-6 flex items-center justify-between gap-3">
              <AppButton variant="secondary" onClick={closeCreateModal}>
                Cancel
              </AppButton>
              <AppButton
                variant="primary"
                onClick={() => void handleCreate()}
                disabled={saving || !draft.name.trim()}
                icon={saving ? <LoaderCircle size={14} className="animate-spin" /> : undefined}
              >
                Save
              </AppButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Tasks;