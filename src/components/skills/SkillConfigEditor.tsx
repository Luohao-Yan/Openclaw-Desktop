/**
 * SkillConfigEditor — 技能配置编辑器
 *
 * 使用 AppModal 统一弹窗结构，包含：
 * - apiKey 输入框（密码模式）
 * - env 键值对编辑器（可增删改）
 * - config 键值对编辑器（可增删改）
 * - 必需项高亮提示
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Save, Plus, Trash2, AlertTriangle,
  RefreshCw, Key, Settings, Globe,
} from 'lucide-react';
import AppButton from '../AppButton';
import AppModal from '../AppModal';
import type { SkillEntryConfig } from '../../types/electron';

/** 组件属性 */
interface SkillConfigEditorProps {
  /** 是否显示编辑器 */
  isOpen: boolean;
  /** 关闭编辑器回调 */
  onClose: () => void;
  /** 保存成功后的回调 */
  onSuccess?: () => void;
  /** 技能 ID */
  skillId: string;
  /** 技能名称（用于标题显示） */
  skillName: string;
  /** 技能依赖声明（用于高亮必需项） */
  requires?: {
    bins?: string[];
    env?: string[];
    config?: string[];
  };
}

/** 键值对条目 */
interface KvEntry {
  key: string;
  value: string;
}

/** 将 Record 转换为 KvEntry 数组 */
function recordToEntries(record?: Record<string, string | unknown>): KvEntry[] {
  if (!record) return [];
  return Object.entries(record).map(([key, value]) => ({
    key,
    value: typeof value === 'string' ? value : JSON.stringify(value),
  }));
}

/** 将 KvEntry 数组转换为 Record（过滤空 key） */
function entriesToRecord(entries: KvEntry[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const { key, value } of entries) {
    const trimmedKey = key.trim();
    if (trimmedKey) {
      result[trimmedKey] = value;
    }
  }
  return result;
}

/** 将 KvEntry 数组转换为 config Record（尝试解析 JSON 值） */
function entriesToConfigRecord(entries: KvEntry[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const { key, value } of entries) {
    const trimmedKey = key.trim();
    if (!trimmedKey) continue;
    // 尝试解析 JSON 值
    try {
      result[trimmedKey] = JSON.parse(value);
    } catch {
      result[trimmedKey] = value;
    }
  }
  return result;
}

const SkillConfigEditor: React.FC<SkillConfigEditorProps> = ({
  isOpen,
  onClose,
  onSuccess,
  skillId,
  skillName,
  requires,
}) => {
  // ── 状态 ──────────────────────────────────────────────────────────────
  /** 是否正在加载 */
  const [loading, setLoading] = useState(false);
  /** 是否正在保存 */
  const [saving, setSaving] = useState(false);
  /** 错误信息 */
  const [error, setError] = useState('');
  /** apiKey 值 */
  const [apiKey, setApiKey] = useState('');
  /** apiKey 是否为对象类型（不可直接编辑） */
  const [apiKeyIsObject, setApiKeyIsObject] = useState(false);
  /** 环境变量条目 */
  const [envEntries, setEnvEntries] = useState<KvEntry[]>([]);
  /** 自定义配置条目 */
  const [configEntries, setConfigEntries] = useState<KvEntry[]>([]);

  // ── 加载当前配置 ─────────────────────────────────────────────────────
  const loadConfig = useCallback(async () => {
    if (!skillId) return;
    setLoading(true);
    setError('');

    try {
      const result = await window.electronAPI.skillsGetConfig(skillId);

      if (result.success && result.config) {
        const cfg = result.config;

        // 处理 apiKey
        if (typeof cfg.apiKey === 'object' && cfg.apiKey !== null) {
          setApiKeyIsObject(true);
          setApiKey(JSON.stringify(cfg.apiKey));
        } else {
          setApiKeyIsObject(false);
          setApiKey((cfg.apiKey as string) || '');
        }

        // 处理 env
        setEnvEntries(recordToEntries(cfg.env));

        // 处理 config
        setConfigEntries(recordToEntries(cfg.config));
      } else {
        // 没有现有配置，初始化为空
        setApiKey('');
        setApiKeyIsObject(false);
        setEnvEntries([]);
        setConfigEntries([]);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`加载配置失败: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [skillId]);

  // ── 对话框打开时加载配置 ──────────────────────────────────────────────
  useEffect(() => {
    if (isOpen && skillId) {
      void loadConfig();
    }
    if (!isOpen) {
      // 关闭时重置状态
      setApiKey('');
      setApiKeyIsObject(false);
      setEnvEntries([]);
      setConfigEntries([]);
      setError('');
    }
  }, [isOpen, skillId, loadConfig]);

  // ── 保存配置 ─────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setError('');

    try {
      const newConfig: SkillEntryConfig = {};

      // apiKey
      if (apiKey.trim()) {
        if (apiKeyIsObject) {
          try {
            newConfig.apiKey = JSON.parse(apiKey);
          } catch {
            setError('API Key JSON 格式无效');
            setSaving(false);
            return;
          }
        } else {
          newConfig.apiKey = apiKey.trim();
        }
      }

      // env
      const envRecord = entriesToRecord(envEntries);
      if (Object.keys(envRecord).length > 0) {
        newConfig.env = envRecord;
      }

      // config
      const configRecord = entriesToConfigRecord(configEntries);
      if (Object.keys(configRecord).length > 0) {
        newConfig.config = configRecord;
      }

      const result = await window.electronAPI.skillsSaveConfig(skillId, newConfig);

      if (result.success) {
        onSuccess?.();
        onClose();
      } else {
        setError(result.error || '保存配置失败');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`保存异常: ${msg}`);
    } finally {
      setSaving(false);
    }
  }, [saving, apiKey, apiKeyIsObject, envEntries, configEntries, skillId, onSuccess, onClose]);

  // ── 键值对操作辅助函数 ───────────────────────────────────────────────
  /** 添加 env 条目 */
  const addEnvEntry = () => setEnvEntries((prev) => [...prev, { key: '', value: '' }]);

  /** 删除 env 条目 */
  const removeEnvEntry = (index: number) =>
    setEnvEntries((prev) => prev.filter((_, i) => i !== index));

  /** 更新 env 条目 */
  const updateEnvEntry = (index: number, field: 'key' | 'value', val: string) =>
    setEnvEntries((prev) => prev.map((e, i) => (i === index ? { ...e, [field]: val } : e)));

  /** 添加 config 条目 */
  const addConfigEntry = () => setConfigEntries((prev) => [...prev, { key: '', value: '' }]);

  /** 删除 config 条目 */
  const removeConfigEntry = (index: number) =>
    setConfigEntries((prev) => prev.filter((_, i) => i !== index));

  /** 更新 config 条目 */
  const updateConfigEntry = (index: number, field: 'key' | 'value', val: string) =>
    setConfigEntries((prev) => prev.map((e, i) => (i === index ? { ...e, [field]: val } : e)));

  /** 检查 env key 是否为必需项 */
  const isRequiredEnv = (key: string): boolean =>
    !!requires?.env?.includes(key);

  /** 检查 config key 是否为必需项 */
  const isRequiredConfig = (key: string): boolean =>
    !!requires?.config?.includes(key);

  /** 获取尚未配置的必需 env 项 */
  const missingRequiredEnv = (requires?.env || []).filter(
    (reqKey) => !envEntries.some((e) => e.key.trim() === reqKey && e.value.trim()),
  );

  /** 获取尚未配置的必需 config 项 */
  const missingRequiredConfig = (requires?.config || []).filter(
    (reqKey) => !configEntries.some((e) => e.key.trim() === reqKey && e.value.trim()),
  );

  // ── 内容区（可滚动） ──────────────────────────────────────────────────
  const bodyContent = loading ? (
    /* 加载状态 */
    <div className="flex items-center justify-center py-12">
      <RefreshCw className="w-6 h-6 animate-spin" style={{ color: 'var(--app-text-muted)' }} />
      <span className="ml-2 text-sm" style={{ color: 'var(--app-text-muted)' }}>加载中...</span>
    </div>
  ) : (
    <div className="space-y-5">
      {/* ── API Key ──────────────────────────────────────────────────── */}
      <div
        className="rounded-xl border p-4 space-y-2"
        style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}
      >
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4" style={{ color: 'var(--app-text-muted)' }} />
          <label className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
            API Key
          </label>
        </div>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="输入 API Key..."
          className="w-full rounded-lg px-3 py-2 text-sm outline-none font-mono"
          style={{
            backgroundColor: 'var(--app-bg-elevated)',
            border: '1px solid var(--app-border)',
            color: 'var(--app-text)',
          }}
          disabled={apiKeyIsObject}
        />
        {apiKeyIsObject && (
          <p className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
            此 API Key 为对象引用类型，无法直接编辑
          </p>
        )}
      </div>

      {/* ── 环境变量 (env) ───────────────────────────────────────────── */}
      <div
        className="rounded-xl border p-4 space-y-3"
        style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4" style={{ color: 'var(--app-text-muted)' }} />
            <label className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
              环境变量
            </label>
          </div>
          <button
            type="button"
            onClick={addEnvEntry}
            className="text-xs px-2 py-1 rounded-lg transition-colors hover:opacity-80 flex items-center gap-1"
            style={{
              backgroundColor: 'var(--app-bg)',
              border: '1px solid var(--app-border)',
              color: 'var(--app-text-muted)',
            }}
          >
            <Plus className="w-3 h-3" />
            添加
          </button>
        </div>

        {/* 必需项缺失提示 */}
        {missingRequiredEnv.length > 0 && (
          <div
            className="rounded-lg px-3 py-2 text-xs flex items-start gap-2"
            style={{
              backgroundColor: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.2)',
              color: '#F59E0B',
            }}
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              必需项未配置: {missingRequiredEnv.map((k) => (
                <code key={k} className="font-mono mx-0.5">{k}</code>
              ))}
            </span>
          </div>
        )}

        {/* 键值对列表 */}
        {envEntries.length === 0 ? (
          <p className="text-xs text-center py-2" style={{ color: 'var(--app-text-muted)' }}>
            暂无环境变量
          </p>
        ) : (
          <div className="space-y-2">
            {envEntries.map((entry, index) => {
              const required = isRequiredEnv(entry.key);
              return (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={entry.key}
                    onChange={(e) => updateEnvEntry(index, 'key', e.target.value)}
                    placeholder="KEY"
                    className="flex-1 rounded-lg px-2.5 py-1.5 text-xs font-mono outline-none"
                    style={{
                      backgroundColor: 'var(--app-bg-elevated)',
                      border: required
                        ? '1px solid rgba(245, 158, 11, 0.4)'
                        : '1px solid var(--app-border)',
                      color: 'var(--app-text)',
                    }}
                  />
                  <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>=</span>
                  <input
                    type="text"
                    value={entry.value}
                    onChange={(e) => updateEnvEntry(index, 'value', e.target.value)}
                    placeholder="value"
                    className="flex-[2] rounded-lg px-2.5 py-1.5 text-xs font-mono outline-none"
                    style={{
                      backgroundColor: 'var(--app-bg-elevated)',
                      border: '1px solid var(--app-border)',
                      color: 'var(--app-text)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => removeEnvEntry(index)}
                    className="p-1 rounded-lg transition-colors hover:opacity-80"
                    style={{ color: 'var(--app-text-muted)' }}
                    aria-label="删除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 自定义配置 (config) ──────────────────────────────────────── */}
      <div
        className="rounded-xl border p-4 space-y-3"
        style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4" style={{ color: 'var(--app-text-muted)' }} />
            <label className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
              自定义配置
            </label>
          </div>
          <button
            type="button"
            onClick={addConfigEntry}
            className="text-xs px-2 py-1 rounded-lg transition-colors hover:opacity-80 flex items-center gap-1"
            style={{
              backgroundColor: 'var(--app-bg)',
              border: '1px solid var(--app-border)',
              color: 'var(--app-text-muted)',
            }}
          >
            <Plus className="w-3 h-3" />
            添加
          </button>
        </div>

        {/* 必需项缺失提示 */}
        {missingRequiredConfig.length > 0 && (
          <div
            className="rounded-lg px-3 py-2 text-xs flex items-start gap-2"
            style={{
              backgroundColor: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.2)',
              color: '#F59E0B',
            }}
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              必需项未配置: {missingRequiredConfig.map((k) => (
                <code key={k} className="font-mono mx-0.5">{k}</code>
              ))}
            </span>
          </div>
        )}

        {/* 键值对列表 */}
        {configEntries.length === 0 ? (
          <p className="text-xs text-center py-2" style={{ color: 'var(--app-text-muted)' }}>
            暂无自定义配置
          </p>
        ) : (
          <div className="space-y-2">
            {configEntries.map((entry, index) => {
              const required = isRequiredConfig(entry.key);
              return (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={entry.key}
                    onChange={(e) => updateConfigEntry(index, 'key', e.target.value)}
                    placeholder="key"
                    className="flex-1 rounded-lg px-2.5 py-1.5 text-xs font-mono outline-none"
                    style={{
                      backgroundColor: 'var(--app-bg-elevated)',
                      border: required
                        ? '1px solid rgba(245, 158, 11, 0.4)'
                        : '1px solid var(--app-border)',
                      color: 'var(--app-text)',
                    }}
                  />
                  <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>:</span>
                  <input
                    type="text"
                    value={entry.value}
                    onChange={(e) => updateConfigEntry(index, 'value', e.target.value)}
                    placeholder="value"
                    className="flex-[2] rounded-lg px-2.5 py-1.5 text-xs font-mono outline-none"
                    style={{
                      backgroundColor: 'var(--app-bg-elevated)',
                      border: '1px solid var(--app-border)',
                      color: 'var(--app-text)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => removeConfigEntry(index)}
                    className="p-1 rounded-lg transition-colors hover:opacity-80"
                    style={{ color: 'var(--app-text-muted)' }}
                    aria-label="删除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 错误提示 */}
      {error && (
        <div
          className="rounded-xl border px-4 py-3 text-xs flex items-start gap-2"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            borderColor: 'rgba(239, 68, 68, 0.22)',
            color: '#FCA5A5',
          }}
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );

  return (
    <AppModal
      open={isOpen}
      onClose={onClose}
      /* 标题区：主标题 + 副标题（技能名） */
      title={
        <div>
          <div className="text-base font-semibold" style={{ color: 'var(--app-text)' }}>
            编辑配置
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
            {skillName}
          </div>
        </div>
      }
      icon={<Settings size={20} />}
      variant="default"
      size="lg"
      disableClose={saving}
      /* 底部操作按钮 */
      footer={
        <>
          <AppButton variant="secondary" onClick={onClose} disabled={saving}>
            取消
          </AppButton>
          <AppButton
            variant="primary"
            onClick={() => void handleSave()}
            disabled={saving || loading}
            icon={saving
              ? <RefreshCw className="w-4 h-4 animate-spin" />
              : <Save className="w-4 h-4" />
            }
          >
            {saving ? '保存中...' : '保存'}
          </AppButton>
        </>
      }
    >
      {/* 内容区：限制最大高度并允许滚动 */}
      <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
        {bodyContent}
      </div>
    </AppModal>
  );
};

export default SkillConfigEditor;
