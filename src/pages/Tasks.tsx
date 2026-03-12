import React, { useEffect, useMemo, useState } from 'react';

// Task type should be defined locally since we removed the old type file
interface TaskChecklistItem {
  id: string;
  label: string;
  completed: boolean;
}

interface Task {
  id: string;
  name: string;
  status: 'running' | 'stopped' | 'completed' | 'failed' | 'pending';
  startedAt?: string;
  updatedAt?: string;
  command?: string;
  sessionKey?: string;
  agent?: string;
  model?: string;
  tokensUsed?: number;
  error?: string;
  checklist?: TaskChecklistItem[];
}

const CHECKLIST_PATTERN = /(?:^|\n)\s*(?:[-*]|\d+[.)])\s*(\[(?: |x|X)\]\s*)?(.+?)(?=$|\n)/g;

const buildFallbackChecklist = (task: Task) => {
  const entries = [
    task.name,
    task.command,
    task.error,
  ]
    .filter((value): value is string => Boolean(value && value.trim()))
    .flatMap((value) => value.split(/(?:\s*->\s*)|(?:\s*\|\s*)|(?:\s*，\s*)|(?:\s*;\s*)/g))
    .map((value) => value.trim())
    .filter((value) => value.length > 6)
    .slice(0, 3);

  if (entries.length === 0) {
    return [];
  }

  return entries.map((label, index) => ({
    id: `${task.id}-fallback-${index}`,
    label,
    completed: task.status === 'completed',
  }));
};

const parseChecklist = (task: Task) => {
  const source = [task.name, task.command, task.error]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join('\n');
  const matches = Array.from(source.matchAll(CHECKLIST_PATTERN));

  if (matches.length === 0) {
    return buildFallbackChecklist(task);
  }

  return matches.map((match, index) => ({
    id: `${task.id}-check-${index}`,
    label: match[2].trim(),
    completed: Boolean(match[1] && match[1].toLowerCase().includes('x')) || task.status === 'completed',
  }));
};

const withChecklist = (task: Task): Task => ({
  ...task,
  checklist: parseChecklist(task),
});

const Tasks: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'running' | 'stopped'>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 40;

  const loadTasks = async () => {
    setLoading(true);
    try {
      const tasksData = await window.electronAPI.tasksGet();
      setTasks(tasksData.map((task) => withChecklist(task)));
    } catch (error) {
      console.error('Failed to load tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
    const interval = setInterval(loadTasks, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setPage(1);
  }, [filter, search, tasks.length]);

  const handleKill = async (id: string) => {
    if (!confirm(`Are you sure you want to kill task ${id}?`)) return;
    try {
      await window.electronAPI.tasksKill(id);
      loadTasks(); // Refresh after kill
    } catch (error) {
      console.error('Failed to kill task:', error);
      alert(`Failed to kill task: ${error}`);
    }
  };

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

  const truncate = (value: string, max: number) => {
    if (value.length <= max) {
      return value;
    }
    return `${value.slice(0, max)}...`;
  };

  const filteredTasks = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return tasks.filter((task) => {
      const statusMatches = filter === 'all' ? true : task.status === filter;
      if (!statusMatches) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      const haystack = [
        task.id,
        sanitizeText(task.name),
        sanitizeText(task.command),
        sanitizeText(task.agent),
        sanitizeText(task.model),
        sanitizeText(task.error),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(keyword);
    });
  }, [filter, search, tasks]);

  const pagedTasks = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredTasks.slice(start, start + pageSize);
  }, [filteredTasks, page]);

  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / pageSize));

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'bg-green-600';
      case 'completed': return 'bg-tech-green';
      case 'failed': return 'bg-red-600';
      default: return 'bg-slate-600';
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleTimeString();
  };

  const checklistSummary = (task: Task) => {
    const total = task.checklist?.length || 0;
    const completed = task.checklist?.filter((item) => item.completed).length || 0;

    return {
      total,
      completed,
    };
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--app-text)' }}>Tasks</h1>
        <div className="flex gap-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索 ID、名称、命令、Agent..."
            className="px-3 py-1 rounded text-sm w-72"
            style={{ backgroundColor: 'var(--app-bg-elevated)', color: 'var(--app-text)', border: '1px solid var(--app-border)' }}
          />
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className="px-3 py-1 rounded text-sm"
              style={filter === 'all'
                ? {
                    backgroundColor: 'var(--app-segment-active-bg)',
                    color: 'var(--app-text)',
                    border: '1px solid var(--app-active-border)',
                  }
                : {
                    backgroundColor: 'var(--app-bg-subtle)',
                    color: 'var(--app-text-muted)',
                    border: '1px solid var(--app-border)',
                  }}
            >
              All ({tasks.length})
            </button>
            <button
              onClick={() => setFilter('running')}
              className="px-3 py-1 rounded text-sm"
              style={filter === 'running'
                ? {
                    backgroundColor: 'rgba(16, 185, 129, 0.16)',
                    color: '#10B981',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                  }
                : {
                    backgroundColor: 'var(--app-bg-subtle)',
                    color: 'var(--app-text-muted)',
                    border: '1px solid var(--app-border)',
                  }}
            >
              Running ({tasks.filter(t => t.status === 'running').length})
            </button>
            <button
              onClick={() => setFilter('stopped')}
              className="px-3 py-1 rounded text-sm"
              style={filter === 'stopped'
                ? {
                    backgroundColor: 'rgba(239, 68, 68, 0.16)',
                    color: '#EF4444',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                  }
                : {
                    backgroundColor: 'var(--app-bg-subtle)',
                    color: 'var(--app-text-muted)',
                    border: '1px solid var(--app-border)',
                  }}
            >
              Stopped ({tasks.filter(t => t.status !== 'running').length})
            </button>
          </div>
          
          <button
            onClick={loadTasks}
            disabled={loading}
            className="px-4 py-1 rounded text-sm"
            style={{ backgroundColor: 'var(--app-bg-subtle)', color: 'var(--app-text)', border: '1px solid var(--app-border)' }}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>
      
      <div className="rounded-lg border" style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)' }}>
        <table className="w-full table-fixed">
          <thead style={{ backgroundColor: 'var(--app-bg-subtle)' }}>
            <tr>
              <th className="px-4 py-3 text-left" style={{ color: 'var(--app-text)' }}>ID</th>
              <th className="px-4 py-3 text-left" style={{ color: 'var(--app-text)' }}>Name</th>
              <th className="px-4 py-3 text-left" style={{ color: 'var(--app-text)' }}>Status</th>
              <th className="px-4 py-3 text-left" style={{ color: 'var(--app-text)' }}>Agent</th>
              <th className="px-4 py-3 text-left" style={{ color: 'var(--app-text)' }}>Model</th>
              <th className="px-4 py-3 text-left" style={{ color: 'var(--app-text)' }}>Checklist</th>
              <th className="px-4 py-3 text-left" style={{ color: 'var(--app-text)' }}>Started</th>
              <th className="px-4 py-3 text-right" style={{ color: 'var(--app-text)' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredTasks.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center" style={{ color: 'var(--app-text-muted)' }}>
                  {tasks.length === 0 ? 'No tasks found' : `No ${filter} tasks`}
                </td>
              </tr>
            ) : (
              pagedTasks.map((task) => {
                const summary = checklistSummary(task);

                return (
                  <tr key={task.id} className="border-t align-top" style={{ borderColor: 'var(--app-border)' }}>
                    <td className="px-4 py-3 font-mono text-sm truncate max-w-[200px]" style={{ color: 'var(--app-text)' }}>
                      {task.id}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium break-words" style={{ color: 'var(--app-text)' }} title={sanitizeText(task.name)}>
                        {truncate(sanitizeText(task.name || '-'), 96)}
                      </div>
                      {task.command && (
                        <div className="text-xs mt-1 break-words" style={{ color: 'var(--app-text-muted)' }} title={sanitizeText(task.command)}>
                          {truncate(sanitizeText(task.command), 120)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs ${getStatusColor(task.status)}`} style={{ color: '#FFFFFF' }}>
                        {task.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--app-text)' }}>
                      <span title={sanitizeText(task.agent)}>{truncate(sanitizeText(task.agent || '-'), 28)}</span>
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--app-text-muted)' }}>
                      <span title={sanitizeText(task.model)}>{truncate(sanitizeText(task.model || '-'), 28)}</span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="mb-2" style={{ color: 'var(--app-text)' }}>
                        {summary.completed}/{summary.total || 0}
                      </div>
                      <div className="space-y-1">
                        {(task.checklist || []).length > 0 ? task.checklist?.slice(0, 4).map((item) => (
                          <div key={item.id} className="flex items-start gap-2 text-xs" style={{ color: item.completed ? '#10B981' : 'var(--app-text-muted)' }}>
                            <span>{item.completed ? '[x]' : '[ ]'}</span>
                            <span className="break-words">{truncate(item.label, 72)}</span>
                          </div>
                        )) : (
                          <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
                            暂无 checklist 子任务
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--app-text-muted)' }}>
                      {formatDate(task.startedAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {task.status === 'running' && (
                        <button
                          onClick={() => handleKill(task.id)}
                          className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm"
                          title="Kill task"
                        >
                          Kill
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm" style={{ color: 'var(--app-text-muted)' }}>
        <div>
          Total tasks: {tasks.length} • Filtered: {filteredTasks.length} • Page {page}/{totalPages}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1}
            className="px-3 py-1 rounded disabled:opacity-50"
            style={{ backgroundColor: 'var(--app-bg-subtle)', color: 'var(--app-text)', border: '1px solid var(--app-border)' }}
          >
            上一页
          </button>
          <button
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1 rounded disabled:opacity-50"
            style={{ backgroundColor: 'var(--app-bg-subtle)', color: 'var(--app-text)', border: '1px solid var(--app-border)' }}
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
};

export default Tasks;