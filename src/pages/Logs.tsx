import React, { useEffect, useMemo, useRef, useState } from 'react';
// LogEntry 类型本地定义
interface LogEntry {
  id: string;
  raw: string;
  level: 'info' | 'error' | 'warn' | 'debug';
  timestamp: number;
}
import { CircleAlert, CircleAlert as CircleAlertIcon, CircleDot, Info, FileText, RefreshCw as RefreshCwIcon, Search as SearchIcon } from 'lucide-react';
import AppBadge from '../components/AppBadge';

// XSS 防护：转义 HTML 特殊字符
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const Logs: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [lines, setLines] = useState(100);
  const [search, setSearch] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const result = await window.electronAPI.logsGet(lines);
      if (result.success && Array.isArray(result.logs)) {
        setLogs(result.logs as LogEntry[]);
        setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    } catch (error) {
      console.error('Failed to load logs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
    
    let interval: number;
    if (autoRefresh) {
      interval = setInterval(loadLogs, 5000) as unknown as number;
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, lines]);

  const filteredLogs = useMemo(() => logs.filter(log => 
    !search || log.raw.toLowerCase().includes(search.toLowerCase())
  ), [logs, search]);

  /** 日志级别 → AppBadge variant 映射 */
  const levelVariant: Record<string, 'danger' | 'warning' | 'info' | 'neutral'> = {
    error: 'danger',
    warn:  'warning',
    info:  'info',
    debug: 'neutral',
  };

  const levelIcons: Record<string, React.ReactNode> = {
    error: <CircleAlert className="w-4 h-4 text-red-500" />,
    warn: <CircleAlertIcon className="w-4 h-4 text-yellow-500" />,
    info: <Info className="w-4 h-4 text-blue-500" />,
    debug: <CircleDot className="w-4 h-4 text-gray-400" />
  };

  const getTimeString = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--app-bg)', color: 'var(--app-text)' }}>
      {/* ── 顶部渐变标题卡片（橙色/琥珀色调）：使用 page-content 统一水平内边距 ── */}
      <div style={{ padding: 'var(--space-6) var(--space-6) 0' }} className="shrink-0">
        <div
          className="relative rounded-[24px] px-6 py-5 overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(251, 146, 60, 0.14) 0%, rgba(245, 158, 11, 0.10) 50%, rgba(255, 255, 255, 0.02) 100%)',
            backdropFilter: 'blur(18px)',
          }}
        >
          {/* 装饰光晕 */}
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full blur-3xl" style={{ backgroundColor: 'rgba(251, 146, 60, 0.18)' }} />
          <div className="pointer-events-none absolute bottom-0 right-20 h-32 w-32 rounded-full blur-3xl" style={{ backgroundColor: 'rgba(245, 158, 11, 0.14)' }} />

          <div className="relative flex items-start justify-between gap-4">
            <div>
              {/* badge 标签 */}
              <AppBadge
                variant="neutral"
                icon={<FileText size={13} />}
                style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.08)' }}
              >
                Gateway Logs
              </AppBadge>
              <h1 className="mt-2 text-3xl font-semibold leading-tight" style={{ color: 'var(--app-text)' }}>
                日志
              </h1>
              <p className="mt-2 text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
                查看 OpenClaw Gateway 运行日志，支持关键词过滤与自动刷新。
              </p>
              {/* 内联统计指标 badge 组 */}
              <div className="mt-3 flex flex-wrap gap-2.5">
                {[
                  { label: '显示条数', value: filteredLogs.length, color: '#fb923c' },
                  { label: '错误', value: filteredLogs.filter(l => l.level === 'error').length, color: '#f87171' },
                  { label: '警告', value: filteredLogs.filter(l => l.level === 'warn').length, color: '#fbbf24' },
                ].map((m) => (
                  <AppBadge
                    key={m.label}
                    variant="neutral"
                    style={{ backgroundColor: 'var(--app-bg-elevated)', backdropFilter: 'blur(10px)' }}
                  >
                    <span style={{ color: 'var(--app-text-muted)' }}>{m.label}</span>
                    <span className="font-semibold ml-1" style={{ color: m.color }}>{m.value}</span>
                  </AppBadge>
                ))}
              </div>
            </div>

            {/* 右侧控制区 */}
            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              {/* 行数选择 */}
              <div className="flex items-center gap-1.5">
                <label htmlFor="log-lines" className="text-xs" style={{ color: 'var(--app-text-muted)' }}>行数</label>
                <select
                  id="log-lines"
                  value={lines}
                  onChange={(e) => setLines(Number(e.target.value))}
                  className="px-2 py-1.5 rounded-lg text-xs focus:outline-none"
                  style={{ backgroundColor: 'var(--app-bg-elevated)', border: '1px solid var(--app-border)', color: 'var(--app-text)' }}
                >
                  <option value={100}>100</option>
                  <option value={300}>300</option>
                  <option value={500}>500</option>
                  <option value={1000}>1000</option>
                </select>
              </div>
              {/* 搜索框 */}
              <div className="relative">
                <SearchIcon size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--app-text-muted)' }} />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索日志..."
                  className="pl-7 pr-3 py-1.5 rounded-lg text-xs w-36 focus:outline-none"
                  style={{ backgroundColor: 'var(--app-bg-elevated)', border: '1px solid var(--app-border)', color: 'var(--app-text)' }}
                />
              </div>
              {/* 自动刷新 */}
              <label className="flex items-center gap-1.5 cursor-pointer text-xs" style={{ color: 'var(--app-text-muted)' }}>
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="rounded"
                />
                自动刷新
              </label>
              {/* 刷新按钮 */}
              <button
                onClick={loadLogs}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all hover:opacity-80 disabled:opacity-50"
                style={{ backgroundColor: 'var(--app-bg-elevated)', border: '1px solid var(--app-border)', color: 'var(--app-text-muted)' }}
              >
                <RefreshCwIcon size={13} className={loading ? 'animate-spin' : ''} />
                {loading ? '加载中' : '刷新'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── 日志内容区：使用 --space-6 统一水平内边距，--space-4 统一标题与内容间距 ── */}
      <div className="flex-1 overflow-hidden flex flex-col gap-2 min-h-0" style={{ padding: 'var(--space-4) var(--space-6) var(--space-6)' }}>
        <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
          共 {logs.length} 条{search && `，已过滤显示 ${filteredLogs.length} 条（关键词：「${search}」）`}
        </div>

        <div className="flex-1 rounded-2xl overflow-hidden border min-h-0" style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)' }}>
          {filteredLogs.length === 0 ? (
            <div className="p-8 text-center" style={{ color: 'var(--app-text-muted)' }}>
              {search ? `没有包含「${search}」的日志` : '暂无日志'}
            </div>
          ) : (
            <div className="h-full overflow-y-auto">
              {filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className="grid grid-cols-[88px_72px_1fr] gap-3 px-4 py-3 border-b"
                  style={{ borderColor: 'var(--app-border)' }}
                >
                  <div className="text-xs pt-1" style={{ color: 'var(--app-text-muted)' }}>
                    {getTimeString(log.timestamp)}
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="mt-1" title={log.level}>{levelIcons[log.level] || <Info className="w-4 h-4 text-blue-500" />}</span>
                    {/* 日志级别 badge */}
                    <AppBadge
                      variant={levelVariant[log.level] ?? 'neutral'}
                      size="sm"
                      className="uppercase tracking-wide"
                    >
                      {log.level}
                    </AppBadge>
                  </div>
                  <pre
                    className="font-mono text-sm whitespace-pre-wrap break-words leading-6 m-0"
                    style={{ color: 'var(--app-text)' }}
                    dangerouslySetInnerHTML={{ __html: escapeHtml(log.raw) }}
                  />
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>

        <div className="text-xs shrink-0" style={{ color: 'var(--app-text-muted)' }}>
          来源：~/.openclaw/logs/gateway.log
        </div>
      </div>
    </div>
  );
};

export default Logs;