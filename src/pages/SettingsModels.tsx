import React, { useEffect, useState } from 'react';
import { Bot, RefreshCw, Plus, Trash2, CheckCircle, XCircle, HelpCircle, Play, Search } from 'lucide-react';
import AppButton from '../components/AppButton';
import GlassCard from '../components/GlassCard';
import { useI18n } from '../i18n/I18nContext';
import { PROVIDER_LIST, mergeProviderStatuses } from '../config/providers';
import { isValidModelFormat, addFallback, removeFallback } from '../utils/modelFormat';
import type { ProviderAuthStatus, ModelAlias } from '../types/electron';

/** 主组件状态结构 */
interface SettingsModelsState {
  // 提供商认证状态
  providerStatuses: Record<string, ProviderAuthStatus>;
  statusLoading: boolean;
  statusError: string;

  // 主模型
  primaryModel: string;
  primaryModelDraft: string;
  primaryModelSaving: boolean;
  primaryModelError: string;

  // 备用模型
  fallbacks: string[];
  fallbacksLoading: boolean;

  // 别名
  aliases: ModelAlias[];
  aliasesLoading: boolean;

  // 操作状态
  onboardRunning: boolean;
  scanRunning: boolean;
  scanResult: string;
}

const SettingsModels: React.FC = () => {
  const { t } = useI18n();

  // 状态管理
  const [state, setState] = useState<SettingsModelsState>({
    providerStatuses: {},
    statusLoading: true,
    statusError: '',
    primaryModel: '',
    primaryModelDraft: '',
    primaryModelSaving: false,
    primaryModelError: '',
    fallbacks: [],
    fallbacksLoading: false,
    aliases: [],
    aliasesLoading: false,
    onboardRunning: false,
    scanRunning: false,
    scanResult: '',
  });

  const [message, setMessage] = useState('');
  const [newFallback, setNewFallback] = useState('');
  const [newAliasName, setNewAliasName] = useState('');
  const [newAliasTarget, setNewAliasTarget] = useState('');

  /** 显示临时消息（4秒后自动消失） */
  const showMessage = (msg: string) => {
    setMessage(msg);
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

  /** 加载模型配置（主模型 + 备用列表） */
  const loadModelConfig = async () => {
    try {
      const result = await window.electronAPI.modelsGetConfig();
      if (result.success) {
        const primary = result.primary || '';
        setState(prev => ({
          ...prev,
          primaryModel: primary,
          primaryModelDraft: primary,
          fallbacks: result.fallbacks || [],
        }));
      }
    } catch (err) {
      console.error('加载模型配置失败:', err);
    }
  };

  /** 加载别名列表 */
  const loadAliases = async () => {
    setState(prev => ({ ...prev, aliasesLoading: true }));
    try {
      const result = await window.electronAPI.modelsAliasesList();
      if (result.success && result.aliases) {
        const aliasArray: ModelAlias[] = Object.entries(result.aliases).map(([alias, target]) => ({
          alias,
          target: String(target),
        }));
        setState(prev => ({ ...prev, aliases: aliasArray, aliasesLoading: false }));
      } else {
        setState(prev => ({ ...prev, aliases: [], aliasesLoading: false }));
      }
    } catch (err) {
      setState(prev => ({ ...prev, aliases: [], aliasesLoading: false }));
    }
  };

  /** 页面挂载时并行加载所有数据 */
  useEffect(() => {
    Promise.all([
      loadProviderStatus(),
      loadModelConfig(),
      loadAliases(),
    ]);
  }, []);

  /** 运行 Onboard 向导 */
  const handleRunOnboard = async () => {
    setState(prev => ({ ...prev, onboardRunning: true }));
    try {
      const result = await window.electronAPI.modelsOnboard();
      if (result.success) {
        showMessage(t('settings.models.onboardSuccess'));
        // 完成后自动刷新认证状态
        await loadProviderStatus();
      } else {
        showMessage(`${t('settings.models.onboardError')}: ${result.error || ''}`);
      }
    } catch (err) {
      showMessage(`${t('settings.models.onboardError')}: ${err}`);
    } finally {
      setState(prev => ({ ...prev, onboardRunning: false }));
    }
  };

  /** 扫描可用模型 */
  const handleScanModels = async () => {
    setState(prev => ({ ...prev, scanRunning: true, scanResult: '' }));
    try {
      const result = await window.electronAPI.modelsScan();
      if (result.success) {
        setState(prev => ({ ...prev, scanResult: result.output || '', scanRunning: false }));
        showMessage(t('settings.models.scanSuccess'));
      } else {
        showMessage(`${t('settings.models.scanError')}: ${result.error || ''}`);
        setState(prev => ({ ...prev, scanRunning: false }));
      }
    } catch (err) {
      showMessage(`${t('settings.models.scanError')}: ${err}`);
      setState(prev => ({ ...prev, scanRunning: false }));
    }
  };

  /** 保存主模型 */
  const handleSavePrimaryModel = async () => {
    const model = state.primaryModelDraft.trim();
    
    // 格式校验
    if (!isValidModelFormat(model)) {
      setState(prev => ({ ...prev, primaryModelError: t('settings.models.primaryModelFormatError') }));
      return;
    }

    setState(prev => ({ ...prev, primaryModelSaving: true, primaryModelError: '' }));
    try {
      const result = await window.electronAPI.modelsSetPrimary(model);
      if (result.success) {
        setState(prev => ({ ...prev, primaryModel: model, primaryModelSaving: false }));
        showMessage(t('settings.models.primaryModelSaved'));
      } else {
        setState(prev => ({ 
          ...prev, 
          primaryModelError: result.error || t('settings.models.primaryModelSaveError'),
          primaryModelSaving: false 
        }));
      }
    } catch (err) {
      setState(prev => ({ 
        ...prev, 
        primaryModelError: String(err),
        primaryModelSaving: false 
      }));
    }
  };

  /** 添加备用模型 */
  const handleAddFallback = async () => {
    const model = newFallback.trim();
    
    // 格式校验
    if (!isValidModelFormat(model)) {
      showMessage(t('settings.models.fallbackFormatError'));
      return;
    }

    // 重复检查
    if (state.fallbacks.includes(model)) {
      showMessage(t('settings.models.fallbackDuplicate'));
      return;
    }

    try {
      const result = await window.electronAPI.modelsFallbackAdd(model);
      if (result.success) {
        setState(prev => ({ ...prev, fallbacks: addFallback(prev.fallbacks, model) }));
        setNewFallback('');
      } else {
        showMessage(`错误: ${result.error || '添加失败'}`);
      }
    } catch (err) {
      showMessage(`错误: ${err}`);
    }
  };

  /** 移除备用模型 */
  const handleRemoveFallback = async (model: string) => {
    if (!confirm(t('settings.models.fallbackRemoveConfirm'))) {
      return;
    }

    try {
      const result = await window.electronAPI.modelsFallbackRemove(model);
      if (result.success) {
        setState(prev => ({ ...prev, fallbacks: removeFallback(prev.fallbacks, model) }));
      } else {
        showMessage(`错误: ${result.error || '移除失败'}`);
      }
    } catch (err) {
      showMessage(`错误: ${err}`);
    }
  };

  /** 添加别名 */
  const handleAddAlias = async () => {
    const alias = newAliasName.trim();
    const target = newAliasTarget.trim();

    if (!alias) {
      showMessage('别名名称不能为空');
      return;
    }

    // 目标格式校验
    if (!isValidModelFormat(target)) {
      showMessage(t('settings.models.aliasFormatError'));
      return;
    }

    // 检查是否已存在
    const existing = state.aliases.find(a => a.alias === alias);
    if (existing) {
      if (!confirm(t('settings.models.aliasDuplicate'))) {
        return;
      }
    }

    try {
      const result = await window.electronAPI.modelsAliasAdd(alias, target);
      if (result.success) {
        await loadAliases();
        setNewAliasName('');
        setNewAliasTarget('');
      } else {
        showMessage(`错误: ${result.error || '添加失败'}`);
      }
    } catch (err) {
      showMessage(`错误: ${err}`);
    }
  };

  /** 移除别名 */
  const handleRemoveAlias = async (alias: string) => {
    if (!confirm(t('settings.models.aliasRemoveConfirm'))) {
      return;
    }

    try {
      const result = await window.electronAPI.modelsAliasRemove(alias);
      if (result.success) {
        await loadAliases();
      } else {
        showMessage(`错误: ${result.error || '移除失败'}`);
      }
    } catch (err) {
      showMessage(`错误: ${err}`);
    }
  };

  // 合并静态提供商列表与运行时状态
  const mergedProviders = mergeProviderStatuses(PROVIDER_LIST, state.providerStatuses);
  const llmProviders = mergedProviders.filter(p => p.category === 'llm');
  const transcriptionProviders = mergedProviders.filter(p => p.category === 'transcription');

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
      <div 
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
        style={{ backgroundColor: bg, color }}
      >
        <Icon size={12} />
        {text}
      </div>
    );
  };

  /** 渲染提供商卡片 */
  const renderProviderCard = (provider: typeof mergedProviders[0]) => (
    <div
      key={provider.id}
      className="flex items-center justify-between rounded-xl p-3"
      style={{
        backgroundColor: 'var(--app-bg-subtle)',
        border: '1px solid var(--app-border)',
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: 'rgba(129, 140, 248, 0.12)', color: '#818CF8' }}
        >
          <Bot size={16} />
        </div>
        <div>
          <div className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
            {provider.name}
          </div>
          {provider.description && (
            <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
              {provider.description}
            </div>
          )}
        </div>
      </div>
      {renderStatusBadge(provider.authStatus)}
    </div>
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-6 p-1">
      {/* 全局消息提示 */}
      {message && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{
            backgroundColor: 'rgba(34, 197, 94, 0.10)',
            border: '1px solid rgba(34, 197, 94, 0.30)',
            color: '#4ADE80',
          }}
        >
          {message}
        </div>
      )}

      {/* 提供商列表区块 */}
      <GlassCard className="rounded-2xl p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: 'rgba(129, 140, 248, 0.12)', color: '#818CF8' }}
            >
              <Bot size={18} />
            </div>
            <div className="flex-1">
              <div className="text-[15px] font-semibold" style={{ color: 'var(--app-text)' }}>
                {t('settings.models.providers')}
              </div>
              <div className="mt-1 text-sm leading-6" style={{ color: 'var(--app-text-muted)' }}>
                {t('settings.models.providersDescription')}
              </div>
            </div>
          </div>
          <AppButton
            variant="secondary"
            size="sm"
            icon={<RefreshCw size={14} />}
            onClick={loadProviderStatus}
            disabled={state.statusLoading}
          >
            {t('settings.models.refreshStatus')}
          </AppButton>
        </div>

        {/* 错误提示 */}
        {state.statusError && (
          <div
            className="rounded-xl px-4 py-3 text-sm"
            style={{
              backgroundColor: 'rgba(244, 63, 94, 0.10)',
              border: '1px solid rgba(244, 63, 94, 0.30)',
              color: '#FB7185',
            }}
          >
            {t('settings.models.statusLoadError')}: {state.statusError}
          </div>
        )}

        {/* LLM 提供商 */}
        <div className="space-y-2">
          <div className="text-sm font-semibold" style={{ color: 'var(--app-text)' }}>
            {t('settings.models.categoryLlm')} ({llmProviders.length})
          </div>
          <div className="grid grid-cols-1 gap-2">
            {llmProviders.map(renderProviderCard)}
          </div>
        </div>

        {/* 转录提供商 */}
        {transcriptionProviders.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-semibold" style={{ color: 'var(--app-text)' }}>
              {t('settings.models.categoryTranscription')} ({transcriptionProviders.length})
            </div>
            <div className="grid grid-cols-1 gap-2">
              {transcriptionProviders.map(renderProviderCard)}
            </div>
          </div>
        )}
      </GlassCard>

      {/* Onboard / Scan 操作区块 */}
      <GlassCard className="rounded-2xl p-5 space-y-4">
        <div className="flex items-start gap-4">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: 'rgba(129, 140, 248, 0.12)', color: '#818CF8' }}
          >
            <Play size={18} />
          </div>
          <div className="flex-1">
            <div className="text-[15px] font-semibold" style={{ color: 'var(--app-text)' }}>
              {t('settings.models.actions')}
            </div>
          </div>
        </div>

        {/* Onboard 向导 */}
        <div className="space-y-2">
          <div className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
            {t('settings.models.runOnboard')}
          </div>
          <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
            {t('settings.models.runOnboardDescription')}
          </div>
          <AppButton
            variant="primary"
            icon={<Play size={14} />}
            onClick={handleRunOnboard}
            disabled={state.onboardRunning}
          >
            {state.onboardRunning ? t('settings.models.onboardRunning') : t('settings.models.runOnboard')}
          </AppButton>
        </div>

        {/* 模型扫描 */}
        <div className="space-y-2">
          <div className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
            {t('settings.models.scanModels')}
          </div>
          <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
            {t('settings.models.scanModelsDescription')}
          </div>
          <AppButton
            variant="secondary"
            icon={<Search size={14} />}
            onClick={handleScanModels}
            disabled={state.scanRunning}
          >
            {state.scanRunning ? t('settings.models.scanRunning') : t('settings.models.scanModels')}
          </AppButton>

          {/* 扫描结果 */}
          {state.scanResult && (
            <pre
              className="mt-3 rounded-xl px-4 py-3 text-xs overflow-auto max-h-48"
              style={{
                backgroundColor: 'var(--app-bg-subtle)',
                border: '1px solid var(--app-border)',
                color: 'var(--app-text-muted)',
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {state.scanResult}
            </pre>
          )}
        </div>
      </GlassCard>

      {/* 主模型设置区块 */}
      <GlassCard className="rounded-2xl p-5 space-y-4">
        <div className="flex items-start gap-4">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: 'rgba(129, 140, 248, 0.12)', color: '#818CF8' }}
          >
            <Bot size={18} />
          </div>
          <div className="flex-1">
            <div className="text-[15px] font-semibold" style={{ color: 'var(--app-text)' }}>
              {t('settings.models.primaryModel')}
            </div>
            <div className="mt-1 text-sm leading-6" style={{ color: 'var(--app-text-muted)' }}>
              {t('settings.models.primaryModelDescription')}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <input
            type="text"
            value={state.primaryModelDraft}
            onChange={(e) => setState(prev => ({ ...prev, primaryModelDraft: e.target.value, primaryModelError: '' }))}
            placeholder={t('settings.models.primaryModelPlaceholder')}
            className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition-all duration-200 focus:ring-2 focus:ring-blue-500/20"
            style={{
              backgroundColor: 'var(--app-bg-subtle)',
              borderColor: state.primaryModelError ? '#FB7185' : 'var(--app-border)',
              color: 'var(--app-text)',
            }}
          />
          
          {/* 格式错误提示 */}
          {state.primaryModelError && (
            <div className="text-xs" style={{ color: '#FB7185' }}>
              {state.primaryModelError}
            </div>
          )}

          <AppButton
            variant="primary"
            onClick={handleSavePrimaryModel}
            disabled={state.primaryModelSaving || state.primaryModelDraft === state.primaryModel}
          >
            {state.primaryModelSaving ? '保存中...' : t('settings.models.primaryModelSave')}
          </AppButton>
        </div>
      </GlassCard>

      {/* 备用模型列表区块 */}
      <GlassCard className="rounded-2xl p-5 space-y-4">
        <div className="flex items-start gap-4">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: 'rgba(129, 140, 248, 0.12)', color: '#818CF8' }}
          >
            <Bot size={18} />
          </div>
          <div className="flex-1">
            <div className="text-[15px] font-semibold" style={{ color: 'var(--app-text)' }}>
              {t('settings.models.fallbacks')}
            </div>
            <div className="mt-1 text-sm leading-6" style={{ color: 'var(--app-text-muted)' }}>
              {t('settings.models.fallbacksDescription')}
            </div>
          </div>
        </div>

        {/* 添加备用模型 */}
        <div className="flex gap-2">
          <input
            type="text"
            value={newFallback}
            onChange={(e) => setNewFallback(e.target.value)}
            placeholder={t('settings.models.fallbackPlaceholder')}
            className="flex-1 rounded-xl border px-4 py-2 text-sm outline-none transition-all duration-200 focus:ring-2 focus:ring-blue-500/20"
            style={{
              backgroundColor: 'var(--app-bg-subtle)',
              borderColor: 'var(--app-border)',
              color: 'var(--app-text)',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleAddFallback();
              }
            }}
          />
          <AppButton
            variant="primary"
            size="sm"
            icon={<Plus size={14} />}
            onClick={handleAddFallback}
          >
            {t('settings.models.fallbackAdd')}
          </AppButton>
        </div>

        {/* 备用模型列表 */}
        {state.fallbacks.length === 0 ? (
          <div className="text-sm text-center py-4" style={{ color: 'var(--app-text-muted)' }}>
            {t('settings.models.fallbackEmpty')}
          </div>
        ) : (
          <div className="space-y-2">
            {state.fallbacks.map((model, index) => (
              <div
                key={index}
                className="flex items-center justify-between rounded-xl p-3"
                style={{
                  backgroundColor: 'var(--app-bg-subtle)',
                  border: '1px solid var(--app-border)',
                }}
              >
                <div className="text-sm font-mono" style={{ color: 'var(--app-text)' }}>
                  {model}
                </div>
                <button
                  onClick={() => handleRemoveFallback(model)}
                  className="text-red-400 hover:text-red-300 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* 别名管理区块 */}
      <GlassCard className="rounded-2xl p-5 space-y-4">
        <div className="flex items-start gap-4">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: 'rgba(129, 140, 248, 0.12)', color: '#818CF8' }}
          >
            <Bot size={18} />
          </div>
          <div className="flex-1">
            <div className="text-[15px] font-semibold" style={{ color: 'var(--app-text)' }}>
              {t('settings.models.aliases')}
            </div>
            <div className="mt-1 text-sm leading-6" style={{ color: 'var(--app-text-muted)' }}>
              {t('settings.models.aliasesDescription')}
            </div>
          </div>
        </div>

        {/* 添加别名 */}
        <div className="space-y-2">
          <input
            type="text"
            value={newAliasName}
            onChange={(e) => setNewAliasName(e.target.value)}
            placeholder={t('settings.models.aliasName')}
            className="w-full rounded-xl border px-4 py-2 text-sm outline-none transition-all duration-200 focus:ring-2 focus:ring-blue-500/20"
            style={{
              backgroundColor: 'var(--app-bg-subtle)',
              borderColor: 'var(--app-border)',
              color: 'var(--app-text)',
            }}
          />
          <input
            type="text"
            value={newAliasTarget}
            onChange={(e) => setNewAliasTarget(e.target.value)}
            placeholder={t('settings.models.aliasTarget')}
            className="w-full rounded-xl border px-4 py-2 text-sm outline-none transition-all duration-200 focus:ring-2 focus:ring-blue-500/20"
            style={{
              backgroundColor: 'var(--app-bg-subtle)',
              borderColor: 'var(--app-border)',
              color: 'var(--app-text)',
            }}
          />
          <AppButton
            variant="primary"
            size="sm"
            icon={<Plus size={14} />}
            onClick={handleAddAlias}
          >
            {t('settings.models.aliasAdd')}
          </AppButton>
        </div>

        {/* 别名列表 */}
        {state.aliases.length === 0 ? (
          <div className="text-sm text-center py-4" style={{ color: 'var(--app-text-muted)' }}>
            {t('settings.models.aliasEmpty')}
          </div>
        ) : (
          <div className="space-y-2">
            {state.aliases.map((item, index) => (
              <div
                key={index}
                className="flex items-center justify-between rounded-xl p-3"
                style={{
                  backgroundColor: 'var(--app-bg-subtle)',
                  border: '1px solid var(--app-border)',
                }}
              >
                <div className="flex-1">
                  <div className="text-sm font-semibold" style={{ color: 'var(--app-text)' }}>
                    {item.alias}
                  </div>
                  <div className="text-xs font-mono" style={{ color: 'var(--app-text-muted)' }}>
                    → {item.target}
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveAlias(item.alias)}
                  className="text-red-400 hover:text-red-300 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
      </div>
    </div>
  );
};

export default SettingsModels;
