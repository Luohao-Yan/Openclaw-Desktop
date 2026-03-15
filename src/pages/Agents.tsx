import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AgentInfo } from '../../types/electron';
import { 
  Users, Folder, Cpu, Hash,
  RefreshCw, Copy, AlertCircle, CheckCircle,
  User, FileText, Settings, ArrowRight,
  Plus,
  Zap,
  AlertTriangle,
} from 'lucide-react';
import AppButton from '../components/AppButton';
import AppIconButton from '../components/AppIconButton';
import GlassCard from '../components/GlassCard';
import AgentEnhancer from '../components/AgentEnhancer';
import SegmentedTabs from '../components/SegmentedTabs';
import { useI18n } from '../i18n/I18nContext';
import CreateAgentWizard from './settings/CreateAgentWizard';

const Agents: React.FC = () => {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<Record<string, boolean>>({});
  const [selectedAgent, setSelectedAgent] = useState<AgentInfo | null>(null);
  const [activeTab, setActiveTab] = useState<'list' | 'enhance'>('list');
  const [wizardOpen, setWizardOpen] = useState(false);
  // 创建后引导面板状态
  const [postGuideAgent, setPostGuideAgent] = useState<AgentInfo | null>(null);
  // 全局绑定和渠道配置，用于检测 Agent 是否缺少绑定/账号
  const [globalBindings, setGlobalBindings] = useState<any[]>([]);
  const [globalChannels, setGlobalChannels] = useState<Record<string, any>>({});
  // 可用模型列表，从 modelsGetConfig 获取，用于创建智能体时的模型下拉选择
  const [availableModels, setAvailableModels] = useState<{ label: string; value: string; description?: string }[]>([]);
  const { t } = useI18n();
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
      // 加载全局配置，获取 bindings 和 channels 用于绑定状态检测
      try {
        const configResult = await window.electronAPI.configGet();
        if (configResult.success && configResult.config) {
          setGlobalBindings(Array.isArray(configResult.config.bindings) ? configResult.config.bindings : []);
          setGlobalChannels(configResult.config.channels || {});
        }
      } catch {
        setGlobalBindings([]);
        setGlobalChannels({});
      }
    } catch (error) {
      console.error('Failed to load agents:', error);
      setError('Failed to connect to OpenClaw API');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    setWizardOpen(true);
    // 加载可用模型列表
    loadAvailableModels();
  };

  /** 从 modelsGetConfig 加载可用模型，构建下拉选项列表 */
  const loadAvailableModels = async () => {
    try {
      const result = await window.electronAPI.modelsGetConfig();
      if (!result.success) return;

      const modelSet = new Map<string, { label: string; value: string; description?: string }>();

      // 1. 从 providers 中提取所有 provider/model 格式的模型
      if (result.providers) {
        for (const [providerId, provider] of Object.entries(result.providers)) {
          if (Array.isArray(provider.models)) {
            for (const model of provider.models) {
              const fullId = `${providerId}/${model.id}`;
              // 检查是否有别名
              const aliasInfo = result.configuredModels?.[fullId];
              const label = aliasInfo?.alias
                ? `${aliasInfo.alias}  (${fullId})`
                : model.name ? `${model.name}  (${fullId})` : fullId;
              modelSet.set(fullId, { label, value: fullId, description: providerId });
            }
          }
        }
      }

      // 2. 从 configuredModels 中补充（可能有不在 providers 里的模型）
      if (result.configuredModels) {
        for (const [modelId, config] of Object.entries(result.configuredModels)) {
          if (!modelSet.has(modelId)) {
            const label = config.alias ? `${config.alias}  (${modelId})` : modelId;
            modelSet.set(modelId, { label, value: modelId });
          }
        }
      }

      // 3. 主模型和备用模型也加入（确保不遗漏）
      if (result.primary && !modelSet.has(result.primary)) {
        modelSet.set(result.primary, { label: `${result.primary}  (primary)`, value: result.primary });
      }
      if (Array.isArray(result.fallbacks)) {
        for (const fb of result.fallbacks) {
          if (!modelSet.has(fb)) {
            modelSet.set(fb, { label: fb, value: fb });
          }
        }
      }

      setAvailableModels(Array.from(modelSet.values()));
    } catch {
      // 加载失败不影响创建流程，用户仍可手动输入
      setAvailableModels([]);
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

  const AgentCard = ({ agent }: { agent: AgentInfo }) => {
    // 检查该 Agent 的绑定状态
    const agentBindings = globalBindings.filter((b: any) => b?.agentId === agent.id);
    const hasNoBinding = agentBindings.length === 0;
    // 检查是否有绑定但缺少账号配置
    const hasBindingWithoutAccount = !hasNoBinding && agentBindings.some((b: any) => {
      const channel = b?.match?.channel;
      const accountId = b?.match?.accountId;
      if (!channel || !accountId) return true;
      // 检查 channels 配置中是否存在该账号
      const channelConfig = globalChannels[channel];
      return !channelConfig?.accounts?.[accountId];
    });

    return (
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

      {/* 绑定状态警告：无绑定或绑定缺少账号 */}
      {(hasNoBinding || hasBindingWithoutAccount) && (
        <div
          className="flex items-center gap-2 rounded-xl px-3.5 py-2.5 mb-4 text-xs font-medium"
          style={{
            backgroundColor: 'rgba(245, 158, 11, 0.10)',
            border: '1px solid rgba(245, 158, 11, 0.22)',
            color: '#B45309',
          }}
        >
          <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: '#D97706' }} />
          <span>{hasNoBinding ? t('binding.noBindingWarning') : t('binding.noAccountWarning')}</span>
        </div>
      )}

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
  };

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

            {/* CreateAgentWizard 向导组件 */}
            <CreateAgentWizard
              open={wizardOpen}
              onClose={() => setWizardOpen(false)}
              agents={agents}
              availableModels={availableModels}
              onCreated={(agent) => {
                setPostGuideAgent(agent);
                loadAgents();
              }}
            />

            {/* 创建后引导面板 */}
            {postGuideAgent && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ backgroundColor: 'rgba(15, 23, 42, 0.55)' }}>
                <div
                  className="w-full max-w-lg rounded-3xl border overflow-hidden"
                  style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                >
                  {/* 标题 */}
                  <div className="px-6 py-5 border-b text-center" style={{ borderColor: 'var(--app-border)' }}>
                    <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)' }}>
                      <CheckCircle className="w-6 h-6 text-green-500" />
                    </div>
                    <h3 className="text-xl font-semibold">{t('agent.wizard.postGuideTitle')}</h3>
                    <p className="text-sm mt-1" style={{ color: 'var(--app-text-muted)' }}>{t('agent.wizard.postGuideSuccess')}</p>
                  </div>

                  {/* Agent 信息摘要 */}
                  <div className="px-6 py-4 space-y-2">
                    <div className="flex items-center justify-between py-1">
                      <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>名称</span>
                      <span className="text-sm font-mono" style={{ color: 'var(--app-text)' }}>{postGuideAgent.name}</span>
                    </div>
                    <div className="flex items-center justify-between py-1">
                      <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>ID</span>
                      <span className="text-sm font-mono" style={{ color: 'var(--app-text)' }}>{postGuideAgent.id}</span>
                    </div>
                    <div className="flex items-center justify-between py-1">
                      <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>Workspace</span>
                      <span className="text-xs font-mono truncate max-w-[60%]" style={{ color: 'var(--app-text)' }}>{postGuideAgent.workspace}</span>
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div className="px-6 py-5 border-t space-y-3" style={{ borderColor: 'var(--app-border)' }}>
                    <AppButton
                      onClick={() => {
                        setPostGuideAgent(null);
                        navigate('/settings/channels');
                      }}
                      variant="primary"
                      className="w-full"
                    >
                      {t('agent.wizard.postGuideBinding')}
                    </AppButton>
                    <AppButton
                      onClick={() => {
                        setPostGuideAgent(null);
                        openAgentWorkspace(postGuideAgent.id);
                      }}
                      variant="secondary"
                      className="w-full"
                    >
                      {t('agent.wizard.postGuideWorkspace')}
                    </AppButton>
                    <AppButton
                      onClick={() => {
                        setPostGuideAgent(null);
                        loadAgents();
                      }}
                      variant="secondary"
                      className="w-full"
                    >
                      {t('agent.wizard.postGuideBackToList')}
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