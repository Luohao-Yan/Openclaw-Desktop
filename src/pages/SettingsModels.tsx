/**
 * 模型配置页面
 * 采用左右分栏布局：
 * - 左侧：提供商列表（默认提供商置顶）
 * - 右侧：选中提供商的配置和模型列表
 */

import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import AppButton from '../components/AppButton';
import { useI18n } from '../i18n/I18nContext';
import { PROVIDER_LIST, mergeProviderStatuses } from '../config/providers';
import type { ProviderAuthStatus } from '../types/electron';

// 子组件
import ProvidersList, { type ProviderItem } from './settings/models/ProvidersList';
import ProviderDetail, { type ModelItem } from './settings/models/ProviderDetail';

/** 主组件状态结构 */
interface SettingsModelsState {
  // 提供商认证状态
  providerStatuses: Record<string, ProviderAuthStatus>;
  statusLoading: boolean;
  statusError: string;

  // 主模型配置
  primaryModel: string; // 格式: provider/model-id

  // 已配置的模型别名（agents.defaults.models）
  configuredModels: Record<string, { alias?: string; [key: string]: any }>;
  
  // 自定义提供商配置（models.providers）
  customProviders: Record<string, {
    baseUrl?: string;
    apiKey?: string;
    api?: string;
    models?: Array<{ id: string; name: string; [key: string]: any }>;
    [key: string]: any;
  }>;
}

const SettingsModels: React.FC = () => {
  const { t } = useI18n();

  // 状态管理
  const [state, setState] = useState<SettingsModelsState>({
    providerStatuses: {},
    statusLoading: true,
    statusError: '',
    primaryModel: '',
    configuredModels: {},
    customProviders: {},
  });

  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);

  /** 显示临时消息（4秒后自动消失） */
  const showMessage = (msg: string, type: 'success' | 'error' = 'success') => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(''), 4000);
  };

  /** 加载提供商认证状态 */
  const loadProviderStatus = async () => {
    setState(prev => ({ ...prev, statusLoading: true, statusError: '' }));
    try {
      const result = await window.electronAPI.modelsStatus();
      if (result.success) {
        setState(prev => ({ ...prev, providerStatuses: result.providers, statusLoading: false }));
      } else {
        setState(prev => ({ 
          ...prev, 
          statusError: result.error || '加载失败',
          statusLoading: false 
        }));
      }
    } catch (err) {
      setState(prev => ({ 
        ...prev, 
        statusError: String(err),
        statusLoading: false 
      }));
    }
  };

  /** 加载模型配置 */
  const loadModelConfig = async () => {
    try {
      const result = await window.electronAPI.modelsGetConfig();
      if (result.success) {
        setState(prev => ({
          ...prev,
          primaryModel: result.primary || '',
          configuredModels: result.configuredModels || {},
          customProviders: result.providers || {},
        }));
      }
    } catch (err) {
      console.error('加载模型配置失败:', err);
    }
  };

  /** 页面挂载时并行加载所有数据 */
  useEffect(() => {
    Promise.all([
      loadProviderStatus(),
      loadModelConfig(),
    ]);
  }, []);

  // 解析默认提供商
  const defaultProvider = state.primaryModel.includes('/') 
    ? state.primaryModel.split('/')[0] 
    : '';

  // 当默认提供商加载完成且没有选中任何提供商时，自动选中默认提供商
  useEffect(() => {
    if (defaultProvider && !selectedProviderId) {
      setSelectedProviderId(defaultProvider);
    }
  }, [defaultProvider, selectedProviderId]);

  // 合并官方提供商和自定义提供商
  const allProviders: ProviderItem[] = [
    // 官方提供商
    ...mergeProviderStatuses(PROVIDER_LIST, state.providerStatuses).map(p => {
      const providerConfig = state.customProviders[p.id];
      const isConfigured = !!providerConfig;
      const modelCount = providerConfig?.models?.length || 0;
      
      // 从 PROVIDER_LIST 中获取原始定义以获取元数据
      const providerDef = PROVIDER_LIST.find(pd => pd.id === p.id);
      
      return {
        id: p.id,
        name: p.name,
        category: p.category,
        description: p.description,
        authStatus: p.authStatus,
        isConfigured,
        isDefault: p.id === defaultProvider,
        modelCount,
        baseUrl: providerConfig?.baseUrl,
        apiKey: providerConfig?.apiKey,
        // 添加元数据
        authType: providerDef?.authType,
        envVar: providerDef?.envVar,
        requiresConfig: providerDef?.requiresConfig,
        defaultBaseUrl: providerDef?.defaultBaseUrl,
        apiType: providerDef?.apiType,
      };
    }),
    // 自定义提供商（不在官方列表中的）
    ...Object.entries(state.customProviders)
      .filter(([id]) => !PROVIDER_LIST.some(p => p.id === id))
      .map(([id, config]) => ({
        id,
        name: config.name || id,
        category: 'llm' as const,
        description: '自定义提供商',
        authStatus: state.providerStatuses[id] || 'unknown' as const,
        isConfigured: true,
        isDefault: id === defaultProvider,
        modelCount: config.models?.length || 0,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        // 自定义提供商默认值
        authType: 'api-key' as const,
        requiresConfig: true,
      })),
    // 虚拟的"添加自定义提供商"条目（用于右侧面板显示表单）
    {
      id: '__add_custom__',
      name: '添加自定义提供商',
      category: 'llm' as const,
      description: '',
      authStatus: 'unknown' as const,
      isConfigured: false,
      isDefault: false,
      modelCount: 0,
      authType: 'api-key' as const,
      requiresConfig: true,
    },
  ];

  // 选中的提供商
  const selectedProvider = selectedProviderId 
    ? (allProviders.find(p => p.id === selectedProviderId) || null)
    : null;

  // 选中提供商的模型列表
  const selectedProviderModels: ModelItem[] = selectedProvider && selectedProvider.isConfigured
    ? (state.customProviders[selectedProvider.id]?.models || []).map(model => {
        const fullId = `${selectedProvider.id}/${model.id}`;
        const aliasConfig = state.configuredModels[fullId];
        const isDefault = state.primaryModel === fullId;
        
        return {
          id: model.id,
          name: model.name || model.id,
          fullId,
          alias: aliasConfig?.alias,
          isDefault,
          reasoning: model.reasoning,
          input: model.input,
          contextWindow: model.contextWindow,
          maxTokens: model.maxTokens,
          cost: model.cost,
        };
      })
    : [];

  /** 处理设置默认模型 */
  const handleSetDefaultModel = async (fullId: string) => {
    try {
      const result = await window.electronAPI.modelsSetPrimary(fullId);
      if (result.success) {
        setState(prev => ({ ...prev, primaryModel: fullId }));
        showMessage('默认模型已设置', 'success');
      } else {
        throw new Error(result.error || '设置失败');
      }
    } catch (err) {
      showMessage(`设置默认模型失败: ${err}`, 'error');
      throw err;
    }
  };

  /** 处理删除模型 */
  const handleDeleteModel = async (modelId: string) => {
    if (!selectedProviderId) return;
    
    try {
      const result = await window.electronAPI.modelsModelRemove(selectedProviderId, modelId);
      if (result.success) {
        // 重新加载配置以更新 UI
        await loadModelConfig();
        showMessage('模型已删除', 'success');
      } else {
        throw new Error(result.error || '删除失败');
      }
    } catch (err) {
      showMessage(`删除模型失败: ${err}`, 'error');
      throw err;
    }
  };

  /** 处理添加模型 */
  const handleAddModel = async (providerId: string, model: { id: string; name: string; alias?: string; contextWindow?: number; maxTokens?: number }) => {
    try {
      const result = await window.electronAPI.modelsModelAdd(providerId, model);
      if (result.success) {
        await loadModelConfig();
        showMessage('模型已添加', 'success');
      } else {
        throw new Error(result.error || '添加失败');
      }
    } catch (err) {
      showMessage(`添加模型失败: ${err}`, 'error');
      throw err;
    }
  };

  /** 处理编辑模型 */
  const handleEditModel = async (providerId: string, modelId: string, updates: { [key: string]: any }) => {
    try {
      const result = await window.electronAPI.modelsModelUpdate(providerId, modelId, updates);
      if (result.success) {
        await loadModelConfig();
        showMessage('模型已更新', 'success');
      } else {
        throw new Error(result.error || '更新失败');
      }
    } catch (err) {
      showMessage(`更新模型失败: ${err}`, 'error');
      throw err;
    }
  };

  /** 处理保存提供商配置 */
  const handleSaveProviderConfig = async (providerId: string, config: { baseUrl?: string; apiKey?: string }) => {
    try {
      const result = await window.electronAPI.modelsProviderConfigSave(providerId, config);
      if (result.success) {
        await loadModelConfig();
        await loadProviderStatus(); // 重新加载认证状态
        showMessage('提供商配置已保存', 'success');
      } else {
        throw new Error(result.error || '保存失败');
      }
    } catch (err) {
      showMessage(`保存提供商配置失败: ${err}`, 'error');
      throw err;
    }
  };

  /** 处理添加自定义提供商 */
  const handleAddCustomProvider = async (provider: { 
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
  }) => {
    try {
      // 检查提供商 ID 是否已存在
      const existingProvider = allProviders.find(p => p.id === provider.id && p.id !== '__add_custom__');
      if (existingProvider) {
        showMessage(`提供商 ID "${provider.id}" 已存在`, 'error');
        return;
      }

      // 验证 Base URL 格式
      if (!provider.baseUrl) {
        showMessage('Base URL 是必填项', 'error');
        return;
      }

      try {
        new URL(provider.baseUrl);
      } catch {
        showMessage('Base URL 格式无效，请输入完整的 URL（如 https://api.example.com/v1）', 'error');
        return;
      }

      // 创建新的提供商配置（使用 modelsProviderConfigSave）
      // 这会在 models.providers 中创建一个新条目
      const result = await window.electronAPI.modelsProviderConfigSave(provider.id, {
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        api: provider.api,
      });

      if (result.success) {
        // 添加第一个模型
        const modelResult = await window.electronAPI.modelsModelAdd(provider.id, {
          id: provider.firstModel.id,
          name: provider.firstModel.name,
        });

        if (modelResult.success) {
          showMessage(`自定义提供商 "${provider.name}" 已添加`, 'success');
          // 重新加载配置
          await loadModelConfig();
          await loadProviderStatus();
          // 自动选中新添加的提供商
          setSelectedProviderId(provider.id);
        } else {
          showMessage(`提供商已创建，但添加模型失败: ${modelResult.error || '未知错误'}`, 'error');
          // 仍然重新加载配置和选中提供商
          await loadModelConfig();
          await loadProviderStatus();
          setSelectedProviderId(provider.id);
        }
      } else {
        showMessage(`添加失败: ${result.error || '未知错误'}`, 'error');
      }
    } catch (err) {
      showMessage(`添加失败: ${err}`, 'error');
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* 顶部操作栏 */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold" style={{ color: 'var(--app-text)' }}>
            {t('settings.models')}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <AppButton
            variant="secondary"
            onClick={loadProviderStatus}
            disabled={state.statusLoading}
            icon={<RefreshCw size={14} />}
          >
            {t('settings.models.refreshStatus')}
          </AppButton>
        </div>
      </div>

      {/* 全局消息提示 */}
      {message && (
        <div
          className="mb-3 rounded-xl px-4 py-3 text-sm"
          style={{
            backgroundColor: messageType === 'success' 
              ? 'rgba(34, 197, 94, 0.10)' 
              : 'rgba(239, 68, 68, 0.10)',
            border: messageType === 'success'
              ? '1px solid rgba(34, 197, 94, 0.30)'
              : '1px solid rgba(239, 68, 68, 0.30)',
            color: messageType === 'success' ? '#4ADE80' : '#F87171',
          }}
        >
          {message}
        </div>
      )}

      {/* 两栏固定布局 */}
      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* 左侧提供商列表 */}
        <ProvidersList
          providers={allProviders}
          selectedProviderId={selectedProviderId}
          onSelectProvider={setSelectedProviderId}
        />

        {/* 右侧内容区 — 独立滚动 */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-0.5">
          <ProviderDetail
            provider={selectedProvider}
            models={selectedProviderModels}
            onSetDefaultModel={handleSetDefaultModel}
            onDeleteModel={handleDeleteModel}
            onEditModel={handleEditModel}
            onAddModel={handleAddModel}
            onSaveProviderConfig={handleSaveProviderConfig}
            onAddCustomProvider={handleAddCustomProvider}
            onCancelAddCustom={() => setSelectedProviderId(null)}
          />
        </div>
      </div>
    </div>
  );
};

export default SettingsModels;
