import React, { useEffect, useMemo, useRef, useState } from 'react';
// LogEntry type should be defined locally since we removed the old type file
interface LogEntry {
  id: string;
  raw: string;
  level: 'info' | 'error' | 'warn' | 'debug';
  timestamp: number;
}
import { CircleAlert, CircleAlert as CircleAlertIcon, CircleDot, Info } from 'lucide-react';

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
  }, [autoRefresh]);

  const filteredLogs = useMemo(() => logs.filter(log => 
    !search || log.raw.toLowerCase().includes(search.toLowerCase())
  ), [logs, search]);

  const levelColors: Record<string, { badge: string; text: string }> = {
    error: { badge: 'rgba(239, 68, 68, 0.12)', text: '#EF4444' },
    warn: { badge: 'rgba(245, 158, 11, 0.12)', text: '#F59E0B' },
    info: { badge: 'rgba(59, 130, 246, 0.12)', text: '#3B82F6' },
    debug: { badge: 'rgba(148, 163, 184, 0.14)', text: '#94A3B8' },
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
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--app-text)' }}>Logs</h1>
        <div className="flex gap-4 items-center">
          <div className="flex items-center gap-2">
            <label htmlFor="lines" className="text-sm" style={{ color: 'var(--app-text-muted)' }}>Rows:</label>
            <input
              id="lines"
              type="number"
              value={lines}
              onChange={(e) => setLines(Math.max(1, Math.min(1000, parseInt(e.target.value) || 100)))}
              className="w-20 px-2 py-1 rounded text-sm"
              style={{ backgroundColor: 'var(--app-bg-elevated)', border: '1px solid var(--app-border)', color: 'var(--app-text)' }}
              min="1"
              max="1000"
            />
          </div>
          
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search logs..."
            className="px-3 py-1 rounded text-sm w-48"
            style={{ backgroundColor: 'var(--app-bg-elevated)', border: '1px solid var(--app-border)', color: 'var(--app-text)' }}
          />
          
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="auto-refresh"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="auto-refresh" className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
              Auto-refresh (5s)
            </label>
          </div>
          
          <button
            onClick={loadLogs}
            disabled={loading}
            className="px-3 py-1 rounded text-sm"
            style={{ backgroundColor: 'var(--app-bg-subtle)', border: '1px solid var(--app-border)', color: 'var(--app-text)' }}
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="mb-4 text-sm" style={{ color: 'var(--app-text-muted)' }}>
        Showing {filteredLogs.length} of {logs.length} logs
        {search && ` • Filtered by: "${search}"`}
      </div>

      <div className="rounded-lg overflow-hidden border" style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)' }}>
        {filteredLogs.length === 0 ? (
          <div className="p-8 text-center" style={{ color: 'var(--app-text-muted)' }}>
            No logs found{search ? ' for search query' : ''}
          </div>
        ) : (
          <div className="max-h-[calc(100vh-250px)] overflow-y-auto">
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
                  <span
                    className="px-2 py-1 rounded text-[11px] uppercase tracking-wide"
                    style={{
                      backgroundColor: (levelColors[log.level] || levelColors.info).badge,
                      color: (levelColors[log.level] || levelColors.info).text,
                    }}
                  >
                    {log.level}
                  </span>
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

      <div className="mt-4 text-xs" style={{ color: 'var(--app-text-muted)' }}>
        Logs from: ~/.openclaw/logs/gateway.log
      </div>
    </div>
  );
};

export default Logs;