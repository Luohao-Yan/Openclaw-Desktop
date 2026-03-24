import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AgentInfo } from '../../types/electron';
import {
  Users, Cpu, Hash,
  RefreshCw, AlertCircle, CheckCircle,
  User, FileText, Settings, ArrowRight,
  Plus,
  Zap,
  AlertTriangle,
  Trash2,
  Download, Upload, History,
  MessageSquare, Clock, Coins, Globe,
  Link2,
} from 'lucide-react';
import { computeBindingCounts } from '../utils/skillBindingUtils';
import AppButton from '../components/AppButton';
import AppIconButton from '../components/AppIconButton';
import AppModal from '../components/AppModal';
import AppBadge from '../components/AppBadge';
import GlassCard from '../components/GlassCard';
import AgentEnhancer from '../components/AgentEnhancer';
import GlobalLoading from '../components/GlobalLoading';
import SegmentedTabs from '../components/SegmentedTabs';
import { useI18n } from '../i18n/I18nContext';
import CreateAgentWizard from './settings/CreateAgentWizard';
import ExportAgentDialog from './settings/ExportAgentDialog';
import ImportAgentDialog from './settings/ImportAgentDialog';
import ExportHistoryPanel from './settings/ExportHistoryPanel';


const Agents: React.FC = () => {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
  // 导出/导入对话框状态
  const [exportTarget, setExportTarget] = useState<AgentInfo | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // 顶部"更多操作"下拉菜单展开状态
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  // 删除确认对话框状态
  const [deleteTarget, setDeleteTarget] = useState<AgentInfo | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  // 操作结果提示（自动消失）
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  // 每个 Agent 的统计数据（会话数、消息数、Token 估算、平均响应时间）
  const [agentStats, setAgentStats] = useState<Record<string, {
    sessionCount: number;
    messageCount: number;
    tokenUsage: number;
    avgResponseMs: number;
  }>>({});
  // 每个 Agent 的专属技能绑定数量
  const [agentBindingCounts, setAgentBindingCounts] = useState<Record<string, number>>({});
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
      // 加载 agent 详细统计（会话数 + 消息数，从 session 文件中统计）
      try {
        const detailedResult = await window.electronAPI.sessionsAgentDetailedStats();
        if (detailedResult.success && detailedResult.stats) {
          setAgentStats(detailedResult.stats);
        }
      } catch {
        setAgentStats({});
      }
      // 加载每个 Agent 的专属技能绑定数量
      try {
        const bindingsResult = await window.electronAPI.skillsGetAllBindings();
        if (bindingsResult.success && bindingsResult.bindings) {
          setAgentBindingCounts(computeBindingCounts(bindingsResult.bindings));
        }
      } catch {
        setAgentBindingCounts({});
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

  /** 显示 toast 并在 3 秒后自动消失 */
  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  /** 执行删除智能体（通过 openclaw agents delete CLI） */
  const handleDeleteAgent = async () => {
    if (!deleteTarget) return;
    const agentName = deleteTarget.name;
    setDeleting(true);
    setDeleteError('');
    try {
      const result = await window.electronAPI.agentsDelete(deleteTarget.id);
      if (result.success) {
        setDeleteTarget(null);
        showToast('success', `智能体「${agentName}」已删除`);
        loadAgents();
      } else {
        // 将 CLI 错误信息转为更友好的中文提示
        const rawError = result.error || '删除失败';
        const friendlyError = rawError.includes('cannot be deleted')
          ? `「${deleteTarget.id}」是默认智能体，不可删除`
          : rawError;
        setDeleteError(friendlyError);
        showToast('error', `删除失败：${friendlyError}`);
      }
    } catch (err: any) {
      const msg = err.message || '删除失败';
      setDeleteError(msg);
      showToast('error', `删除失败：${msg}`);
    } finally {
      setDeleting(false);
    }
  };

  const openAgentWorkspace = (agentId: string) => {
    navigate(`/agent-workspace/${agentId}`);
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
      {/* 卡片头部：左侧信息 + 右侧操作按钮 */}
      <div className="flex items-start justify-between mb-4 gap-2">
        {/* 左侧：头像 + 名称 + ID 徽章，允许收缩以避免挤压 */}
        <div className="flex items-center space-x-3 min-w-0 flex-1">
          <div className="p-2 rounded-lg flex-shrink-0" style={{ backgroundColor: 'var(--app-bg-subtle)' }}>
            <User className="w-6 h-6 text-blue-400" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold truncate" style={{ color: 'var(--app-text)' }}>{agent.name}</h3>
            <div className="flex items-center space-x-2 mt-1 min-w-0">
              {/* Agent ID 标签：保留 mono 字体风格，用 neutral badge */}
              <AppBadge
                variant="neutral"
                size="sm"
                icon={<Hash className="w-3 h-3" />}
                className="font-mono truncate max-w-[160px]"
              >
                {agent.id}
              </AppBadge>
              {agent.agentDir && (
                /* 已配置状态 badge */
                <AppBadge variant="success" size="sm">已配置</AppBadge>
              )}
            </div>
          </div>
        </div>
        {/* 右侧操作按钮：固定不收缩 */}
        <div className="flex items-center space-x-2 flex-shrink-0">
          {/* 导出 Agent 配置按钮 */}
          <AppIconButton
            onClick={() => setExportTarget(agent)}
            tint="default"
            title="导出 Agent 配置"
          >
            <Download className="w-5 h-5" />
          </AppIconButton>
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
          <AppIconButton
            onClick={() => {
              setDeleteError('');
              setDeleteTarget(agent);
            }}
            tint="default"
            title="删除智能体"
            style={{ color: '#ef4444' }}
          >
            <Trash2 className="w-5 h-5" />
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

      {/* 模型信息 */}
      <div className="flex items-center gap-2 mb-3">
        <Cpu className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--app-text-muted)' }} />
        <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>模型</span>
        <code className="text-xs font-mono px-2 py-0.5 rounded truncate" style={{ backgroundColor: 'var(--app-bg-subtle)', color: 'var(--app-text)' }}>
          {agent.model || '-'}
        </code>
      </div>

      {/* 绑定平台 + DM 策略（紧凑单行，和模型行一致） */}
      <div className="flex items-center gap-2 mb-3 min-w-0">
        <Globe className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--app-text-muted)' }} />
        <span className="text-xs flex-shrink-0" style={{ color: 'var(--app-text-muted)' }}>平台</span>
        {agentBindings.length > 0 ? (
          <div className="flex flex-wrap gap-1 min-w-0">
            {agentBindings.map((b: any, i: number) => {
              const ch = b?.match?.channel || '未知';
              const hasDm = b?.match?.dm === true || b?.match?.dm === 'true';
              return (
                /* 渠道绑定 badge，带可选 DM 子标签 */
                <AppBadge key={i} variant="neutral" size="sm">
                  {ch}
                  {hasDm && (
                    <AppBadge variant="success" size="sm" className="ml-1">DM</AppBadge>
                  )}
                </AppBadge>
              );
            })}
          </div>
        ) : (
          <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>未绑定</span>
        )}
      </div>

      {/* 统计数据网格：会话数、消息数、Token 用量、平均响应时间 */}
      {(() => {
        const stats = agentStats[agent.id];
        const sessionCount = stats?.sessionCount ?? 0;
        const messageCount = stats?.messageCount ?? 0;
        const tokenUsage = stats?.tokenUsage ?? 0;
        const avgResponseMs = stats?.avgResponseMs ?? 0;
        // 格式化 Token 用量（超过 1M 显示 M，超过 1K 显示 K）
        const formatToken = (n: number) => {
          if (n <= 0) return '0';
          if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
          if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
          return String(n);
        };
        // 格式化平均响应时间（毫秒 → 秒）
        const formatResponseTime = (ms: number) => {
          if (ms <= 0) return '-';
          if (ms < 1000) return `${ms}ms`;
          return `${(ms / 1000).toFixed(1)}s`;
        };
        return (
          <div className="grid grid-cols-2 gap-2">
            {/* 会话数 */}
            <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--app-bg-subtle)' }}>
              <MessageSquare className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#3B82F6' }} />
              <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>会话</span>
              <span className="text-sm font-semibold ml-auto" style={{ color: 'var(--app-text)' }}>{sessionCount}</span>
            </div>
            {/* 消息数（从 session transcript 文件统计） */}
            <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--app-bg-subtle)' }}>
              <FileText className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#8B5CF6' }} />
              <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>消息</span>
              <span className="text-sm font-semibold ml-auto" style={{ color: 'var(--app-text)' }}>{messageCount}</span>
            </div>
            {/* Token 用量（从 usage 字段或内容长度估算） */}
            <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--app-bg-subtle)' }}>
              <Coins className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#F59E0B' }} />
              <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>Token</span>
              <span className="text-sm font-semibold ml-auto" style={{ color: 'var(--app-text)' }}>{formatToken(tokenUsage)}</span>
            </div>
            {/* 平均响应时间（user→assistant 时间差均值） */}
            <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--app-bg-subtle)' }}>
              <Clock className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#10B981' }} />
              <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>响应</span>
              <span className="text-sm font-semibold ml-auto" style={{ color: 'var(--app-text)' }}>{formatResponseTime(avgResponseMs)}</span>
            </div>
            {/* 专属技能数量，点击导航到 AgentWorkspace */}
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer hover:opacity-80 transition-opacity"
              style={{ backgroundColor: 'var(--app-bg-subtle)' }}
              onClick={() => openAgentWorkspace(agent.id)}
              title="查看专属技能"
            >
              <Link2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#EC4899' }} />
              <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>专属技能</span>
              <span className="text-sm font-semibold ml-auto" style={{ color: 'var(--app-text)' }}>{agentBindingCounts[agent.id] ?? 0}</span>
            </div>
          </div>
        );
      })()}
    </GlassCard>
  );
  };

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: 'var(--app-bg)', color: 'var(--app-text)' }}>
      {/* Toast 提示 */}
      {toast && (
        <div className="fixed top-5 right-5 z-[60] animate-in fade-in slide-in-from-top-2 duration-300">
          <div
            className="flex items-center gap-2.5 rounded-2xl border px-5 py-3 text-sm font-medium shadow-lg"
            style={{
              /* 使用主题感知的 toast CSS 自定义属性，支持浅色/暗色主题 */
              backgroundColor: toast.type === 'success' ? 'var(--app-toast-success-bg)' : 'var(--app-toast-error-bg)',
              borderColor: toast.type === 'success' ? 'var(--app-toast-success-border)' : 'var(--app-toast-error-border)',
              color: toast.type === 'success' ? 'var(--app-toast-success-text)' : 'var(--app-toast-error-text)',
              backdropFilter: 'blur(12px)',
            }}
          >
            {toast.type === 'success'
              ? <CheckCircle className="w-4 h-4 shrink-0" />
              : <AlertCircle className="w-4 h-4 shrink-0" />
            }
            {toast.message}
          </div>
        </div>
      )}
      <div className="max-w-7xl mx-auto">
        {/* 标签页切换 */}
        <div className="mb-8">
          {/* 顶部渐变标题卡片 */}
          <GlassCard
            variant="gradient"
            className="relative rounded-[28px] px-6 py-5 mb-6 overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, rgba(99, 102, 241, 0.08) 48%, rgba(255, 255, 255, 0.02) 100%)',
              backdropFilter: 'blur(18px)',
              border: 'none',
            }}
          >
            <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full blur-3xl" style={{ backgroundColor: 'rgba(59, 130, 246, 0.18)' }} />
            <div className="pointer-events-none absolute bottom-0 right-20 h-32 w-32 rounded-full blur-3xl" style={{ backgroundColor: 'rgba(99, 102, 241, 0.14)' }} />

            {/* 卡片内容：左右两列，与技能页面保持一致的布局模式 */}
            <div className="relative flex items-start justify-between gap-4">
              {/* 左侧：badge + 标题 + 描述 + 统计 pill */}
              <div>
                {/* 页面标题 badge */}
                <AppBadge
                  variant="neutral"
                  icon={activeTab === 'list' ? <Users size={13} /> : <Zap size={13} />}
                  style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}
                >
                  {activeTab === 'list' ? 'Multi-Agent System' : 'Agent Enhancement'}
                </AppBadge>
                <h1 className="mt-2 text-3xl font-semibold leading-tight" style={{ color: 'var(--app-text)' }}>
                  {activeTab === 'list' ? '智能体' : '智能体增强'}
                </h1>
                <p className="mt-2 text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
                  {activeTab === 'list'
                    ? '管理和查看所有 OpenClaw 智能体，配置工作区与模型。'
                    : selectedAgent
                      ? `正在增强 ${selectedAgent.name} 的能力与性能。`
                      : '增强智能体能力与运行性能。'}
                </p>
                {/* 内联统计指标 badge 组，flex-nowrap 确保一行内水平排列 */}
                {activeTab === 'list' && (
                  <div className="mt-3 flex flex-nowrap gap-2">
                    {[
                      { label: '智能体总数', value: agents.length, color: '#60a5fa', icon: Users },
                      { label: '已配置', value: agents.filter(a => a.agentDir).length, color: '#34d399', icon: Settings },
                      { label: '模型种类', value: new Set(agents.map(a => a.model)).size, color: '#a78bfa', icon: Cpu },
                    ].map((m) => {
                      const Icon = m.icon;
                      return (
                        /* 统计指标 badge：neutral 底色 + 动态 accent 数值色 */
                        <AppBadge
                          key={m.label}
                          variant="neutral"
                          icon={<Icon size={13} style={{ color: m.color }} />}
                          className="whitespace-nowrap"
                          style={{ backgroundColor: 'var(--app-bg-elevated)', backdropFilter: 'blur(10px)' }}
                        >
                          <span style={{ color: 'var(--app-text-muted)' }}>{m.label}</span>
                          <span className="font-semibold ml-1" style={{ color: m.color }}>{m.value}</span>
                        </AppBadge>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 右侧：操作按钮组，shrink-0 防止被左侧内容挤压 */}
              <div className="flex items-center gap-2 shrink-0">
                {activeTab === 'enhance' && selectedAgent && (
                  <button
                    onClick={() => setActiveTab('list')}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all hover:opacity-80"
                    style={{ backgroundColor: 'var(--app-bg-elevated)', border: '1px solid var(--app-border)', color: 'var(--app-text-muted)' }}
                  >
                    <ArrowRight className="w-4 h-4 rotate-180" />
                    返回列表
                  </button>
                )}
                {activeTab === 'list' && (
                  <>
                    {/* 更多操作下拉菜单：导入 + 导出历史 */}
                    <div className="relative">
                      <button
                        onClick={() => setMoreMenuOpen(v => !v)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all hover:opacity-80"
                        style={{ backgroundColor: 'var(--app-bg-elevated)', border: '1px solid var(--app-border)', color: 'var(--app-text-muted)' }}
                      >
                        <History className="w-4 h-4" />
                        更多
                      </button>
                      {moreMenuOpen && (
                        <>
                          {/* 点击遮罩关闭菜单 */}
                          <div className="fixed inset-0 z-10" onClick={() => setMoreMenuOpen(false)} />
                          <div
                            className="absolute right-0 top-full mt-1.5 z-20 min-w-[130px] rounded-xl overflow-hidden shadow-lg"
                            style={{ backgroundColor: 'var(--app-bg-elevated)', border: '1px solid var(--app-border)' }}
                          >
                            <button
                              onClick={() => { setImportOpen(true); setMoreMenuOpen(false); }}
                              className="flex items-center gap-2 w-full px-3 py-2.5 text-sm cursor-pointer transition-colors"
                              style={{ color: 'var(--app-text)' }}
                              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--app-bg-subtle)')}
                              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
                            >
                              <Upload className="w-4 h-4" style={{ color: 'var(--app-text-muted)' }} />
                              导入配置
                            </button>
                            <button
                              onClick={() => { setHistoryOpen(true); setMoreMenuOpen(false); }}
                              className="flex items-center gap-2 w-full px-3 py-2.5 text-sm cursor-pointer transition-colors"
                              style={{ color: 'var(--app-text)', borderTop: '1px solid var(--app-border)' }}
                              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--app-bg-subtle)')}
                              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
                            >
                              <History className="w-4 h-4" style={{ color: 'var(--app-text-muted)' }} />
                              导出历史
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                    {/* 刷新按钮（带文字标签，与技能页面风格一致，放在主操作按钮左侧） */}
                    <button
                      onClick={loadAgents}
                      disabled={loading}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all hover:opacity-80 disabled:opacity-50"
                      style={{ backgroundColor: 'var(--app-bg-elevated)', border: '1px solid var(--app-border)', color: 'var(--app-text-muted)' }}
                      title="刷新"
                    >
                      <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                      <span className="hidden sm:inline">刷新</span>
                    </button>
                    {/* 新增智能体主按钮（主操作放最右侧） */}
                    <button
                      onClick={handleOpenCreateModal}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:opacity-90"
                      style={{ background: 'linear-gradient(135deg, #3B82F6, #6366F1)', color: '#fff' }}
                    >
                      <Plus className="w-4 h-4" />
                      新增智能体
                    </button>
                  </>
                )}
                {/* enhance 模式下的刷新按钮 */}
                {activeTab === 'enhance' && (
                  <button
                    onClick={loadAgents}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all hover:opacity-80 disabled:opacity-50"
                    style={{ backgroundColor: 'var(--app-bg-elevated)', border: '1px solid var(--app-border)', color: 'var(--app-text-muted)' }}
                    title="刷新"
                  >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">刷新</span>
                  </button>
                )}
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
                <GlobalLoading visible text="加载智能体中" overlay={false} size="md" />
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

            {/* 删除确认对话框 */}
            <AppModal
              open={!!deleteTarget}
              onClose={() => setDeleteTarget(null)}
              title="删除智能体"
              variant="danger"
              icon={<Trash2 size={20} />}
              disableClose={deleting}
              footer={
                <>
                  <AppButton variant="secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                    取消
                  </AppButton>
                  <AppButton
                    variant="danger"
                    onClick={() => void handleDeleteAgent()}
                    disabled={deleting}
                    icon={deleting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  >
                    {deleting ? '删除中…' : '确认删除'}
                  </AppButton>
                </>
              }
            >
              {deleteTarget && (
                <div className="space-y-4">
                  {/* 警告说明 */}
                  <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
                    确定要删除{' '}
                    <span className="font-mono font-semibold" style={{ color: 'var(--app-text)' }}>
                      {deleteTarget.name}
                    </span>{' '}
                    吗？此操作将通过{' '}
                    <code className="px-1 py-0.5 rounded text-xs" style={{ backgroundColor: 'var(--app-bg-subtle)' }}>
                      openclaw agents delete
                    </code>{' '}
                    清理配置、workspace 和状态数据，不可撤销。
                  </p>

                  {/* Agent 信息摘要 */}
                  <div
                    className="rounded-xl border px-4 py-3 space-y-2"
                    style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>ID</span>
                      <span className="text-sm font-mono" style={{ color: 'var(--app-text)' }}>{deleteTarget.id}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>工作区</span>
                      <span className="text-xs font-mono truncate max-w-[60%]" style={{ color: 'var(--app-text)' }}>{deleteTarget.workspace}</span>
                    </div>
                  </div>

                  {/* 错误提示 */}
                  {deleteError && (
                    <div
                      className="rounded-xl border px-4 py-2.5 text-xs"
                      style={{ backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.22)', color: 'var(--app-toast-error-text)' }}
                    >
                      {deleteError}
                    </div>
                  )}
                </div>
              )}
            </AppModal>

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
            <AppModal
              open={!!postGuideAgent}
              onClose={() => setPostGuideAgent(null)}
              title={t('agent.wizard.postGuideTitle')}
              variant="success"
              icon={<CheckCircle size={20} />}
            >
              {postGuideAgent && (
                <div className="space-y-4">
                  <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
                    {t('agent.wizard.postGuideSuccess')}
                  </p>

                  {/* Agent 信息摘要 */}
                  <div
                    className="rounded-xl border px-4 py-3 space-y-2"
                    style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>名称</span>
                      <span className="text-sm font-mono" style={{ color: 'var(--app-text)' }}>{postGuideAgent.name}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>ID</span>
                      <span className="text-sm font-mono" style={{ color: 'var(--app-text)' }}>{postGuideAgent.id}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>工作区</span>
                      <span className="text-xs font-mono truncate max-w-[60%]" style={{ color: 'var(--app-text)' }}>{postGuideAgent.workspace}</span>
                    </div>
                  </div>

                  {/* 操作按钮组 */}
                  <div className="space-y-2 pt-1">
                    <AppButton
                      onClick={() => { setPostGuideAgent(null); navigate('/settings/channels'); }}
                      variant="primary"
                      className="w-full"
                    >
                      {t('agent.wizard.postGuideBinding')}
                    </AppButton>
                    <AppButton
                      onClick={() => { setPostGuideAgent(null); openAgentWorkspace(postGuideAgent.id); }}
                      variant="secondary"
                      className="w-full"
                    >
                      {t('agent.wizard.postGuideWorkspace')}
                    </AppButton>
                    <AppButton
                      onClick={() => { setPostGuideAgent(null); loadAgents(); }}
                      variant="secondary"
                      className="w-full"
                    >
                      {t('agent.wizard.postGuideBackToList')}
                    </AppButton>
                  </div>
                </div>
              )}
            </AppModal>

            {/* 导出 Agent 配置对话框 */}
            {exportTarget && (
              <ExportAgentDialog
                open={!!exportTarget}
                onClose={() => setExportTarget(null)}
                agent={exportTarget}
                onExported={() => {
                  // 导出成功后可选刷新
                }}
              />
            )}

            {/* 导入 Agent 配置对话框 */}
            <ImportAgentDialog
              open={importOpen}
              onClose={() => setImportOpen(false)}
              onImported={() => {
                loadAgents(); // 导入成功后刷新列表
              }}
            />

            {/* 导出历史面板 */}
            <ExportHistoryPanel
              open={historyOpen}
              onClose={() => setHistoryOpen(false)}
            />
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