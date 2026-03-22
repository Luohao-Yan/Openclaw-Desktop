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
import type { Session, SessionStats, TranscriptMessage } from './types';
import SessionList from './SessionList';
import SessionChatPanel from './SessionChatPanel';
import CreateSessionModal from './CreateSessionModal';

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

  // ── 清理 ──
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);

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
    const msgText = newMessage;
    try {
      setSending(true);
      setTranscript((prev) => [...prev, { role: 'user', content: msgText }]);
      setNewMessage('');
      const result = await window.electronAPI.sessionsSend(selectedSession.id, msgText);
      if (result?.success && result.response) {
        setTranscript((prev) => [...prev, { role: 'assistant', content: result.response! }]);
      }
    } catch (err) { console.error('[Sessions] 发送失败:', err); }
    finally { setSending(false); }
  }, [newMessage, selectedSession]);

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

  // ── 初始化 & 定时刷新 ──
  useEffect(() => {
    void loadSessions();
    intervalRef.current = setInterval(() => void loadSessions(), 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [loadSessions]);

  // ── 派生数据 ──
  const uniqueAgents = Array.from(new Set(sessions.map((s) => s.agent).filter(Boolean)));
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
            <AppButton
              variant="secondary"
              size="xs"
              icon={<Wrench size={14} />}
              onClick={() => void handleCleanup(true)}
              title={t('sessions.cleanup')}
            >
              <span className="hidden lg:inline">{t('sessions.cleanup')}</span>
            </AppButton>
            {/* 刷新按钮：loading 时自动显示 spinner */}
            <AppButton
              variant="secondary"
              size="xs"
              icon={<RefreshCw size={14} />}
              loading={loading}
              onClick={() => void loadSessions()}
            >
              <span className="hidden lg:inline">
                {loading ? t('sessions.loading') : t('sessions.refresh')}
              </span>
            </AppButton>
            {/* 新建会话按钮 */}
            <AppButton
              variant="primary"
              size="xs"
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
          onExport={(id, fmt) => void handleExportSession(id, fmt)}
          onClose={(id) => void handleCloseSession(id)}
          t={t}
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
      />
    </div>
  );
};

export default Sessions;
