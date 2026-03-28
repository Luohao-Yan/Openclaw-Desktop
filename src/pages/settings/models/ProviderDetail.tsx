/**
 * 提供商详情组件（右侧面板）
 * 显示选中提供商的配置信息和模型列表
 */

import React, { useState, useEffect } from 'react';
import { Bot, Server, CheckCircle, XCircle, HelpCircle, Star, Trash2, Edit2, Eye, EyeOff, Copy, Zap, Loader2 } from 'lucide-react';
import GlassCard from '../../../components/GlassCard';
import AppButton from '../../../components/AppButton';
import AppBadge from '../../../components/AppBadge';
import AppInput from '../../../components/AppInput';
import { useI18n } from '../../../i18n/I18nContext';
import type { ProviderAuthStatus } from '../../../types/electron';
import type { ProviderItem } from './ProvidersList';

/** 模型条目 */
export interface ModelItem {
  id: string; // 模型 ID（如 kimi-k2.5）
  name: string; // 显示名称（如 Kimi K2.5）
  fullId: string; // 完整 ID（provider/model-id）
  alias?: string; // 用户设置的别名
  isDefault: boolean; // 是否是默认模型
  reasoning?: boolean; // 是否支持思考模式
  input?: string[]; // 支持的输入格式（如 ["text", "image"]）
  contextWindow?: number; // 上下文窗口大小
  maxTokens?: number; // 最大输出 token 数
  cost?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
}

interface ProviderDetailProps {
  provider: ProviderItem | null;
  models: ModelItem[];
  onSetDefaultModel: (fullId: string) => Promise<void>;
  onDeleteModel: (modelId: string) => Promise<void>;
  onEditModel: (providerId: string, modelId: string, updates: { [key: string]: any }) => Promise<void>;
  onAddModel: (providerId: string, model: { id: string; name: string; alias?: string; contextWindow?: number; maxTokens?: number }) => Promise<void>;
  onSaveProviderConfig: (providerId: string, config: { baseUrl?: string; apiKey?: string }) => Promise<void>;
  onAddCustomProvider: (provider: { 
    id: string; 
    name: string; 
    description?: string;
    baseUrl?: string;
    apiKey?: string;
    api: 'openai-completions' | 'anthropic-messages';
    firstModel: {
      id: string;
      name: string;
    };
  }) => Promise<void>;
  onCancelAddCustom: () => void;
}

const ProviderDetail: React.FC<ProviderDetailProps> = ({
  provider,
  models,
  onSetDefaultModel,
  onDeleteModel,
  onEditModel,
  onAddModel,
  onSaveProviderConfig,
  onAddCustomProvider,
  onCancelAddCustom,
}) => {
  const { t } = useI18n();
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [editModelForm, setEditModelForm] = useState<any>({});
  
  // 添加模型表单状态
  const [showAddModelForm, setShowAddModelForm] = useState(false);
  const [addModelForm, setAddModelForm] = useState({
    id: '',
    name: '',
    alias: '',
    reasoning: false,
    input: 'text',
    contextWindow: '',
    maxTokens: '',
    costInput: '',
    costOutput: '',
    costCacheRead: '',
    costCacheWrite: '',
  });

  // 提供商配置编辑状态
  const [editingConfig, setEditingConfig] = useState(false);
  const [configForm, setConfigForm] = useState({ baseUrl: '', apiKey: '' });
  const [savingConfig, setSavingConfig] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // 环境变量引用解析状态
  const [resolvedApiKey, setResolvedApiKey] = useState<{ resolved: string | null; error?: string } | null>(null);

  // 添加自定义提供商表单状态
  const [addCustomForm, setAddCustomForm] = useState({
    id: '',
    name: '',
    description: '',
    baseUrl: '',
    apiKey: '',
    api: 'openai-completions' as 'openai-completions' | 'anthropic-messages',
    // 第一个模型（必需）
    modelId: '',
    modelName: '',
  });
  const [showAddCustomApiKey, setShowAddCustomApiKey] = useState(false);
  const [isAddingCustom, setIsAddingCustom] = useState(false);

  // 模型连通性测试状态：key 为 model.id，value 为测试结果
  const [testingModels, setTestingModels] = useState<Record<string, 'testing' | 'success' | 'fail'>>({});
  const [testResults, setTestResults] = useState<Record<string, { latencyMs?: number; error?: string }>>({});

  // 当选中未配置的提供商时，自动展开配置表单
  useEffect(() => {
    if (provider && !provider.isConfigured) {
      setConfigForm({
        baseUrl: provider.defaultBaseUrl || '',
        apiKey: '',
      });
      setEditingConfig(true);
    } else {
      setEditingConfig(false);
    }
    // 切换提供商时清除测试状态
    setTestingModels({});
    setTestResults({});
  }, [provider?.id, provider?.isConfigured]);

  // 当 apiKey 为 ${VAR_NAME} 格式时，异步解析环境变量引用
  useEffect(() => {
    const apiKey = configForm.apiKey || provider?.apiKey;
    if (!apiKey || !/^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(apiKey)) {
      setResolvedApiKey(null);
      return;
    }
    let cancelled = false;
    window.electronAPI?.resolveApiKey?.(apiKey).then((result) => {
      if (!cancelled) setResolvedApiKey(result);
    }).catch(() => {
      if (!cancelled) setResolvedApiKey(null);
    });
    return () => { cancelled = true; };
  }, [configForm.apiKey, provider?.apiKey]);

  /** 渲染认证状态徽章 */
  const renderStatusBadge = (status: ProviderAuthStatus) => {
    const config = {
      authenticated: { 
        icon: CheckCircle, 
        color: '#4ADE80', 
        bg: 'rgba(74, 222, 128, 0.12)',
        text: t('settings.models.statusAuthenticated')
      },
      unauthenticated: { 
        icon: XCircle, 
        color: '#FB7185', 
        bg: 'rgba(251, 113, 133, 0.12)',
        text: t('settings.models.statusUnauthenticated')
      },
      unknown: { 
        icon: HelpCircle, 
        color: '#94A3B8', 
        bg: 'rgba(148, 163, 184, 0.12)',
        text: t('settings.models.statusUnknown')
      },
    };

    const { icon: Icon, color, bg, text } = config[status];

    return (
      /* 认证状态 badge */
      <AppBadge
        size="sm"
        icon={<Icon size={12} />}
        style={{ backgroundColor: bg, color }}
      >
        {text}
      </AppBadge>
    );
  };

  /** 开始编辑模型 */
  const startEditModel = (model: ModelItem) => {
    setEditModelForm({
      name: model.name,
      alias: model.alias || '',
      reasoning: model.reasoning || false,
      input: (model.input || ['text']).join(','),
      contextWindow: model.contextWindow?.toString() || '',
      maxTokens: model.maxTokens?.toString() || '',
      costInput: model.cost?.input?.toString() || '0',
      costOutput: model.cost?.output?.toString() || '0',
      costCacheRead: model.cost?.cacheRead?.toString() || '0',
      costCacheWrite: model.cost?.cacheWrite?.toString() || '0',
    });
    setEditingModelId(model.id);
  };

  /** 保存模型编辑 */
  const saveModelEdit = async (modelId: string) => {
    if (!provider) return;
    
    try {
      const updates: any = {
        name: editModelForm.name.trim(),
        alias: editModelForm.alias.trim() || undefined,
        reasoning: editModelForm.reasoning,
        input: editModelForm.input.split(',').map((s: string) => s.trim()).filter(Boolean),
      };

      if (editModelForm.contextWindow) {
        updates.contextWindow = parseInt(editModelForm.contextWindow);
      }

      if (editModelForm.maxTokens) {
        updates.maxTokens = parseInt(editModelForm.maxTokens);
      }

      updates.cost = {
        input: parseFloat(editModelForm.costInput) || 0,
        output: parseFloat(editModelForm.costOutput) || 0,
        cacheRead: parseFloat(editModelForm.costCacheRead) || 0,
        cacheWrite: parseFloat(editModelForm.costCacheWrite) || 0,
      };

      await onEditModel(provider.id, modelId, updates);
      setEditingModelId(null);
    } catch (err) {
      console.error('保存模型失败:', err);
    }
  };

  /** 处理添加模型 */
  const handleAddModel = async () => {
    if (!provider || !addModelForm.id || !addModelForm.name) {
      return;
    }

    try {
      const modelData: any = {
        id: addModelForm.id.trim(),
        name: addModelForm.name.trim(),
        reasoning: addModelForm.reasoning,
        input: addModelForm.input.split(',').map(s => s.trim()).filter(Boolean),
      };

      if (addModelForm.alias.trim()) {
        modelData.alias = addModelForm.alias.trim();
      }

      if (addModelForm.contextWindow) {
        modelData.contextWindow = parseInt(addModelForm.contextWindow);
      }

      if (addModelForm.maxTokens) {
        modelData.maxTokens = parseInt(addModelForm.maxTokens);
      }

      modelData.cost = {
        input: parseFloat(addModelForm.costInput) || 0,
        output: parseFloat(addModelForm.costOutput) || 0,
        cacheRead: parseFloat(addModelForm.costCacheRead) || 0,
        cacheWrite: parseFloat(addModelForm.costCacheWrite) || 0,
      };

      await onAddModel(provider.id, modelData);
      
      // 重置表单
      setAddModelForm({
        id: '',
        name: '',
        alias: '',
        reasoning: false,
        input: 'text',
        contextWindow: '',
        maxTokens: '',
        costInput: '',
        costOutput: '',
        costCacheRead: '',
        costCacheWrite: '',
      });
      setShowAddModelForm(false);
    } catch (err) {
      console.error('添加模型失败:', err);
    }
  };

  /** 开始编辑提供商配置 */
  const startEditConfig = () => {
    setConfigForm({
      baseUrl: provider?.baseUrl || '',
      apiKey: provider?.apiKey || '',
    });
    setEditingConfig(true);
  };

  /** 保存提供商配置 */
  const saveProviderConfig = async () => {
    if (!provider) return;
    
    setSavingConfig(true);
    try {
      await onSaveProviderConfig(provider.id, {
        baseUrl: configForm.baseUrl.trim() || undefined,
        apiKey: configForm.apiKey.trim() || undefined,
      });
      setEditingConfig(false);
      setShowApiKey(false); // 保存后隐藏密码
    } catch (err) {
      console.error('保存提供商配置失败:', err);
    } finally {
      setSavingConfig(false);
    }
  };

  /** 复制到剪贴板 */
  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback(label);
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  /** 测试单个模型的连通性 */
  const handleTestModel = async (model: ModelItem) => {
    if (!provider) return;
    setTestingModels((prev) => ({ ...prev, [model.id]: 'testing' }));
    setTestResults((prev) => {
      const next = { ...prev };
      delete next[model.id];
      return next;
    });

    try {
      // 调用已有的 testModelConnection IPC 接口
      const result = await window.electronAPI?.testModelConnection?.({
        provider: provider.id,
        model: model.fullId,
        apiKey: provider.apiKey,
        baseUrl: provider.baseUrl,
      });

      if (result?.success) {
        setTestingModels((prev) => ({ ...prev, [model.id]: 'success' }));
        setTestResults((prev) => ({ ...prev, [model.id]: { latencyMs: result.latencyMs } }));
      } else {
        setTestingModels((prev) => ({ ...prev, [model.id]: 'fail' }));
        setTestResults((prev) => ({ ...prev, [model.id]: { error: result?.error || '未知错误', latencyMs: result?.latencyMs } }));
      }
    } catch (err: any) {
      setTestingModels((prev) => ({ ...prev, [model.id]: 'fail' }));
      setTestResults((prev) => ({ ...prev, [model.id]: { error: err?.message || '测试失败' } }));
    }
  };

  /** 批量测试所有模型 */
  const handleTestAllModels = async () => {
    if (!provider || models.length === 0) return;
    for (const model of models) {
      await handleTestModel(model);
    }
  };

  /** 处理添加自定义提供商 */
  const handleAddCustomProvider = async () => {
    // 验证必填字段
    if (!addCustomForm.id.trim() || !addCustomForm.name.trim() || 
        !addCustomForm.modelId.trim() || !addCustomForm.modelName.trim()) {
      return;
    }

    setIsAddingCustom(true);
    try {
      await onAddCustomProvider({
        id: addCustomForm.id.trim(),
        name: addCustomForm.name.trim(),
        description: addCustomForm.description.trim() || undefined,
        baseUrl: addCustomForm.baseUrl.trim() || undefined,
        apiKey: addCustomForm.apiKey.trim() || undefined,
        api: addCustomForm.api,
        // 添加第一个模型
        firstModel: {
          id: addCustomForm.modelId.trim(),
          name: addCustomForm.modelName.trim(),
        },
      });
      
      // 重置表单
      setAddCustomForm({
        id: '',
        name: '',
        description: '',
        baseUrl: '',
        apiKey: '',
        api: 'openai-completions',
        modelId: '',
        modelName: '',
      });
      setShowAddCustomApiKey(false);
    } catch (err) {
      console.error('添加自定义提供商失败:', err);
    } finally {
      setIsAddingCustom(false);
    }
  };

  // 检测是否是添加自定义提供商模式
  const isAddingCustomProvider = provider?.id === '__add_custom__';

  // 添加自定义提供商表单
  if (isAddingCustomProvider) {
    return (
      <GlassCard className="rounded-2xl p-6">
        <div className="mb-5">
          <div className="text-xl font-semibold mb-2" style={{ color: 'var(--app-text)' }}>
            添加自定义提供商
          </div>
          <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
            添加 OpenAI/Anthropic 兼容的自定义提供商或本地代理（如 LM Studio、Ollama）
          </div>
        </div>

        <div className="space-y-4">
          {/* 基本信息 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--app-text)' }}>
                提供商 ID *
              </label>
              <AppInput
                type="text"
                value={addCustomForm.id}
                onChange={(e) => setAddCustomForm({ ...addCustomForm, id: e.target.value })}
                placeholder="例如: my-provider"
              />
              <div className="mt-1 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                唯一标识符，只能包含小写字母、数字和连字符
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--app-text)' }}>
                显示名称 *
              </label>
              <AppInput
                type="text"
                value={addCustomForm.name}
                onChange={(e) => setAddCustomForm({ ...addCustomForm, name: e.target.value })}
                placeholder="例如: My Provider"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--app-text)' }}>
              描述（可选）
            </label>
            <AppInput
              type="text"
              value={addCustomForm.description}
              onChange={(e) => setAddCustomForm({ ...addCustomForm, description: e.target.value })}
              placeholder="简短描述这个提供商"
            />
          </div>

          {/* API 接口类型 */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--app-text)' }}>
              接口类型 *
            </label>
            <select
              value={addCustomForm.api}
              onChange={(e) => setAddCustomForm({ ...addCustomForm, api: e.target.value as 'openai-completions' | 'anthropic-messages' })}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition-token-normal"
              style={{
                backgroundColor: 'var(--app-bg)',
                borderColor: 'var(--app-border)',
                color: 'var(--app-text)',
              }}
            >
              <option value="openai-completions">OpenAI 兼容</option>
              <option value="anthropic-messages">Anthropic 兼容</option>
            </select>
            <div className="mt-2 text-xs" style={{ color: 'var(--app-text-muted)' }}>
              {addCustomForm.api === 'openai-completions'
                ? '✓ 适用于 OpenAI、Moonshot、LM Studio、Ollama、vLLM 等'
                : '✓ 适用于 Anthropic、Synthetic、Kimi Coding 等'}
            </div>
          </div>

          {/* Base URL */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--app-text)' }}>
              Base URL *
            </label>
            <AppInput
              type="text"
              value={addCustomForm.baseUrl}
              onChange={(e) => setAddCustomForm({ ...addCustomForm, baseUrl: e.target.value })}
              placeholder={
                addCustomForm.api === 'openai-completions'
                  ? '例如: https://api.moonshot.ai/v1 或 http://localhost:1234/v1'
                  : '例如: https://api.synthetic.new/anthropic'
              }
              className="font-mono"
            />
            <div className="mt-1 text-xs" style={{ color: 'var(--app-text-muted)' }}>
              {addCustomForm.api === 'openai-completions'
                ? '⚠️ 必须包含完整路径（通常以 /v1 结尾）'
                : '⚠️ 必须包含完整路径（如 /anthropic 或 /v1/messages）'}
            </div>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--app-text)' }}>
              API Key（可选）
            </label>
            <div className="relative">
              <AppInput
                type={showAddCustomApiKey ? 'text' : 'password'}
                value={addCustomForm.apiKey}
                onChange={(e) => setAddCustomForm({ ...addCustomForm, apiKey: e.target.value })}
                placeholder="sk-..."
                className="pr-20 font-mono"
              />
              {addCustomForm.apiKey && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  <AppButton
                    iconOnly
                    size="xs"
                    variant="ghost"
                    onClick={() => setShowAddCustomApiKey(!showAddCustomApiKey)}
                    title={showAddCustomApiKey ? '隐藏 API Key' : '显示 API Key'}
                    icon={showAddCustomApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  />
                </div>
              )}
            </div>
            <div className="mt-1 text-xs" style={{ color: 'var(--app-text-muted)' }}>
              本地代理可留空；远程 API 通常需要
            </div>
          </div>

          {/* 第一个模型配置（必需） */}
          <div className="rounded-lg border p-4" style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-bg-subtle)' }}>
            <div className="text-sm font-semibold mb-3" style={{ color: 'var(--app-text)' }}>
              第一个模型 *
            </div>
            <div className="text-xs mb-3" style={{ color: 'var(--app-text-muted)' }}>
              添加提供商时必须配置至少一个模型。添加后可继续添加更多模型。
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--app-text-muted)' }}>
                  模型 ID *
                </label>
                <AppInput
                  type="text"
                  value={addCustomForm.modelId}
                  onChange={(e) => setAddCustomForm({ ...addCustomForm, modelId: e.target.value })}
                  placeholder="例如: kimi-k2.5"
                />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--app-text-muted)' }}>
                  显示名称 *
                </label>
                <AppInput
                  type="text"
                  value={addCustomForm.modelName}
                  onChange={(e) => setAddCustomForm({ ...addCustomForm, modelName: e.target.value })}
                  placeholder="例如: Kimi K2.5"
                />
              </div>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-3 pt-2">
            <AppButton
              onClick={handleAddCustomProvider}
              disabled={
                !addCustomForm.id.trim() || 
                !addCustomForm.name.trim() || 
                !addCustomForm.baseUrl.trim() ||
                !addCustomForm.modelId.trim() || 
                !addCustomForm.modelName.trim() || 
                isAddingCustom
              }
              variant="primary"
              className="flex-1"
            >
              {isAddingCustom ? '添加中...' : '添加提供商'}
            </AppButton>
            <AppButton
              onClick={() => {
                setAddCustomForm({
                  id: '',
                  name: '',
                  description: '',
                  baseUrl: '',
                  apiKey: '',
                  api: 'openai-completions',
                  modelId: '',
                  modelName: '',
                });
                setShowAddCustomApiKey(false);
                // 取消时清空选择，返回空状态
                onCancelAddCustom();
              }}
              variant="secondary"
              className="flex-1"
            >
              取消
            </AppButton>
          </div>
        </div>
      </GlassCard>
    );
  }

  // 空状态
  if (!provider) {
    return (
      <GlassCard className="rounded-2xl p-5">
        <div className="text-center py-12">
          <div
            className="inline-flex h-16 w-16 items-center justify-center rounded-2xl mb-4"
            style={{ backgroundColor: 'rgba(129, 140, 248, 0.12)', color: '#818CF8' }}
          >
            <Bot size={32} />
          </div>
          <div className="text-lg font-semibold mb-2" style={{ color: 'var(--app-text)' }}>
            选择一个提供商
          </div>
          <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
            从左侧列表中选择一个模型提供商以查看详细信息
          </div>
        </div>
      </GlassCard>
    );
  }

  // 排序：默认模型置顶
  const sortedModels = [...models].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <>
      {/* 提供商信息卡片 */}
      <GlassCard className="rounded-2xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 flex-1">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
              style={{ 
                backgroundColor: provider.isConfigured 
                  ? 'rgba(129, 140, 248, 0.12)' 
                  : 'rgba(148, 163, 184, 0.12)', 
                color: provider.isConfigured ? '#818CF8' : '#94A3B8' 
              }}
            >
              {provider.isConfigured ? <Server size={20} /> : <Bot size={20} />}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <div className="text-xl font-semibold" style={{ color: 'var(--app-text)' }}>
                  {provider.name}
                </div>
                {provider.isDefault && (
                  /* 默认提供商标记 badge */
                  <AppBadge
                    size="sm"
                    icon={<Star size={10} fill="#FCD34D" />}
                    style={{ backgroundColor: 'rgba(252, 211, 77, 0.15)', borderColor: 'rgba(252, 211, 77, 0.25)', color: '#FCD34D' }}
                  >
                    默认
                  </AppBadge>
                )}
              </div>
              {provider.description && (
                <div className="mt-1 text-sm" style={{ color: 'var(--app-text-muted)' }}>
                  {provider.description}
                </div>
              )}

              {/* 配置信息显示/编辑 */}
              {editingConfig ? (
                <div className="mt-3 space-y-3">
                  {/* 环境变量提示 */}
                  {provider.envVar && (
                    <div
                      className="rounded-lg px-3 py-2 text-xs"
                      style={{
                        backgroundColor: 'rgba(96, 165, 250, 0.08)',
                        border: '1px solid rgba(96, 165, 250, 0.20)',
                        color: 'var(--app-text-muted)',
                      }}
                    >
                      💡 提示：此提供商使用环境变量 <code className="font-mono font-semibold" style={{ color: 'var(--app-text)' }}>{provider.envVar}</code> 进行认证
                    </div>
                  )}

                  {/* Base URL 输入框 */}
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--app-text-muted)' }}>
                      Base URL（可选）
                      {provider.defaultBaseUrl && (
                        <span className="ml-2 font-normal opacity-70">
                          默认: {provider.defaultBaseUrl}
                        </span>
                      )}
                    </label>
                    <div className="relative">
                      <AppInput
                        type="text"
                        value={configForm.baseUrl}
                        onChange={(e) => setConfigForm({ ...configForm, baseUrl: e.target.value })}
                        placeholder={provider.defaultBaseUrl || 'https://api.example.com/v1'}
                        className="pr-10 font-mono"
                      />
                      {configForm.baseUrl && (
                        <AppButton
                          iconOnly
                          size="xs"
                          variant="ghost"
                          onClick={() => copyToClipboard(configForm.baseUrl, 'Base URL')}
                          className="absolute right-2 top-1/2 -translate-y-1/2"
                          title="复制 Base URL"
                          icon={<Copy size={14} />}
                        />
                      )}
                    </div>
                  </div>

                  {/* API Key 输入框 */}
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--app-text-muted)' }}>
                      API Key（可选）
                      {provider.envVar && (
                        <span className="ml-2 font-normal opacity-70">
                          或使用环境变量 {provider.envVar}
                        </span>
                      )}
                    </label>
                    <div className="relative">
                      <AppInput
                        type={showApiKey ? 'text' : 'password'}
                        value={configForm.apiKey}
                        onChange={(e) => setConfigForm({ ...configForm, apiKey: e.target.value })}
                        placeholder={provider.envVar ? `${provider.envVar}=sk-...` : 'sk-...'}
                        className="pr-20 font-mono"
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {configForm.apiKey && (
                          <>
                            <AppButton
                              iconOnly
                              size="xs"
                              variant="ghost"
                              onClick={() => setShowApiKey(!showApiKey)}
                              title={showApiKey ? '隐藏 API Key' : '显示 API Key'}
                              icon={showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                            />
                            <AppButton
                              iconOnly
                              size="xs"
                              variant="ghost"
                              onClick={() => copyToClipboard(configForm.apiKey, 'API Key')}
                              title="复制 API Key"
                              icon={<Copy size={14} />}
                            />
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 环境变量解析：点击显示密钥时展示真实值 */}
                  {showApiKey && resolvedApiKey && (
                    resolvedApiKey.resolved ? (
                      <div
                        className="text-xs rounded-lg px-3 py-2 flex items-center gap-2"
                        style={{
                          backgroundColor: 'rgba(34, 197, 94, 0.10)',
                          border: '1px solid rgba(34, 197, 94, 0.30)',
                          color: '#4ADE80',
                        }}
                      >
                        <span>✓ 实际密钥：</span>
                        <code className="font-mono flex-1 select-all" style={{ color: 'var(--app-text)', wordBreak: 'break-all' }}>{resolvedApiKey.resolved}</code>
                        <AppButton
                          iconOnly
                          size="xs"
                          variant="ghost"
                          onClick={() => copyToClipboard(resolvedApiKey.resolved!, '实际密钥')}
                          title="复制实际密钥"
                          icon={<Copy size={14} />}
                        />
                      </div>
                    ) : (
                      <div
                        className="text-xs rounded-lg px-3 py-2"
                        style={{
                          backgroundColor: 'rgba(251, 113, 133, 0.10)',
                          border: '1px solid rgba(251, 113, 133, 0.30)',
                          color: '#FB7185',
                        }}
                      >
                        ✗ {resolvedApiKey.error || '环境变量未设置'}
                      </div>
                    )
                  )}
                  {/* 环境变量设置说明 */}
                  {configForm.apiKey && /^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(configForm.apiKey) && (
                    <div
                      className="text-xs rounded-lg px-3 py-2"
                      style={{
                        backgroundColor: 'rgba(96, 165, 250, 0.08)',
                        border: '1px solid rgba(96, 165, 250, 0.20)',
                        color: 'var(--app-text-muted)',
                      }}
                    >
                      💡 环境变量值的设置方式：在 <code className="font-mono" style={{ color: 'var(--app-text)' }}>openclaw.json</code> 的 <code className="font-mono" style={{ color: 'var(--app-text)' }}>env</code> 节点中添加，或在系统终端中 <code className="font-mono" style={{ color: 'var(--app-text)' }}>export {configForm.apiKey.slice(2, -1)}=你的密钥</code>
                    </div>
                  )}

                  {/* 复制成功提示 */}
                  {copyFeedback && (
                    <div
                      className="text-xs rounded-lg px-3 py-2"
                      style={{
                        backgroundColor: 'rgba(34, 197, 94, 0.10)',
                        border: '1px solid rgba(34, 197, 94, 0.30)',
                        color: '#4ADE80',
                      }}
                    >
                      ✓ {copyFeedback} 已复制到剪贴板
                    </div>
                  )}

                  <div className="flex gap-2">
                    <AppButton
                      onClick={saveProviderConfig}
                      loading={savingConfig}
                      variant="primary"
                      size="xs"
                    >
                      保存配置
                    </AppButton>
                    <AppButton
                      onClick={() => {
                        setEditingConfig(false);
                        setShowApiKey(false);
                      }}
                      variant="secondary"
                      size="xs"
                    >
                      取消
                    </AppButton>
                  </div>
                </div>
              ) : (
                <>
                  {provider.baseUrl && (
                    <div className="mt-2 text-xs font-mono" style={{ color: 'var(--app-text-muted)' }}>
                      {provider.baseUrl}
                    </div>
                  )}
                  {provider.apiKey && (
                    <div className="mt-1 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                      API Key: ✓ 已配置
                    </div>
                  )}
                  {provider.isConfigured && (
                    <div className="mt-3">
                      <AppButton
                        onClick={startEditConfig}
                        variant="secondary"
                        size="xs"
                      >
                        编辑配置
                      </AppButton>
                    </div>
                  )}
                  {!provider.isConfigured && (
                    <div className="mt-3">
                      <AppButton
                        onClick={startEditConfig}
                        variant="primary"
                        size="xs"
                      >
                        配置提供商
                      </AppButton>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          {provider.authStatus !== 'unknown' && renderStatusBadge(provider.authStatus)}
        </div>
      </GlassCard>

      {/* 已配置提供商：显示模型列表 */}
      {provider.isConfigured && (
        <GlassCard className="rounded-2xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-[15px] font-semibold" style={{ color: 'var(--app-text)' }}>
                模型列表 ({sortedModels.length})
              </div>
              <div className="mt-1 text-sm" style={{ color: 'var(--app-text-muted)' }}>
                该提供商配置的所有模型
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* 全部测试按钮 */}
              <AppButton
                variant="secondary"
                size="xs"
                onClick={handleTestAllModels}
                disabled={Object.values(testingModels).some((s) => s === 'testing')}
              >
                <Zap size={13} className="mr-1" />
                全部测试
              </AppButton>
              <AppButton
                variant="primary"
                size="xs"
                onClick={() => setShowAddModelForm(!showAddModelForm)}
              >
                {showAddModelForm ? '取消' : '添加模型'}
              </AppButton>
            </div>
          </div>

          {/* 添加模型表单 */}
          {showAddModelForm && (
            <div
              className="mb-4 rounded-xl p-4"
              style={{
                backgroundColor: 'var(--app-bg-subtle)',
                border: '1px solid var(--app-border)',
              }}
            >
              <div className="text-sm font-semibold mb-3" style={{ color: 'var(--app-text)' }}>
                添加新模型
              </div>
              <div className="space-y-3">
                {/* 基本信息 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--app-text-muted)' }}>
                      模型 ID *
                    </label>
                    <AppInput
                      type="text"
                      size="sm"
                      value={addModelForm.id}
                      onChange={(e) => setAddModelForm({ ...addModelForm, id: e.target.value })}
                      placeholder="例如: gpt-4o"
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--app-text-muted)' }}>
                      显示名称 *
                    </label>
                    <AppInput
                      type="text"
                      size="sm"
                      value={addModelForm.name}
                      onChange={(e) => setAddModelForm({ ...addModelForm, name: e.target.value })}
                      placeholder="例如: GPT-4o"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--app-text-muted)' }}>
                    别名（可选）
                  </label>
                  <AppInput
                    type="text"
                    size="sm"
                    value={addModelForm.alias}
                    onChange={(e) => setAddModelForm({ ...addModelForm, alias: e.target.value })}
                    placeholder="例如: GPT-4o"
                  />
                </div>

                {/* 能力配置 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                      <input
                        type="checkbox"
                        checked={addModelForm.reasoning}
                        onChange={(e) => setAddModelForm({ ...addModelForm, reasoning: e.target.checked })}
                        className="rounded"
                      />
                      支持思考模式
                    </label>
                  </div>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--app-text-muted)' }}>
                      输入格式
                    </label>
                    <AppInput
                      type="text"
                      size="sm"
                      value={addModelForm.input}
                      onChange={(e) => setAddModelForm({ ...addModelForm, input: e.target.value })}
                      placeholder="text,image"
                    />
                  </div>
                </div>

                {/* Token 配置 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--app-text-muted)' }}>
                      上下文窗口
                    </label>
                    <AppInput
                      type="number"
                      size="sm"
                      value={addModelForm.contextWindow}
                      onChange={(e) => setAddModelForm({ ...addModelForm, contextWindow: e.target.value })}
                      placeholder="128000"
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--app-text-muted)' }}>
                      最大输出
                    </label>
                    <AppInput
                      type="number"
                      size="sm"
                      value={addModelForm.maxTokens}
                      onChange={(e) => setAddModelForm({ ...addModelForm, maxTokens: e.target.value })}
                      placeholder="16384"
                    />
                  </div>
                </div>

                {/* Cost 配置 */}
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--app-text-muted)' }}>
                    成本配置（每百万 token）
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    <AppInput
                      type="number"
                      size="xs"
                      step="0.01"
                      value={addModelForm.costInput}
                      onChange={(e) => setAddModelForm({ ...addModelForm, costInput: e.target.value })}
                      placeholder="输入"
                    />
                    <AppInput
                      type="number"
                      size="xs"
                      step="0.01"
                      value={addModelForm.costOutput}
                      onChange={(e) => setAddModelForm({ ...addModelForm, costOutput: e.target.value })}
                      placeholder="输出"
                    />
                    <AppInput
                      type="number"
                      size="xs"
                      step="0.01"
                      value={addModelForm.costCacheRead}
                      onChange={(e) => setAddModelForm({ ...addModelForm, costCacheRead: e.target.value })}
                      placeholder="缓存读"
                    />
                    <AppInput
                      type="number"
                      size="xs"
                      step="0.01"
                      value={addModelForm.costCacheWrite}
                      onChange={(e) => setAddModelForm({ ...addModelForm, costCacheWrite: e.target.value })}
                      placeholder="缓存写"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <AppButton
                    onClick={() => setShowAddModelForm(false)}
                    variant="secondary"
                    size="xs"
                  >
                    取消
                  </AppButton>
                  <AppButton
                    onClick={handleAddModel}
                    disabled={!addModelForm.id || !addModelForm.name}
                    variant="primary"
                    size="xs"
                  >
                    添加
                  </AppButton>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {sortedModels.map((model) => (
              <div
                key={model.id}
                className="rounded-xl p-4"
                style={{
                  backgroundColor: model.isDefault ? 'rgba(252, 211, 77, 0.08)' : 'var(--app-bg-subtle)',
                  border: model.isDefault ? '1px solid rgba(252, 211, 77, 0.3)' : '1px solid var(--app-border)',
                }}
              >
                {/* 编辑模式 */}
                {editingModelId === model.id ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-sm font-mono font-semibold" style={{ color: 'var(--app-text)' }}>
                        {model.id}
                      </div>
                      <div className="flex gap-2">
                        <AppButton
                          onClick={() => saveModelEdit(model.id)}
                          variant="primary"
                          size="xs"
                        >
                          保存
                        </AppButton>
                        <AppButton
                          onClick={() => setEditingModelId(null)}
                          variant="secondary"
                          size="xs"
                        >
                          取消
                        </AppButton>
                      </div>
                    </div>

                    {/* 编辑表单 */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs mb-1" style={{ color: 'var(--app-text-muted)' }}>显示名称</label>
                        <AppInput
                          type="text"
                          size="xs"
                          value={editModelForm.name}
                          onChange={(e) => setEditModelForm({ ...editModelForm, name: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-xs mb-1" style={{ color: 'var(--app-text-muted)' }}>别名</label>
                        <AppInput
                          type="text"
                          size="xs"
                          value={editModelForm.alias}
                          onChange={(e) => setEditModelForm({ ...editModelForm, alias: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-xs mb-1" style={{ color: 'var(--app-text-muted)' }}>上下文窗口</label>
                        <AppInput
                          type="number"
                          size="xs"
                          value={editModelForm.contextWindow}
                          onChange={(e) => setEditModelForm({ ...editModelForm, contextWindow: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-xs mb-1" style={{ color: 'var(--app-text-muted)' }}>最大输出</label>
                        <AppInput
                          type="number"
                          size="xs"
                          value={editModelForm.maxTokens}
                          onChange={(e) => setEditModelForm({ ...editModelForm, maxTokens: e.target.value })}
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                          <input
                            type="checkbox"
                            checked={editModelForm.reasoning}
                            onChange={(e) => setEditModelForm({ ...editModelForm, reasoning: e.target.checked })}
                            className="rounded"
                          />
                          支持思考模式
                        </label>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs mb-1" style={{ color: 'var(--app-text-muted)' }}>输入格式（逗号分隔）</label>
                        <AppInput
                          type="text"
                          size="xs"
                          value={editModelForm.input}
                          onChange={(e) => setEditModelForm({ ...editModelForm, input: e.target.value })}
                          placeholder="text,image"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs mb-1" style={{ color: 'var(--app-text-muted)' }}>成本（每百万 token）</label>
                        <div className="grid grid-cols-4 gap-1">
                          <AppInput
                            type="number"
                            size="xs"
                            step="0.01"
                            value={editModelForm.costInput}
                            onChange={(e) => setEditModelForm({ ...editModelForm, costInput: e.target.value })}
                            placeholder="输入"
                          />
                          <AppInput
                            type="number"
                            size="xs"
                            step="0.01"
                            value={editModelForm.costOutput}
                            onChange={(e) => setEditModelForm({ ...editModelForm, costOutput: e.target.value })}
                            placeholder="输出"
                          />
                          <AppInput
                            type="number"
                            size="xs"
                            step="0.01"
                            value={editModelForm.costCacheRead}
                            onChange={(e) => setEditModelForm({ ...editModelForm, costCacheRead: e.target.value })}
                            placeholder="缓存读"
                          />
                          <AppInput
                            type="number"
                            size="xs"
                            step="0.01"
                            value={editModelForm.costCacheWrite}
                            onChange={(e) => setEditModelForm({ ...editModelForm, costCacheWrite: e.target.value })}
                            placeholder="缓存写"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* 显示模式 */
                  <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {model.isDefault && (
                          <Star size={14} fill="#FCD34D" style={{ color: '#FCD34D', flexShrink: 0 }} />
                        )}
                        <div className="text-sm font-mono font-semibold truncate" style={{ color: 'var(--app-text)' }}>
                          {model.id}
                        </div>
                        <AppButton
                          iconOnly
                          size="xs"
                          tint="default"
                          onClick={() => startEditModel(model)}
                          title="编辑模型"
                          icon={<Edit2 size={12} />}
                        />
                      </div>
                      
                      <div className="mt-1 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                        {model.alias || model.name}
                      </div>

                      {/* 模型信息 */}
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                        {model.contextWindow && <span>上下文: {model.contextWindow.toLocaleString()}</span>}
                        {model.maxTokens && <span>最大输出: {model.maxTokens.toLocaleString()}</span>}
                        {model.reasoning && <span>✓ 思考模式</span>}
                        {model.input && model.input.length > 0 && <span>输入: {model.input.join(', ')}</span>}
                      </div>
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex items-center gap-2 shrink-0">
                      {/* 测试连通性按钮 */}
                      <AppButton
                        onClick={() => handleTestModel(model)}
                        disabled={testingModels[model.id] === 'testing'}
                        variant="secondary"
                        size="xs"
                        title="测试模型连通性"
                      >
                        {testingModels[model.id] === 'testing' ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : testingModels[model.id] === 'success' ? (
                          <CheckCircle size={14} style={{ color: '#4ADE80' }} />
                        ) : testingModels[model.id] === 'fail' ? (
                          <XCircle size={14} style={{ color: '#FB7185' }} />
                        ) : (
                          <Zap size={14} />
                        )}
                        <span className="ml-1">
                          {testingModels[model.id] === 'testing' ? '测试中' : '测试'}
                        </span>
                      </AppButton>
                      {!model.isDefault && (
                        <AppButton
                          onClick={() => onSetDefaultModel(model.fullId)}
                          variant="primary"
                          size="xs"
                        >
                          设为默认
                        </AppButton>
                      )}
                      <AppButton
                        onClick={() => {
                          if (window.confirm(`确认删除模型 ${model.name}？`)) {
                            onDeleteModel(model.id);
                          }
                        }}
                        variant="danger"
                        size="xs"
                        title="删除模型"
                      >
                        <Trash2 size={14} />
                      </AppButton>
                    </div>
                  </div>

                  {/* 测试结果显示 */}
                  {testingModels[model.id] && testingModels[model.id] !== 'testing' && testResults[model.id] && (
                    <div
                      className="mt-2 rounded-lg px-3 py-2 text-xs"
                      style={{
                        backgroundColor: testingModels[model.id] === 'success'
                          ? 'rgba(74, 222, 128, 0.10)'
                          : 'rgba(251, 113, 133, 0.10)',
                        border: `1px solid ${testingModels[model.id] === 'success'
                          ? 'rgba(74, 222, 128, 0.25)'
                          : 'rgba(251, 113, 133, 0.25)'}`,
                        color: testingModels[model.id] === 'success' ? '#4ADE80' : '#FB7185',
                      }}
                    >
                      {testingModels[model.id] === 'success' ? (
                        <div className="flex items-center gap-2">
                          <CheckCircle size={13} />
                          <span>连通成功</span>
                          {testResults[model.id]?.latencyMs != null && (
                            <span style={{ color: 'var(--app-text-muted)' }}>
                              · 延迟 {testResults[model.id].latencyMs}ms
                            </span>
                          )}
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center gap-2">
                            <XCircle size={13} className="shrink-0" />
                            <span>连通失败</span>
                            {testResults[model.id]?.latencyMs != null && (
                              <span style={{ color: 'var(--app-text-muted)' }}>
                                · 延迟 {testResults[model.id].latencyMs}ms
                              </span>
                            )}
                          </div>
                          {testResults[model.id]?.error && (
                            <div className="mt-1.5 pl-5 leading-relaxed" style={{ color: 'var(--app-text-muted)', wordBreak: 'break-word' }}>
                              {(() => {
                                const raw = testResults[model.id].error!;
                                // 尝试从 JSON 格式的错误中提取可读信息
                                try {
                                  const parsed = JSON.parse(raw.replace(/^[^{]*/, '').replace(/[^}]*$/, ''));
                                  const msg = parsed?.error?.message || parsed?.message || parsed?.error;
                                  const type = parsed?.error?.type || parsed?.type;
                                  if (msg) {
                                    return (
                                      <>
                                        <div>{typeof msg === 'string' ? msg : raw}</div>
                                        {type && <div className="mt-0.5 opacity-70">类型：{type}</div>}
                                      </>
                                    );
                                  }
                                } catch { /* 非 JSON，直接显示 */ }
                                // 截取"请求参数错误："等前缀后的内容
                                const prefixMatch = raw.match(/^(.+?)[：:]\s*(\{.+)/);
                                if (prefixMatch) {
                                  try {
                                    const parsed = JSON.parse(prefixMatch[2]);
                                    const msg = parsed?.error?.message || parsed?.message;
                                    if (msg) {
                                      return (
                                        <>
                                          <div>{prefixMatch[1]}</div>
                                          <div className="mt-0.5">{msg}</div>
                                        </>
                                      );
                                    }
                                  } catch { /* 解析失败 */ }
                                }
                                return raw;
                              })()}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </>
  );
};

export default ProviderDetail;
