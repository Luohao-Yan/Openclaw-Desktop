import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, 
  Users, 
  Clock, 
  Activity, 
  Terminal, 
  Search, 
  Plus, 
  Trash2, 
  Download,
  X,
  Eye,
  RefreshCw,
  Copy,
  AlertCircle
} from 'lucide-react';
import GlassCard from '../components/GlassCard';

interface Session {
  id: string;
  name: string;
  status: 'active' | 'idle' | 'inactive';
  agent: string;
  model: string;
  channel: string;
  channelId: string;
  createdAt: string;
  lastActivity: string;
  tokensUsed: number;
  messagesCount: number;
  participants: string[];
  metadata?: Record<string, any>;
}

interface SessionDetail {
  id: string;
  name: string;
  status: 'active' | 'idle' | 'inactive';
  agent: string;
  model: string;
  channel: string;
  channelId: string;
  createdAt: string;
  lastActivity: string;
  tokensUsed: number;
  messagesCount: number;
  participants: string[];
  messages?: {
    id: string;
    content: string;
    role: 'user' | 'assistant' | 'system';
    timestamp: string;
    tokens: number;
  }[];
  settings?: {
    temperature: number;
    maxTokens: number;
    contextWindow: number;
    stream: boolean;
  };
  resources?: {
    files: string[];
    tools: string[];
    skills: string[];
  };
}

const Sessions: React.FC = () => {
  // const { t } = useI18n(); // 暂时注释掉，等待国际化支持
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<SessionDetail | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterAgent, setFilterAgent] = useState<string>('all');
  const [stats, setStats] = useState({ total: 0, active: 0, idle: 0, agents: {} as Record<string, number> });
  const [refreshInterval, setRefreshInterval] = useState<any>(null);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [newSessionAgent, setNewSessionAgent] = useState('');
  const [newSessionModel, setNewSessionModel] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [newMessage, setNewMessage] = useState('');

  // 加载会话列表
  const loadSessions = async () => {
    try {
      setLoading(true);
      setError(null);
      const sessionsList = await window.electronAPI.sessionsList();
      setSessions(sessionsList);
      
      // 加载统计数据
      const sessionsStats = await window.electronAPI.sessionsStats();
      setStats(sessionsStats);
    } catch (err) {
      console.error('Failed to load sessions:', err);
      setError('加载会话失败，请检查 OpenClaw 服务是否正常运行。');
    } finally {
      setLoading(false);
    }
  };

  // 加载会话详情
  const loadSessionDetail = async (sessionId: string) => {
    try {
      const detail = await window.electronAPI.sessionsGet(sessionId);
      setSelectedSession(detail);
    } catch (error) {
      console.error('Failed to load session detail:', error);
    }
  };

  // 创建新会话
  const handleCreateSession = async () => {
    if (!newSessionAgent.trim()) return;
    
    try {
      setIsCreatingSession(true);
      const result = await window.electronAPI.sessionsCreate(newSessionAgent, newSessionModel || undefined);
      
      if (result.success && result.sessionId) {
        // 重新加载会话列表
        await loadSessions();
        // 加载新会话的详情
        await loadSessionDetail(result.sessionId);
        setShowDetail(true);
        // 重置表单
        setNewSessionAgent('');
        setNewSessionModel('');
      }
    } catch (error) {
      console.error('Failed to create session:', error);
    } finally {
      setIsCreatingSession(false);
    }
  };

  // 发送消息
  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedSession) return;
    
    try {
      setIsSendingMessage(true);
      const result = await window.electronAPI.sessionsSend(selectedSession.id, newMessage);
      
      if (result.success && result.response) {
        // 重新加载会话详情以获取更新的消息
        await loadSessionDetail(selectedSession.id);
        setNewMessage('');
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsSendingMessage(false);
    }
  };

  // 关闭会话
  const handleCloseSession = async (sessionId: string) => {
    try {
      await window.electronAPI.sessionsClose(sessionId);
      // 重新加载会话列表
      await loadSessions();
      if (selectedSession?.id === sessionId) {
        setSelectedSession(null);
        setShowDetail(false);
      }
    } catch (error) {
      console.error('Failed to close session:', error);
    }
  };

  // 导出会话
  const handleExportSession = async (sessionId: string, format: 'json' | 'markdown') => {
    try {
      const result = await window.electronAPI.sessionsExport(sessionId, format);
      
      if (result.success && result.data) {
        // 创建下载链接
        const blob = new Blob([result.data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `session-${sessionId}-${new Date().toISOString().split('T')[0]}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Failed to export session:', error);
    }
  };

  // 初始化加载和定时刷新
  useEffect(() => {
    loadSessions();
    
    // 设置定时刷新（每30秒）
    const interval = setInterval(loadSessions, 30000);
    setRefreshInterval(interval);
    
    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  }, []);

  // 获取所有唯一的 agent 名称，用于过滤下拉框
  const uniqueAgents = Array.from(new Set(sessions.map(s => s.agent).filter(Boolean)));

  // 过滤会话
  const filteredSessions = sessions.filter(session => {
    const matchesSearch = session.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         session.agent.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         session.model.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = filterStatus === 'all' || session.status === filterStatus;
    const matchesAgent = filterAgent === 'all' || session.agent === filterAgent;
    
    return matchesSearch && matchesStatus && matchesAgent;
  });

  // 格式化 token 数量，自动换算单位
  const formatTokens = (count: number): { value: string; unit: string } => {
    if (count >= 1_000_000) return { value: (count / 1_000_000).toFixed(1), unit: 'M' };
    if (count >= 1_000) return { value: (count / 1_000).toFixed(1), unit: 'K' };
    return { value: count.toString(), unit: 'tokens' };
  };

  // 状态颜色映射
  const statusColors = {
    active: 'bg-green-500/20 text-green-400 border-green-500/30',
    idle: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    inactive: 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  };

  // 角色颜色映射
  const roleColors = {
    user: 'bg-blue-500/20 text-blue-400',
    assistant: 'bg-green-500/20 text-green-400',
    system: 'bg-purple-500/20 text-purple-400'
  };

  if (loading && sessions.length === 0 && !error) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-tech-cyan mb-4"></div>
          <p style={{ color: 'var(--app-text-muted)' }}>加载会话中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full p-6">
      {/* 顶部渐变标题卡片 */}
      <GlassCard
        variant="gradient"
        className="relative rounded-[28px] px-6 py-5 mb-6"
        style={{
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(139, 92, 246, 0.08) 48%, rgba(255, 255, 255, 0.02) 100%)',
          backdropFilter: 'blur(18px)',
          border: 'none',
        }}
      >
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full blur-3xl" style={{ backgroundColor: 'rgba(99, 102, 241, 0.18)' }} />
        <div className="pointer-events-none absolute bottom-0 right-20 h-32 w-32 rounded-full blur-3xl" style={{ backgroundColor: 'rgba(139, 92, 246, 0.14)' }} />

        <div className="relative flex items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium"
              style={{ backgroundColor: 'rgba(255, 255, 255, 0.08)', color: 'var(--app-text)', border: '1px solid rgba(255, 255, 255, 0.08)' }}
            >
              <MessageSquare size={14} />
              对话会话
            </div>
            <h1 className="mt-2 text-3xl font-semibold leading-tight" style={{ color: 'var(--app-text)' }}>
              会话
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
              监控和管理 OpenClaw 的对话会话，查看消息记录与 token 用量。
            </p>
          </div>

          <div className="flex gap-2 shrink-0">
            <button
              onClick={loadSessions}
              className="inline-flex items-center px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer hover:scale-105 active:scale-95"
              style={{ 
                backgroundColor: 'var(--app-bg-elevated)', 
                color: 'var(--app-text)', 
                border: '1px solid var(--app-border)',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--app-hover)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.12)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--app-bg-elevated)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.08)';
              }}
            >
              <RefreshCw size={16} className={`mr-2 ${loading ? 'animate-spin' : ''}`} />
              {loading ? '加载中' : '刷新'}
            </button>
            <button
              onClick={() => setIsCreatingSession(true)}
              className="px-4 py-2 rounded-xl transition-all duration-200 cursor-pointer flex items-center gap-2 hover:scale-105 active:scale-95"
              style={{
                background: 'linear-gradient(135deg, #00B4FF 0%, #22C55E 100%)',
                color: 'white',
                boxShadow: '0 4px 12px rgba(0, 180, 255, 0.3)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(0, 180, 255, 0.4)';
                e.currentTarget.style.transform = 'scale(1.05) translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 180, 255, 0.3)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              <Plus size={18} />
              新建会话
            </button>
          </div>
        </div>
      </GlassCard>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="rounded-lg p-4 border" style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>Total Sessions</p>
              <p className="text-2xl font-bold" style={{ color: 'var(--app-text)' }}>{stats.total}</p>
            </div>
            <MessageSquare size={24} className="text-tech-cyan" />
          </div>
        </div>
        
        <div className="rounded-lg p-4 border" style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>Active</p>
              <p className="text-2xl font-bold" style={{ color: 'var(--app-text)' }}>{stats.active}</p>
            </div>
            <Activity size={24} className="text-green-500" />
          </div>
        </div>
        
        <div className="rounded-lg p-4 border" style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>Token 消耗</p>
              <div className="flex items-baseline gap-1.5">
                <p className="text-2xl font-bold" style={{ color: 'var(--app-text)' }}>
                  {formatTokens(sessions.reduce((sum, s) => sum + (s.tokensUsed || 0), 0)).value}
                </p>
                <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
                  {formatTokens(sessions.reduce((sum, s) => sum + (s.tokensUsed || 0), 0)).unit}
                </span>
              </div>
            </div>
            <Terminal size={24} className="text-orange-500" />
          </div>
        </div>
        
        <div className="rounded-lg p-4 border" style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>Unique Agents</p>
              <p className="text-2xl font-bold" style={{ color: 'var(--app-text)' }}>{Object.keys(stats.agents).length}</p>
            </div>
            <Users size={24} className="text-purple-500" />
          </div>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mb-4 p-4 rounded-xl border flex items-center gap-3" style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.22)', color: '#EF4444' }}>
          <AlertCircle size={18} className="shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* 搜索和过滤 */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2" size={18} style={{ color: 'var(--app-text-muted)' }} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search sessions by name, agent, or model..."
              className="w-full pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-tech-cyan"
              style={{ backgroundColor: 'var(--app-bg-elevated)', border: '1px solid var(--app-border)', color: 'var(--app-text)' }}
            />
          </div>
        </div>
        
        <div className="flex gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-tech-cyan"
            style={{ backgroundColor: 'var(--app-bg-elevated)', border: '1px solid var(--app-border)', color: 'var(--app-text)' }}
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="idle">Idle</option>
            <option value="inactive">Inactive</option>
          </select>
          
          <select
            value={filterAgent}
            onChange={(e) => setFilterAgent(e.target.value)}
            className="px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-tech-cyan"
            style={{ backgroundColor: 'var(--app-bg-elevated)', border: '1px solid var(--app-border)', color: 'var(--app-text)' }}
          >
            <option value="all">All Agents</option>
            {uniqueAgents.map(agent => (
              <option key={agent} value={agent}>{agent}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex flex-1 gap-6 min-h-0 overflow-hidden">
        {/* 会话列表 */}
        <div className={`${showDetail ? 'w-2/5' : 'w-full'} rounded-lg border h-full overflow-hidden flex flex-col`} style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)' }}>
          <div className="p-4 border-b" style={{ borderColor: 'var(--app-border)' }}>
            <h3 className="font-semibold" style={{ color: 'var(--app-text)' }}>Active Sessions ({filteredSessions.length})</h3>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {filteredSessions.length === 0 ? (
              <div className="p-8 text-center">
                <MessageSquare size={48} className="mx-auto mb-4" style={{ color: 'var(--app-text-muted)' }} />
                <p style={{ color: 'var(--app-text-muted)' }}>No sessions found</p>
                <p className="text-sm mt-2" style={{ color: 'var(--app-text-muted)' }}>Create a new session to get started</p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: 'var(--app-border)' }}>
                {filteredSessions.map(session => (
                  <div
                    key={session.id}
                    className={`p-4 cursor-pointer transition-all duration-200 hover:bg-opacity-50 ${selectedSession?.id === session.id ? 'bg-opacity-20' : ''}`}
                    style={{ 
                      backgroundColor: selectedSession?.id === session.id ? 'var(--app-active-bg)' : 'transparent',
                      borderColor: 'var(--app-border)',
                      color: 'var(--app-text)'
                    }}
                    onClick={() => {
                      loadSessionDetail(session.id);
                      setShowDetail(true);
                    }}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium truncate">{session.name}</h4>
                          <span className={`text-xs px-2 py-1 rounded-full border ${statusColors[session.status]}`}>
                            {session.status}
                          </span>
                        </div>
                        <p className="text-sm truncate" style={{ color: 'var(--app-text-muted)' }}>
                          {session.agent} • {session.model}
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCloseSession(session.id);
                          }}
                          className="p-1 rounded hover:bg-red-500/20 text-red-400"
                          title="Close session"
                        >
                          <X size={16} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowDetail(true);
                            loadSessionDetail(session.id);
                          }}
                          className="p-1 rounded hover:bg-tech-cyan/20 text-tech-cyan"
                          title="View details"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleExportSession(session.id, 'json');
                          }}
                          className="p-1 rounded hover:bg-green-500/20 text-green-400"
                          title="Export session"
                        >
                          <Download size={16} />
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 text-xs mt-3" style={{ color: 'var(--app-text-muted)' }}>
                      <div className="flex items-center gap-1">
                        <MessageSquare size={12} />
                        <span>{session.messagesCount} messages</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Terminal size={12} />
                        <span>{session.tokensUsed.toLocaleString()} tokens</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock size={12} />
                        <span>{new Date(session.lastActivity).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 会话详情 */}
        {showDetail && selectedSession && (
          <div className="w-3/5 rounded-lg border h-full overflow-hidden flex flex-col" style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)' }}>
            <div className="p-4 border-b flex justify-between items-center" style={{ borderColor: 'var(--app-border)' }}>
              <div>
                <h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--app-text)' }}>
                  {selectedSession.name}
                  <span className={`text-xs px-2 py-1 rounded-full border ${statusColors[selectedSession.status]}`}>
                    {selectedSession.status}
                  </span>
                </h3>
                <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
                  {selectedSession.agent} • {selectedSession.model}
                </p>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleExportSession(selectedSession.id, 'json')}
                  className="p-2 rounded-lg hover:scale-105 transition-all duration-200 cursor-pointer"
                  style={{ backgroundColor: 'var(--app-bg-subtle)', color: 'var(--app-text)', border: '1px solid var(--app-border)' }}
                  title="Export as JSON"
                >
                  <Download size={18} />
                </button>
                <button
                  onClick={() => handleExportSession(selectedSession.id, 'markdown')}
                  className="p-2 rounded-lg hover:scale-105 transition-all duration-200 cursor-pointer"
                  style={{ backgroundColor: 'var(--app-bg-subtle)', color: 'var(--app-text)', border: '1px solid var(--app-border)' }}
                  title="Export as Markdown"
                >
                  <Copy size={18} />
                </button>
                <button
                  onClick={() => handleCloseSession(selectedSession.id)}
                  className="p-2 rounded-lg hover:scale-105 transition-all duration-200 cursor-pointer"
                  style={{ backgroundColor: 'var(--app-bg-subtle)', color: 'var(--app-text)', border: '1px solid var(--app-border)' }}
                  title="Close session"
                >
                  <Trash2 size={18} />
                </button>
                <button
                  onClick={() => setShowDetail(false)}
                  className="p-2 rounded-lg hover:scale-105 transition-all duration-200 cursor-pointer"
                  style={{ backgroundColor: 'var(--app-bg-subtle)', color: 'var(--app-text)', border: '1px solid var(--app-border)' }}
                  title="Close detail view"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-hidden flex flex-col">
              {/* 消息列表 */}
              <div className="flex-1 overflow-y-auto p-4">
                {selectedSession.messages && selectedSession.messages.length > 0 ? (
                  <div className="space-y-4">
                    {selectedSession.messages.map((msg) => (
                      <div
                        key={msg.id}
                        className="rounded-lg p-4"
                        style={{ 
                          backgroundColor: msg.role === 'user' ? 'var(--app-user-msg-bg)' : 'var(--app-assistant-msg-bg)',
                          border: '1px solid var(--app-border)',
                          color: 'var(--app-text)'
                        }}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-1 rounded ${roleColors[msg.role]}`}>
                              {msg.role}
                            </span>
                            <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
                              {new Date(msg.timestamp).toLocaleString()}
                            </span>
                          </div>
                          <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
                            {msg.tokens} tokens
                          </span>
                        </div>
                        <pre className="whitespace-pre-wrap text-sm font-sans">{msg.content}</pre>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <div className="text-center">
                      <MessageSquare size={48} className="mx-auto mb-4" style={{ color: 'var(--app-text-muted)' }} />
                      <p style={{ color: 'var(--app-text-muted)' }}>No messages yet</p>
                      <p className="text-sm mt-2" style={{ color: 'var(--app-text-muted)' }}>Send a message to start the conversation</p>
                    </div>
                  </div>
                )}
              </div>
              
              {/* 消息输入框 */}
              <div className="p-4 border-t" style={{ borderColor: 'var(--app-border)' }}>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Type your message here..."
                    disabled={isSendingMessage}
                    className="flex-1 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-tech-cyan disabled:opacity-50"
                    style={{ backgroundColor: 'var(--app-bg-elevated)', border: '1px solid var(--app-border)', color: 'var(--app-text)' }}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={isSendingMessage || !newMessage.trim()}
                    className="px-4 py-2 bg-tech-cyan hover:bg-tech-green rounded-lg transition-colors disabled:opacity-50"
                  >
                    {isSendingMessage ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 创建新会话弹窗 */}
      {isCreatingSession && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="rounded-lg p-6 w-full max-w-md" style={{ backgroundColor: 'var(--app-bg-elevated)', border: '1px solid var(--app-border)' }}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--app-text)' }}>Create New Session</h3>
              <button
                onClick={() => setIsCreatingSession(false)}
                className="p-1 rounded hover:bg-red-500/20 text-red-400"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--app-text)' }}>
                  Agent Name *
                </label>
                <input
                  type="text"
                  value={newSessionAgent}
                  onChange={(e) => setNewSessionAgent(e.target.value)}
                  placeholder="Enter agent name (e.g., cto-development-director)"
                  className="w-full rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-tech-cyan"
                  style={{ backgroundColor: 'var(--app-bg-subtle)', border: '1px solid var(--app-border)', color: 'var(--app-text)' }}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--app-text)' }}>
                  Model (Optional)
                </label>
                <input
                  type="text"
                  value={newSessionModel}
                  onChange={(e) => setNewSessionModel(e.target.value)}
                  placeholder="Enter model name (e.g., glm-4-plus)"
                  className="w-full rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-tech-cyan"
                  style={{ backgroundColor: 'var(--app-bg-subtle)', border: '1px solid var(--app-border)', color: 'var(--app-text)' }}
                />
                <p className="text-xs mt-2" style={{ color: 'var(--app-text-muted)' }}>
                  Leave empty to use default model
                </p>
              </div>
            </div>
            
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setIsCreatingSession(false)}
                className="px-4 py-2 rounded-lg"
                style={{ backgroundColor: 'var(--app-bg-subtle)', color: 'var(--app-text)', border: '1px solid var(--app-border)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSession}
                disabled={!newSessionAgent.trim() || isCreatingSession}
                className="px-4 py-2 bg-tech-cyan hover:bg-tech-green rounded-lg transition-colors disabled:opacity-50"
              >
                {isCreatingSession ? 'Creating...' : 'Create Session'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sessions;