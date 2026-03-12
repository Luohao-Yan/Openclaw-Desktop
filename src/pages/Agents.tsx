import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AgentInfo } from '../../types/electron';
import { 
  Users, Folder, Cpu, Hash,
  RefreshCw, Copy, AlertCircle, CheckCircle,
  User, FileText, Settings, ArrowRight,
  Plus,
  Zap
} from 'lucide-react';
import AppButton from '../components/AppButton';
import AppIconButton from '../components/AppIconButton';
import GlassCard from '../components/GlassCard';
import AgentEnhancer from '../components/AgentEnhancer';
import SegmentedTabs from '../components/SegmentedTabs';

const Agents: React.FC = () => {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<Record<string, boolean>>({});
  const [selectedAgent, setSelectedAgent] = useState<AgentInfo | null>(null);
  const [activeTab, setActiveTab] = useState<'list' | 'enhance'>('list');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    workspace: '',
    model: '',
  });
  const [createError, setCreateError] = useState<string | null>(null);
  const navigate = useNavigate();

  const loadAgents = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.agentsGetAll();
      if (result.success && result.agents) {
        setAgents(result.agents);
      } else {
        setError(result.error || 'Failed to load agents');
      }
    } catch (error) {
      console.error('Failed to load agents:', error);
      setError('Failed to connect to OpenClaw API');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    setCreateError(null);
    setCreateForm({
      name: '',
      workspace: '',
      model: '',
    });
    setCreateModalOpen(true);
  };

  const handleCreateAgent = async () => {
    const trimmedName = createForm.name.trim();
    const trimmedWorkspace = createForm.workspace.trim();
    const trimmedModel = createForm.model.trim();

    if (!trimmedName) {
      setCreateError('请输入智能体名称');
      return;
    }

    if (!trimmedWorkspace) {
      setCreateError('请输入 Workspace 路径');
      return;
    }

    setCreatingAgent(true);
    setCreateError(null);

    try {
      const result = await window.electronAPI.agentsCreate({
        name: trimmedName,
        workspace: trimmedWorkspace,
        model: trimmedModel || undefined,
      });

      if (!result.success) {
        setCreateError(result.error || '新增智能体失败');
        return;
      }

      setCreateModalOpen(false);
      await loadAgents();
    } catch (createErr) {
      setCreateError(`新增智能体时发生异常: ${createErr instanceof Error ? createErr.message : String(createErr)}`);
    } finally {
      setCreatingAgent(false);
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus({ ...copyStatus, [id]: true });
      setTimeout(() => {
        setCopyStatus({ ...copyStatus, [id]: false });
      }, 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const openAgentWorkspace = (agentId: string) => {
    navigate(`/agent-workspace/${agentId}`);
  };

  const copyAgentPath = async (agentId: string, pathType: 'workspace' | 'config') => {
    try {
      const agent = agents.find(a => a.id === agentId);
      if (!agent) {
        alert('Agent not found');
        return;
      }
      
      let pathToCopy = '';
      if (pathType === 'workspace') {
        pathToCopy = agent.workspace;
      } else if (pathType === 'config') {
        const result = await window.electronAPI.agentsGetAgentConfigPath(agentId);
        if (result.success && result.path) {
          pathToCopy = result.path;
        } else {
          alert(`Failed to get agent config path: ${result.error}`);
          return;
        }
      }
      
      await navigator.clipboard.writeText(pathToCopy);
      alert(`Agent ${pathType} path copied to clipboard:\n${pathToCopy}`);
    } catch (error) {
      console.error('Failed to copy agent path:', error);
      alert('Failed to copy agent path');
    }
  };

  useEffect(() => {
    loadAgents();
  }, []);

  const AgentCard = ({ agent }: { agent: AgentInfo }) => (
    <GlassCard className="p-6 hover:shadow-xl transition-all duration-300">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--app-bg-subtle)' }}>
            <User className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold" style={{ color: 'var(--app-text)' }}>{agent.name}</h3>
            <div className="flex items-center space-x-2 mt-1">
              <span className="text-xs font-mono px-2 py-1 rounded" style={{ backgroundColor: 'var(--app-bg-subtle)', color: 'var(--app-text-muted)' }}>
                <Hash className="w-3 h-3 inline mr-1" />
                {agent.id}
              </span>
              {agent.agentDir && (
                <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#10B981' }}>
                  Configured
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <AppIconButton
            onClick={() => {
              setSelectedAgent(agent);
              setActiveTab('enhance');
            }}
            tint="blue"
            title="增强智能体"
          >
            <Zap className="w-5 h-5" />
          </AppIconButton>
          <AppIconButton
            onClick={() => openAgentWorkspace(agent.id)}
            tint="purple"
            title="打开智能体工作区"
          >
            <Settings className="w-5 h-5" />
          </AppIconButton>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-start">
          <Folder className="w-4 h-4 mt-1 mr-2 flex-shrink-0" style={{ color: 'var(--app-text-muted)' }} />
          <div className="flex-1">
            <p className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>Workspace</p>
            <div className="flex items-center justify-between mt-1">
              <code className="text-xs font-mono truncate max-w-[70%]" style={{ color: 'var(--app-text-muted)' }}>
                {agent.workspace}
              </code>
              <button
                onClick={() => copyAgentPath(agent.id, 'workspace')}
                className="p-1 rounded transition-colors"
                style={{ color: 'var(--app-text-muted)' }}
                title="Copy workspace path"
              >
                <Copy className="w-3 h-3" style={{ color: 'var(--app-text-muted)' }} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-start">
          <Cpu className="w-4 h-4 mt-1 mr-2 flex-shrink-0" style={{ color: 'var(--app-text-muted)' }} />
          <div className="flex-1">
            <p className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>Model</p>
            <div className="flex items-center justify-between mt-1">
              <code className="text-xs font-mono truncate max-w-[70%]" style={{ color: 'var(--app-text-muted)' }}>
                {agent.model}
              </code>
              <button
                onClick={() => copyToClipboard(agent.model, `model-${agent.id}`)}
                className="p-1 rounded transition-colors"
                style={{ color: 'var(--app-text-muted)' }}
                title="Copy model name"
              >
                {copyStatus[`model-${agent.id}`] ? (
                  <CheckCircle className="w-3 h-3 text-green-500" />
                ) : (
                  <Copy className="w-3 h-3" style={{ color: 'var(--app-text-muted)' }} />
                )}
              </button>
            </div>
          </div>
        </div>

        {agent.agentDir && (
          <div className="flex items-start">
            <FileText className="w-4 h-4 mt-1 mr-2 flex-shrink-0" style={{ color: 'var(--app-text-muted)' }} />
            <div className="flex-1">
              <p className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>Config Path</p>
              <div className="flex items-center justify-between mt-1">
                <code className="text-xs font-mono truncate max-w-[70%]" style={{ color: 'var(--app-text-muted)' }}>
                  {agent.agentDir}
                </code>
                <button
                  onClick={() => copyAgentPath(agent.id, 'config')}
                  className="p-1 rounded transition-colors"
                  style={{ color: 'var(--app-text-muted)' }}
                  title="Copy config path"
                >
                  <Copy className="w-3 h-3" style={{ color: 'var(--app-text-muted)' }} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </GlassCard>
  );

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: 'var(--app-bg)', color: 'var(--app-text)' }}>
      <div className="max-w-7xl mx-auto">
        {/* 标签页切换 */}
        <div className="mb-8">
          {/* 顶部渐变标题卡片 */}
          <GlassCard
            variant="gradient"
            className="relative rounded-[28px] px-6 py-5 mb-6"
            style={{
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, rgba(99, 102, 241, 0.08) 48%, rgba(255, 255, 255, 0.02) 100%)',
              backdropFilter: 'blur(18px)',
              border: 'none',
            }}
          >
            <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full blur-3xl" style={{ backgroundColor: 'rgba(59, 130, 246, 0.18)' }} />
            <div className="pointer-events-none absolute bottom-0 right-20 h-32 w-32 rounded-full blur-3xl" style={{ backgroundColor: 'rgba(99, 102, 241, 0.14)' }} />

            <div className="relative flex items-start justify-between gap-4">
              <div className="max-w-2xl">
                <div
                  className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium"
                  style={{ backgroundColor: 'rgba(255, 255, 255, 0.08)', color: 'var(--app-text)', border: '1px solid rgba(255, 255, 255, 0.08)' }}
                >
                  {activeTab === 'list' ? <Users size={14} /> : <Zap size={14} />}
                  {activeTab === 'list' ? 'Multi-Agent System' : 'Agent Enhancement'}
                </div>
                <h1 className="mt-2 text-3xl font-semibold leading-tight" style={{ color: 'var(--app-text)' }}>
                  {activeTab === 'list' ? '智能体' : '智能体增强'}
                </h1>
                <p className="mt-2 max-w-xl text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
                  {activeTab === 'list'
                    ? '管理和查看所有 OpenClaw 智能体，配置工作区与模型。'
                    : selectedAgent
                      ? `正在增强 ${selectedAgent.name} 的能力与性能。`
                      : '增强智能体能力与运行性能。'}
                </p>
              </div>

              <div className="ml-auto flex items-center justify-end gap-3 shrink-0">
                {activeTab === 'enhance' && selectedAgent && (
                  <AppButton
                    onClick={() => setActiveTab('list')}
                    icon={<ArrowRight className="w-4 h-4 rotate-180" />}
                    variant="secondary"
                  >
                    Back to Agents
                  </AppButton>
                )}
                {activeTab === 'list' && (
                  <AppButton
                    onClick={handleOpenCreateModal}
                    icon={<Plus className="w-4 h-4" />}
                    variant="primary"
                  >
                    新增智能体
                  </AppButton>
                )}
                <AppButton
                  onClick={loadAgents}
                  disabled={loading}
                  icon={<RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />}
                  variant="secondary"
                >
                  {loading ? 'Loading...' : 'Refresh'}
                </AppButton>
              </div>
            </div>
          </GlassCard>

          {/* 标签页按钮 */}
          <SegmentedTabs
            className="mb-6"
            items={[
              {
                key: 'list',
                label: 'Agent List',
                icon: <Users className="w-4 h-4" />,
              },
              {
                key: 'enhance',
                label: 'Agent Enhancement',
                icon: <Zap className="w-4 h-4" />,
              },
            ]}
            onChange={(key) => {
              if (key === 'enhance' && agents.length > 0 && !selectedAgent) {
                setSelectedAgent(agents[0]);
              }
              setActiveTab(key);
            }}
            value={activeTab}
          />
        </div>

        {activeTab === 'list' ? (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <GlassCard className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--app-text-muted)' }}>Total Agents</p>
                    <p className="text-3xl font-bold mt-2" style={{ color: 'var(--app-text)' }}>{agents.length}</p>
                  </div>
                  <div className="p-3 bg-blue-500/10 rounded-lg">
                    <Users className="w-6 h-6 text-blue-500" />
                  </div>
                </div>
              </GlassCard>
              
              <GlassCard className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--app-text-muted)' }}>Configured Agents</p>
                    <p className="text-3xl font-bold mt-2" style={{ color: 'var(--app-text)' }}>
                      {agents.filter(a => a.agentDir).length}
                    </p>
                  </div>
                  <div className="p-3 bg-green-500/10 rounded-lg">
                    <Settings className="w-6 h-6 text-green-500" />
                  </div>
                </div>
              </GlassCard>
              
              <GlassCard className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--app-text-muted)' }}>Unique Models</p>
                    <p className="text-3xl font-bold mt-2" style={{ color: 'var(--app-text)' }}>
                      {new Set(agents.map(a => a.model)).size}
                    </p>
                  </div>
                  <div className="p-3 bg-tech-teal/10 rounded-lg">
                    <Cpu className="w-6 h-6 text-tech-teal" />
                  </div>
                </div>
              </GlassCard>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-6 p-4 border rounded-lg" style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.22)' }}>
                <div className="flex items-center">
                  <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
                  <span className="text-red-500">{error}</span>
                </div>
              </div>
            )}

            {/* Agents Grid */}
            {loading ? (
              <div className="flex justify-center items-center h-64">
                <RefreshCw className="w-8 h-8 animate-spin" style={{ color: 'var(--app-text-muted)' }} />
              </div>
            ) : agents.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {agents.map((agent) => (
                  <AgentCard key={agent.id} agent={agent} />
                ))}
              </div>
            ) : (
              <GlassCard className="p-12 text-center">
                <Users className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--app-text-muted)' }} />
                <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--app-text)' }}>No Agents Found</h3>
                <p className="mb-6" style={{ color: 'var(--app-text-muted)' }}>
                  No agents are configured in your OpenClaw installation.
                </p>
                <button
                  onClick={handleOpenCreateModal}
                  className="inline-flex items-center px-4 py-2 bg-tech-cyan hover:bg-tech-green text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  创建第一个智能体
                </button>
              </GlassCard>
            )}

            {/* Info Footer */}
            <div className="mt-8 text-center text-sm" style={{ color: 'var(--app-text-muted)' }}>
              <p>
                Agent data is loaded from <code className="font-mono px-2 py-1 rounded" style={{ backgroundColor: 'var(--app-bg-subtle)', color: 'var(--app-text)' }}>~/.openclaw/openclaw.json</code>
                . Configuration files are located at <code className="font-mono px-2 py-1 rounded" style={{ backgroundColor: 'var(--app-bg-subtle)', color: 'var(--app-text)' }}>~/.openclaw/agents/{"{agent-id}"}/agent/</code>.
              </p>
            </div>

            {createModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ backgroundColor: 'rgba(15, 23, 42, 0.55)' }}>
                <div className="w-full max-w-xl rounded-3xl border overflow-hidden" style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}>
                  <div className="px-6 py-5 border-b flex items-center justify-between gap-4" style={{ borderColor: 'var(--app-border)' }}>
                    <div>
                      <h3 className="text-2xl font-semibold">新增 OpenClaw 智能体</h3>
                      <div className="text-sm mt-2" style={{ color: 'var(--app-text-muted)' }}>
                        创建完成后会自动刷新当前 Agent 列表。
                      </div>
                    </div>
                    <AppButton
                      onClick={() => setCreateModalOpen(false)}
                      size="sm"
                      variant="secondary"
                    >
                      关闭
                    </AppButton>
                  </div>

                  <div className="px-6 py-5 space-y-4">
                    {createError && (
                      <div className="p-4 border rounded-lg" style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.22)' }}>
                        <div className="flex items-center gap-2 text-red-500">
                          <AlertCircle className="w-5 h-5" />
                          <span>{createError}</span>
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="text-sm mb-2" style={{ color: 'var(--app-text-muted)' }}>智能体名称</div>
                      <input
                        value={createForm.name}
                        onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
                        className="w-full rounded-xl px-4 py-3 outline-none"
                        style={{ backgroundColor: 'var(--app-bg)', border: '1px solid var(--app-border)', color: 'var(--app-text)' }}
                        placeholder="例如：data-analyst"
                      />
                    </div>

                    <div>
                      <div className="text-sm mb-2" style={{ color: 'var(--app-text-muted)' }}>Workspace 路径</div>
                      <input
                        value={createForm.workspace}
                        onChange={(event) => setCreateForm((current) => ({ ...current, workspace: event.target.value }))}
                        className="w-full rounded-xl px-4 py-3 outline-none"
                        style={{ backgroundColor: 'var(--app-bg)', border: '1px solid var(--app-border)', color: 'var(--app-text)' }}
                        placeholder="例如：~/.openclaw/workspace-data-analyst"
                      />
                    </div>

                    <div>
                      <div className="text-sm mb-2" style={{ color: 'var(--app-text-muted)' }}>模型（可选）</div>
                      <input
                        value={createForm.model}
                        onChange={(event) => setCreateForm((current) => ({ ...current, model: event.target.value }))}
                        className="w-full rounded-xl px-4 py-3 outline-none"
                        style={{ backgroundColor: 'var(--app-bg)', border: '1px solid var(--app-border)', color: 'var(--app-text)' }}
                        placeholder="例如：deepseek/deepseek-chat"
                      />
                    </div>
                  </div>

                  <div className="px-6 py-5 border-t flex items-center justify-end gap-3" style={{ borderColor: 'var(--app-border)' }}>
                    <AppButton
                      onClick={() => setCreateModalOpen(false)}
                      variant="secondary"
                    >
                      取消
                    </AppButton>
                    <AppButton
                      onClick={handleCreateAgent}
                      disabled={creatingAgent}
                      icon={<Plus className="w-4 h-4" />}
                      variant="primary"
                    >
                      {creatingAgent ? '创建中...' : '确认创建'}
                    </AppButton>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {selectedAgent ? (
              <AgentEnhancer 
                agentId={selectedAgent.id}
                agentName={selectedAgent.name}
                onEnhancementToggle={(id, enabled) => {
                  console.log(`Enhancement ${id} ${enabled ? 'enabled' : 'disabled'}`);
                }}
                onSettingsUpdate={(id, settings) => {
                  console.log(`Enhancement ${id} settings updated:`, settings);
                }}
                onPerformanceTest={() => {
                  console.log('Performance test started');
                }}
              />
            ) : (
              <GlassCard className="p-12 text-center">
                <Zap className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--app-text-muted)' }} />
                <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--app-text)' }}>Select an Agent</h3>
                <p className="mb-6" style={{ color: 'var(--app-text-muted)' }}>
                  Please select an agent from the list to enhance its capabilities.
                </p>
                <button
                  onClick={() => setActiveTab('list')}
                  className="inline-flex items-center px-4 py-2 bg-tech-cyan hover:bg-tech-green text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <ArrowRight className="w-4 h-4 mr-2 rotate-180" />
                  Back to Agent List
                </button>
              </GlassCard>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Agents;