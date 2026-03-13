/**
 * 提供商列表组件（左侧边栏）
 * 显示已配置和未配置的提供商，默认提供商置顶
 */

import React from 'react';
import { Star, ChevronRight, Plus } from 'lucide-react';
import AppButton from '../../../components/AppButton';
import type { ProviderAuthStatus } from '../../../types/electron';

/** 提供商条目 */
export interface ProviderItem {
  id: string;
  name: string;
  category: 'llm' | 'transcription';
  description?: string;
  authStatus: ProviderAuthStatus;
  // 配置信息
  isConfigured: boolean; // 是否在 models.providers 中配置
  isDefault: boolean; // 是否是默认提供商
  modelCount: number; // 该提供商配置的模型数量
  baseUrl?: string;
  apiKey?: string;
  // 元数据（来自 PROVIDER_LIST）
  authType?: 'api-key' | 'oauth' | 'none';
  envVar?: string;
  requiresConfig?: boolean;
  defaultBaseUrl?: string;
  apiType?: 'openai-completions' | 'anthropic-messages' | 'custom';
}

interface ProvidersListProps {
  providers: ProviderItem[];
  selectedProviderId: string | null;
  onSelectProvider: (id: string) => void;
}

const ProvidersList: React.FC<ProvidersListProps> = ({
  providers,
  selectedProviderId,
  onSelectProvider,
}) => {
  /** 处理添加自定义提供商按钮点击 */
  const handleAddClick = () => {
    onSelectProvider('__add_custom__');
  };

  // 排序：默认提供商 > 已配置 > 未配置
  const sortedProviders = [...providers].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    if (a.isConfigured !== b.isConfigured) return a.isConfigured ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  // 分组
  const configuredProviders = sortedProviders.filter(p => p.isConfigured);
  const unconfiguredProviders = sortedProviders.filter(p => !p.isConfigured);

  const renderProviderButton = (provider: ProviderItem) => {
    const isActive = provider.id === selectedProviderId;
    
    return (
      <button
        key={provider.id}
        type="button"
        onClick={() => onSelectProvider(provider.id)}
        className="w-full rounded-xl px-3 py-2.5 text-left transition-all duration-150"
        style={{
          backgroundColor: isActive ? 'rgba(96, 165, 250, 0.15)' : 'transparent',
          boxShadow: isActive ? 'inset 0 0 0 1px rgba(96, 165, 250, 0.22)' : 'none',
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {/* 默认标识 */}
            {provider.isDefault && (
              <Star
                size={14}
                fill="#FCD34D"
                style={{ color: '#FCD34D', flexShrink: 0 }}
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate" style={{ color: isActive ? '#60a5fa' : 'var(--app-text)' }}>
                {provider.name}
              </div>
              {provider.isConfigured && (
                <div className="text-xs mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
                  {provider.modelCount} 个模型
                </div>
              )}
              {!provider.isConfigured && provider.description && (
                <div className="text-xs truncate mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
                  {provider.description}
                </div>
              )}
            </div>
          </div>
          {isActive && <ChevronRight size={14} style={{ color: '#60a5fa', flexShrink: 0 }} />}
        </div>
      </button>
    );
  };

  return (
    <div
      className="w-[280px] shrink-0 overflow-y-auto rounded-[20px] border p-3"
      style={{
        backgroundColor: 'var(--app-bg-elevated)',
        borderColor: 'var(--app-border)',
      }}
    >
      <div className="space-y-0.5">
        {/* 已配置的提供商 */}
        {configuredProviders.length > 0 && (
          <>
            <div className="px-3 py-2 text-xs font-semibold" style={{ color: 'var(--app-text-muted)' }}>
              已配置提供商
            </div>
            {configuredProviders.map(renderProviderButton)}
          </>
        )}

        {/* 未配置的提供商 */}
        {unconfiguredProviders.length > 0 && (
          <>
            <div className="px-3 py-2 text-xs font-semibold mt-3" style={{ color: 'var(--app-text-muted)' }}>
              可用提供商
            </div>
            {unconfiguredProviders.map(renderProviderButton)}
          </>
        )}

        {/* 添加自定义提供商按钮 */}
        <div className="mt-4 pt-3 border-t" style={{ borderColor: 'var(--app-border)' }}>
          <AppButton
            variant="secondary"
            size="xs"
            icon={<Plus size={14} />}
            onClick={handleAddClick}
            className="w-full"
          >
            添加自定义提供商
          </AppButton>
        </div>
      </div>
    </div>
  );
};

export default ProvidersList;
