/**
 * Sessions 页面主组件
 * 紧凑布局：顶部工具栏（标题+内联统计+搜索+操作）+ 下方全高对话区
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  MessageSquare,
  Plus,
  X,
  RefreshCw,
  AlertCircle,
  Search,
  Wrench,
  Activity,
  Users,
  Database,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import GlobalLoading from '../../components/GlobalLoading';
import AppButton from '../../components/AppButton';
import AppIconButton from '../../components/AppIconButton';
import type { Session, SessionStats, TranscriptMessage } from './types';
import SessionList from './SessionList';
import SessionChatPanel from './SessionChatPanel';
import CreateSessionModal from './CreateSessionModal';
import { retryRefreshTranscript, pollForReply } from './sessionRetryLogic';

const Sessions: React.FC = () => {
  const { t } = useI18n();

  // ── 核心数据状态 ──
  const [sessions, setSessions] = useState<Session[]>([]);
  const [stats, setStats] = useState<SessionStats>({ total: 0, active: 0, idle: 0, agents: {}, stores: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── 详情面板状态 ──
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [transcriptLoading, setTranscriptLoading] = useState(false);

  // ── 搜索 & 过滤 ──
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAgent, setFilterAgent] = useState<string>('all');

  // ── 新建会话弹窗 ──
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSessionAgent, setNewSessionAgent] = useState('');
  const [newSessionModel, setNewSessionModel] = useState('');
  const [creating, setCreating] = useState(false);

  // ── 发送消息 ──
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);

  // ── 异步发送 pending 状态管理 ──
  // 跟踪多个 session 的并发 pending 状态（消息已发送但 agent 尚未回复）
  const [pendingSessions, setPendingSessions] = useState<Map<string, {
    message: string;          // 原始消息（用于重试）
    startedAt: number;        // 开始时间
    baselineAssistantCount: number; // 发送前 assistant 消息数
  }>>(new Map());

  // ── 发送错误/超时状态 ──
  const [sendError, setSendError] = useState<{ sessionId: string; message: string; type: 'error' | 'timeout' } | null>(null);

  // ── 清理 ──
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);

  // ── 所有 agent 列表（用于筛选下拉和新建会话） ──
  const [allAgents, setAllAgents] = useState<{ id: string; name: string }[]>([]);
  // ── 可用模型列表（用于新建会话时选择模型） ──
  const [availableModels, setAvailableModels] = useState<{ label: string; value: string }[]>([]);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── 数据加载 ──

  /** 加载会话列表和统计数据 */
  const loadSessions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [listResult, statsResult] = await Promise.allSettled([
        window.electronAPI.sessionsList(),
        window.electronAPI.sessionsStats(),
      ]);
      let hasError = false;
      let errorMsg = '';

      if (listResult.status === 'fulfilled') {
        const raw: any = listResult.value;
        if (raw?.success === false) { hasError = true; errorMsg = raw.error || ''; setSessions([]); }
        else {
          const list: Session[] = Array.isArray(raw) ? raw : Array.isArray(raw?.sessions) ? raw.sessions : [];
          setSessions(list);
        }
      } else { hasError = true; errorMsg = String(listResult.reason); setSessions([]); }

      if (statsResult.status === 'fulfilled') {
        const raw: any = statsResult.value;
        if (raw?.success === false) { hasError = true; if (!errorMsg) errorMsg = raw.error || ''; }
        else { setStats({ total: raw?.total ?? 0, active: raw?.active ?? 0, idle: raw?.idle ?? 0, agents: raw?.agents ?? {}, stores: raw?.stores ?? [] }); }
      } else { hasError = true; if (!errorMsg) errorMsg = String(statsResult.reason); }

      if (hasError) setError(errorMsg || t('sessions.loadFailed'));

      // 并行加载所有 agent 列表和可用模型（不阻塞主流程）
      try {
        const [agentsResult, modelsResult] = await Promise.allSettled([
          window.electronAPI.agentsGetAll(),
          window.electronAPI.modelsGetConfig(),
        ]);
        // 解析 agent 列表
        if (agentsResult.status === 'fulfilled') {
          const ar: any = agentsResult.value;
          if (ar?.success && Array.isArray(ar.agents)) {
            setAllAgents(ar.agents.map((a: any) => ({ id: a.id || a.name, name: a.name })));
          }
        }
        // 解析可用模型列表
        if (modelsResult.status === 'fulfilled') {
          const mr: any = modelsResult.value;
          if (mr?.success) {
            const modelSet = new Map<string, { label: string; value: string }>();
            // 从 providers 中提取
            if (mr.providers) {
              for (const [pid, prov] of Object.entries(mr.providers) as [string, any][]) {
                if (Array.isArray(prov.models)) {
                  for (const m of prov.models) {
                    const fullId = `${pid}/${m.id}`;
                    const alias = mr.configuredModels?.[fullId]?.alias;
                    modelSet.set(fullId, { label: alias ? `${alias} (${fullId})` : m.name ? `${m.name} (${fullId})` : fullId, value: fullId });
                  }
                }
              }
            }
            // 补充 configuredModels 中的模型
            if (mr.configuredModels) {
              for (const [mid, cfg] of Object.entries(mr.configuredModels) as [string, any][]) {
                if (!modelSet.has(mid)) {
                  modelSet.set(mid, { label: cfg.alias ? `${cfg.alias} (${mid})` : mid, value: mid });
                }
              }
            }
            setAvailableModels(Array.from(modelSet.values()));
          }
        }
      } catch {
        // agent/model 加载失败不影响主流程
      }
    } catch {
      setError(t('sessions.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  /** 加载选中会话的 transcript（对话记录） */
  const loadTranscript = useCallback(async (session: Session) => {
    setTranscriptLoading(true);
    setTranscript([]);
    try {
      const result: any = await window.electronAPI.sessionsGet(session.id);
      if (result?.success && Array.isArray(result.transcript) && result.transcript.length > 0) {
        setTranscript(result.transcript);
      } else if (result?.success && (!result.transcript || result.transcript.length === 0)) {
        const fallback: any = await window.electronAPI.sessionsTranscript(session.agent, session.id);
        if (fallback?.success && Array.isArray(fallback.transcript) && fallback.transcript.length > 0) {
          setTranscript(fallback.transcript);
        }
      }
    } catch (err) {
      console.error('[Sessions] transcript 加载失败:', err);
    } finally {
      setTranscriptLoading(false);
    }
  }, []);

  /**
   * 静默刷新 transcript：不清空当前内容，加载完成后直接替换
   * 用于发送消息后刷新，避免 UI 闪烁
   * 只有读到非空 transcript 时才替换，防止空数组覆盖乐观消息
   */
  const refreshTranscript = useCallback(async (session: Session) => {
    try {
      const result: any = await window.electronAPI.sessionsGet(session.id);
      if (result?.success && Array.isArray(result.transcript) && result.transcript.length > 0) {
        setTranscript(result.transcript);
        return;
      }
      // 回退：直接用 transcript 接口，同样只在非空时替换
      const fallback: any = await window.electronAPI.sessionsTranscript(session.agent, session.id);
      if (fallback?.success && Array.isArray(fallback.transcript) && fallback.transcript.length > 0) {
        setTranscript(fallback.transcript);
      }
      // 若两个接口都返回空，保留当前 transcript（含乐观消息），不做任何覆盖
    } catch (err) {
      console.error('[Sessions] transcript 刷新失败:', err);
    }
  }, []);

  const handleSelectSession = useCallback((session: Session) => {
    setSelectedSession(session);
    void loadTranscript(session);
  }, [loadTranscript]);

  // ── 操作回调 ──

  const handleCreateSession = useCallback(async () => {
    if (!newSessionAgent.trim()) return;
    try {
      setCreating(true);
      const result = await window.electronAPI.sessionsCreate(newSessionAgent, newSessionModel || undefined);
      if (result?.success) {
        await loadSessions();
        setShowCreateModal(false);
        setNewSessionAgent('');
        setNewSessionModel('');
      }
    } catch (err) { console.error('[Sessions] 创建失败:', err); }
    finally { setCreating(false); }
  }, [newSessionAgent, newSessionModel, loadSessions]);

  const handleCloseSession = useCallback(async (sessionId: string) => {
    try {
      await window.electronAPI.sessionsClose(sessionId);
      await loadSessions();
      if (selectedSession?.id === sessionId) { setSelectedSession(null); setTranscript([]); }
    } catch (err) { console.error('[Sessions] 关闭失败:', err); }
  }, [loadSessions, selectedSession]);

  /**
   * 切换模型试用：为当前 agent 创建一个使用新模型的 session，不修改 openclaw 配置
   * 创建成功后自动选中新 session
   */
  const handleSwitchModel = useCallback(async (model: string) => {
    if (!selectedSession) return;
    const agent = selectedSession.agent;
    try {
      const result = await window.electronAPI.sessionsCreate(agent, model);
      if (result?.success) {
        await loadSessions();
        // 尝试找到新创建的 session 并自动选中
        const listResult: any = await window.electronAPI.sessionsList();
        if (listResult?.success || Array.isArray(listResult?.sessions)) {
          const list: Session[] = Array.isArray(listResult) ? listResult : listResult.sessions || [];
          // 查找匹配 agent + model 的最新 session
          const newSession = list.find((s) => s.agent === agent && s.model === model);
          if (newSession) {
            setSelectedSession(newSession);
            void loadTranscript(newSession);
          }
        }
      }
    } catch (err) {
      console.error('[Sessions] 切换模型失败:', err);
    }
  }, [selectedSession, loadSessions, loadTranscript]);

  const handleExportSession = useCallback(async (sessionId: string, format: 'json' | 'markdown') => {
    try {
      const result = await window.electronAPI.sessionsExport(sessionId, format);
      if (result?.success && result.data) {
        const blob = new Blob([result.data], { type: format === 'json' ? 'application/json' : 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `session-${sessionId.replace(/:/g, '-')}.${format === 'json' ? 'json' : 'md'}`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) { console.error('[Sessions] 导出失败:', err); }
  }, []);

  const handleSendMessage = useCallback(async () => {
    if (!newMessage.trim() || !selectedSession) return;
    // 若当前 session 正在 pending，禁止重复发送
    if (pendingSessions.has(selectedSession.id)) return;

    const msgText = newMessage;
    const session = selectedSession;
    try {
      setSending(true);
      setNewMessage('');
      setSendError(null);

      // 乐观更新：立即把用户消息追加到 transcript，让 UI 即时响应
      const optimisticMsg = { role: 'user', content: msgText, timestamp: new Date().toLocaleString() };
      setTranscript((prev) => [...prev, optimisticMsg]);

      // 计算发送前 assistant 消息数量（用于轮询检测新回复）
      const baselineAssistantCount = transcript.filter((m) => m.role === 'assistant').length;

      // 通过异步 IPC 发送消息（立即返回，不等待 agent 回复）
      const result = await window.electronAPI.sessionsSend(
        session.id,
        msgText,
        {
          sessionId: (session as any).sessionId,
          agentId: session.agent,
          deliveryContext: (session as any).deliveryContext,
        },
      );

      if (result?.success && result?.pending) {
        // 异步模式：将当前 session 加入 pendingSessions
        setPendingSessions((prev) => {
          const next = new Map(prev);
          next.set(session.id, {
            message: msgText,
            startedAt: Date.now(),
            baselineAssistantCount,
          });
          return next;
        });

        // 启动轮询检测 agent 回复
        void (async () => {
          const pollResult = await pollForReply(
            async () => {
              const getResult: any = await window.electronAPI.sessionsGet(session.id);
              if (getResult?.success && Array.isArray(getResult.transcript) && getResult.transcript.length > 0) {
                return getResult.transcript;
              }
              const fallback: any = await window.electronAPI.sessionsTranscript(session.agent, session.id);
              if (fallback?.success && Array.isArray(fallback.transcript) && fallback.transcript.length > 0) {
                return fallback.transcript;
              }
              return [];
            },
            baselineAssistantCount,
          );

          // 轮询完成，移除 pending 状态
          setPendingSessions((prev) => {
            const next = new Map(prev);
            next.delete(session.id);
            return next;
          });

          if (pollResult.success) {
            // 检测到新回复，更新 transcript
            setTranscript(pollResult.transcript);
          } else if (pollResult.timedOut) {
            // 超时提示
            setSendError({ sessionId: session.id, message: msgText, type: 'timeout' });
          } else if (pollResult.failedConsecutively) {
            // 连续读取失败
            setSendError({ sessionId: session.id, message: msgText, type: 'error' });
          }
        })();
      } else if (result?.success) {
        // 兼容旧的同步模式返回（含 transcript）
        if (Array.isArray(result.transcript) && result.transcript.length > 0) {
          setTranscript(result.transcript);
        } else {
          // 使用旧的重试逻辑
          void (async () => {
            const retryResult = await retryRefreshTranscript(async () => {
              const getResult: any = await window.electronAPI.sessionsGet(session.id);
              if (getResult?.success && Array.isArray(getResult.transcript) && getResult.transcript.length > 0) {
                return getResult.transcript;
              }
              return [];
            });
            if (retryResult.success) setTranscript(retryResult.transcript);
          })();
        }
      } else {
        // 发送失败：回滚乐观更新，显示错误
        setTranscript((prev) => prev.filter((m) => m !== optimisticMsg));
        setError(result?.error || t('sessions.sendFailed'));
      }
    } catch (err) {
      console.error('[Sessions] 发送失败:', err);
      setTranscript((prev) => prev.slice(0, -1));
      setError(String(err));
    } finally {
      setSending(false);
    }
  }, [newMessage, selectedSession, transcript, pendingSessions, t]);

  const handleCleanup = useCallback(async (dryRun: boolean) => {
    try {
      const result = await (window.electronAPI as any).sessionsCleanup(dryRun);
      if (result?.success) {
        setCleanupResult(result.output || JSON.stringify(result, null, 2));
        if (!dryRun) await loadSessions();
      } else {
        setCleanupResult(result?.error || '清理失败');
      }
    } catch (err) { console.error('[Sessions] 清理失败:', err); }
  }, [loadSessions]);

  /** 重试发送：使用 sendError 中保存的原始消息重新触发发送 */
  const handleRetrySend = useCallback(() => {
    if (!sendError) return;
    setNewMessage(sendError.message);
    setSendError(null);
    // 下一个 tick 触发发送（等 newMessage 状态更新后）
    setTimeout(() => {
      const sendBtn = document.querySelector('[data-send-btn]') as HTMLButtonElement;
      sendBtn?.click();
    }, 50);
  }, [sendError]);

  // ── 页面刷新后恢复 pending 状态 ──
  // 组件挂载时查询所有已知 session 的 sendStatus，恢复 processing 状态
  useEffect(() => {
    if (sessions.length === 0) return;
    void (async () => {
      for (const session of sessions) {
        try {
          const status = await window.electronAPI.sessionsSendStatus(session.id);
          if (status?.status === 'processing') {
            // 恢复 pending 状态
            const baselineAssistantCount = 0; // 刷新后无法精确恢复，使用 0 作为基线
            setPendingSessions((prev) => {
              const next = new Map(prev);
              next.set(session.id, {
                message: '',
                startedAt: status.startedAt || Date.now(),
                baselineAssistantCount,
              });
              return next;
            });
            // 重新启动轮询
            void (async () => {
              const pollResult = await pollForReply(
                async () => {
                  const getResult: any = await window.electronAPI.sessionsGet(session.id);
                  if (getResult?.success && Array.isArray(getResult.transcript) && getResult.transcript.length > 0) {
                    return getResult.transcript;
                  }
                  return [];
                },
                baselineAssistantCount,
              );
              setPendingSessions((prev) => {
                const next = new Map(prev);
                next.delete(session.id);
                return next;
              });
              if (pollResult.success && selectedSession?.id === session.id) {
                setTranscript(pollResult.transcript);
              }
            })();
          }
        } catch {
          // 查询失败忽略
        }
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions.length]);

  // ── 初始化 & 定时刷新 ──
  useEffect(() => {
    void loadSessions();
    intervalRef.current = setInterval(() => void loadSessions(), 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [loadSessions]);

  // ── 派生数据 ──
  // 合并 session 中的 agent 和全量 agent 列表，确保所有 agent 都出现在筛选下拉中
  const uniqueAgents = Array.from(new Set([
    ...sessions.map((s) => s.agent).filter(Boolean),
    ...allAgents.map((a) => a.id),
  ]));
  const filteredSessions = sessions.filter((s) => {
    const term = searchTerm.toLowerCase();
    const match = s.key.toLowerCase().includes(term) || s.agent.toLowerCase().includes(term) || s.model.toLowerCase().includes(term);
    return match && (filterAgent === 'all' || s.agent === filterAgent);
  });
  const agentCount = Object.keys(stats.agents).length;
  const storeCount = stats.stores?.length ?? 0;

  // ── 内联统计指标配置 ──
  const metrics = [
    { icon: MessageSquare, value: stats.total, label: t('sessions.totalSessions'), color: '#60a5fa' },
    { icon: Activity, value: stats.active, label: t('sessions.activeSessions'), color: '#34d399' },
    { icon: Users, value: agentCount, label: t('sessions.uniqueAgents'), color: '#a78bfa' },
    { icon: Database, value: storeCount, label: t('sessions.storeCount'), color: '#fbbf24' },
  ];

  // ── 加载态 ──
  if (loading && sessions.length === 0 && !error) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <GlobalLoading visible overlay={false} size="md" />
      </div>
    );
  }

  // ── 渲染 ──
  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden p-4 gap-3">

      {/* ═══ 第一行：渐变标题卡片（绿/蓝色调） ═══ */}
      <div
        className="relative rounded-[20px] px-5 py-4 shrink-0 overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(96, 165, 250, 0.14) 0%, rgba(52, 211, 153, 0.10) 50%, rgba(255, 255, 255, 0.02) 100%)',
          backdropFilter: 'blur(18px)',
        }}
      >
        {/* 装饰光晕 */}
        <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full blur-3xl" style={{ backgroundColor: 'rgba(96, 165, 250, 0.18)' }} />
        <div className="pointer-events-none absolute bottom-0 right-16 h-24 w-24 rounded-full blur-3xl" style={{ backgroundColor: 'rgba(52, 211, 153, 0.14)' }} />

        <div className="relative flex items-center gap-4">
          {/* 标题区 */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #60a5fa 0%, #818cf8 100%)' }}>
              <MessageSquare size={18} style={{ color: 'white' }} />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight" style={{ color: 'var(--app-text)' }}>
                {t('sessions.title')}
              </h1>
            </div>
          </div>

          {/* 分隔线 */}
          <div className="h-6 w-px shrink-0" style={{ backgroundColor: 'var(--app-border)' }} />

          {/* 内联统计指标 pill 组 */}
          <div className="flex items-center gap-2 shrink-0">
            {metrics.map((m) => {
              const Icon = m.icon;
              return (
                <div key={m.label}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs"
                  style={{ backgroundColor: `${m.color}12`, border: `1px solid ${m.color}20` }}
                  title={m.label}>
                  <Icon size={13} style={{ color: m.color }} />
                  <span className="font-semibold tabular-nums" style={{ color: m.color }}>{m.value}</span>
                  <span className="hidden xl:inline" style={{ color: 'var(--app-text-muted)' }}>{m.label}</span>
                </div>
              );
            })}
          </div>

          {/* 弹性间距 */}
          <div className="flex-1" />

          {/* 操作按钮组 */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* 清理按钮 */}
            <AppIconButton
              tint="default"
              onClick={() => void handleCleanup(true)}
              title={t('sessions.cleanup')}
            >
              <Wrench size={16} />
            </AppIconButton>
            {/* 刷新按钮 */}
            <AppIconButton
              tint="default"
              onClick={() => void loadSessions()}
              disabled={loading}
              title={loading ? t('sessions.loading') : t('sessions.refresh')}
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </AppIconButton>
            {/* 新建会话按钮 */}
            <AppButton
              variant="primary"
              size="sm"
              icon={<Plus size={14} />}
              onClick={() => setShowCreateModal(true)}
            >
              {t('sessions.createNew')}
            </AppButton>
          </div>
        </div>
      </div>

      {/* ═══ 第二行：搜索 + 过滤 + 错误/清理提示 ═══ */}
      <div className="flex items-center gap-3 shrink-0">
        {/* 搜索框 */}
        <div className="flex-1 relative max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2" size={15} style={{ color: 'var(--app-text-muted)' }} />
          <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t('sessions.searchPlaceholder')}
            className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-400/40"
            style={{ backgroundColor: 'var(--app-bg-elevated)', border: '1px solid var(--app-border)', color: 'var(--app-text)' }} />
        </div>
        {/* 智能体过滤 */}
        <select value={filterAgent} onChange={(e) => setFilterAgent(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-400/40"
          style={{ backgroundColor: 'var(--app-bg-elevated)', border: '1px solid var(--app-border)', color: 'var(--app-text)' }}>
          <option value="all">{t('sessions.allAgents')}</option>
          {uniqueAgents.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>

        {/* 错误提示（内联小条） */}
        {error && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs"
            style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
            <AlertCircle size={13} className="shrink-0" />
            <span className="truncate max-w-[200px]">{error}</span>
          </div>
        )}
      </div>

      {/* 清理结果（可折叠条） */}
      {cleanupResult && (
        <div className="shrink-0 p-3 rounded-xl border" style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)' }}>
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs font-medium" style={{ color: 'var(--app-text)' }}>{t('sessions.cleanupResult')}</span>
            {/* 关闭清理结果条（iconOnly ghost） */}
            <AppButton
              variant="ghost"
              size="xs"
              iconOnly
              icon={<X size={13} />}
              onClick={() => setCleanupResult(null)}
              style={{ color: '#ef4444' }}
            />
          </div>
          <pre className="text-[11px] whitespace-pre-wrap overflow-auto max-h-28 leading-relaxed" style={{ color: 'var(--app-text-muted)' }}>{cleanupResult}</pre>
        </div>
      )}

      {/* ═══ 主内容区：左侧会话列表 + 右侧对话面板 ═══ */}
      <div className="flex flex-1 gap-3 min-h-0 overflow-hidden">
        <SessionList
          sessions={filteredSessions}
          selectedSession={selectedSession}
          onSelect={handleSelectSession}
          pendingSessions={pendingSessions}
          t={t}
        />
        <SessionChatPanel
          session={selectedSession}
          transcript={transcript}
          transcriptLoading={transcriptLoading}
          newMessage={newMessage}
          onMessageChange={setNewMessage}
          onSend={() => void handleSendMessage()}
          sending={sending}
          isPending={selectedSession ? pendingSessions.has(selectedSession.id) : false}
          sendError={sendError && selectedSession && sendError.sessionId === selectedSession.id ? sendError : null}
          onRetry={handleRetrySend}
          onExport={(id, fmt) => void handleExportSession(id, fmt)}
          onClose={(id) => void handleCloseSession(id)}
          t={t}
          availableModels={availableModels}
          onSwitchModel={handleSwitchModel}
        />
      </div>

      {/* 新建会话弹窗 */}
      <CreateSessionModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        agentName={newSessionAgent}
        onAgentNameChange={setNewSessionAgent}
        modelName={newSessionModel}
        onModelNameChange={setNewSessionModel}
        onCreate={() => void handleCreateSession()}
        creating={creating}
        t={t}
        agents={allAgents}
        models={availableModels}
      />
    </div>
  );
};

export default Sessions;
