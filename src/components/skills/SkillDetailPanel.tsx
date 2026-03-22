/**
 * SkillDetailPanel — 技能详情侧边面板
 *
 * 从右侧滑入的侧边面板，展示技能完整信息：
 * - 头部：emoji + 名称 + 状态标签 + 来源标签
 * - 基本信息：版本、作者、分类、路径
 * - 依赖状态：缺失项以警告样式展示
 * - SKILL.md 内容：Markdown 渲染（Instructions/Rules 章节）
 * - 配置区域：当前配置值展示（apiKey 掩码显示）
 * - 操作按钮：安装/卸载、启用/禁用、编辑（仅自定义技能）、打开目录、编辑配置
 *
 * 需求: 4.1-4.6
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  X, Download, Trash2,
  Play, StopCircle, Pencil, FolderOpen, Settings,
  AlertTriangle, Package, Info,
  BookOpen, User, Tag, MapPin,
} from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import AppButton from '../AppButton';
import GlobalLoading from '../GlobalLoading';
import type { SkillInfo, SkillEntryConfig } from '../../types/electron';

/** 组件属性 */
interface SkillDetailPanelProps {
  /** 技能信息对象 */
  skill: SkillInfo;
  /** 关闭面板回调 */
  onClose: () => void;
  /** 操作成功后的刷新回调 */
  onRefresh?: () => void;
  /** 打开编辑对话框回调 */
  onEdit?: (skillId: string) => void;
  /** 打开配置编辑器回调 */
  onEditConfig?: (skillId: string) => void;
}

/** 掩码显示 apiKey */
function maskApiKey(key: string | { source: string; provider: string; id: string }): string {
  if (typeof key === 'object') {
    return `[${key.source}] ${key.provider}/${key.id}`;
  }
  if (!key || key.length <= 8) return '••••••••';
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}

/** 获取状态标签颜色 */
function getStatusStyle(status: SkillInfo['status']): { bg: string; text: string } {
  switch (status) {
    case 'installed': return { bg: 'rgba(16, 185, 129, 0.12)', text: '#10B981' };
    case 'available': return { bg: 'rgba(59, 130, 246, 0.12)', text: '#3B82F6' };
    case 'updatable': return { bg: 'rgba(245, 158, 11, 0.12)', text: '#F59E0B' };
    case 'error': return { bg: 'rgba(239, 68, 68, 0.12)', text: '#EF4444' };
    default: return { bg: 'rgba(107, 114, 128, 0.12)', text: '#6B7280' };
  }
}

/** 获取来源标签颜色 */
function getSourceStyle(source?: string): { bg: string; text: string; label: string } {
  switch (source) {
    case 'custom': return { bg: 'rgba(168, 85, 247, 0.12)', text: '#A855F7', label: '自定义' };
    case 'clawhub': return { bg: 'rgba(59, 130, 246, 0.12)', text: '#3B82F6', label: 'ClawHub' };
    case 'bundled': return { bg: 'rgba(107, 114, 128, 0.12)', text: '#6B7280', label: '内置' };
    case 'plugin': return { bg: 'rgba(245, 158, 11, 0.12)', text: '#F59E0B', label: '插件' };
    default: return { bg: 'rgba(107, 114, 128, 0.12)', text: '#6B7280', label: '未知' };
  }
}

/** 状态文本映射 */
const STATUS_LABELS: Record<string, string> = {
  installed: '已安装',
  available: '可安装',
  updatable: '可更新',
  error: '错误',
};

const SkillDetailPanel: React.FC<SkillDetailPanelProps> = ({
  skill,
  onClose,
  onRefresh,
  onEdit,
  onEditConfig,
}) => {
  // ── 状态 ──────────────────────────────────────────────────────────────
  /** 运行时详情（来自 skillsInfo） */
  const [runtimeInfo, setRuntimeInfo] = useState<Record<string, unknown> | null>(null);
  /** 技能配置 */
  const [config, setConfig] = useState<SkillEntryConfig | null>(null);
  /** SKILL.md 原始内容 */
  const [skillMdContent, setSkillMdContent] = useState<string>('');
  /** 加载状态 */
  const [loading, setLoading] = useState(false);
  /** 操作加载状态 */
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  /** 错误信息 */
  const [error, setError] = useState('');
  /** 面板是否可见（用于动画） */
  const [visible, setVisible] = useState(false);

  // ── 滑入动画 ─────────────────────────────────────────────────────────
  useEffect(() => {
    // 延迟触发动画
    const timer = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  /** 关闭面板（带动画） */
  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 300);
  }, [onClose]);

  // ── 加载运行时详情和配置 ──────────────────────────────────────────────
  const loadDetails = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      // 并行加载运行时详情、配置和 SKILL.md 内容
      const [infoResult, configResult, readResult] = await Promise.all([
        window.electronAPI.skillsInfo(skill.name).catch(() => ({ success: false } as const)),
        window.electronAPI.skillsGetConfig(skill.id).catch(() => ({ success: false } as const)),
        window.electronAPI.skillsRead(skill.id).catch(() => ({ success: false } as const)),
      ]);

      if (infoResult.success && 'info' in infoResult) {
        setRuntimeInfo(infoResult.info ?? null);
      }
      if (configResult.success && 'config' in configResult) {
        setConfig(configResult.config ?? null);
      }
      if (readResult.success && 'content' in readResult && readResult.content) {
        // 提取 Markdown body（去掉 frontmatter）
        const content = readResult.content;
        const fmMatch = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
        setSkillMdContent(fmMatch ? content.slice(fmMatch[0].length) : content);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`加载详情失败: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [skill.id, skill.name]);

  useEffect(() => {
    void loadDetails();
  }, [loadDetails]);

  // ── 操作处理函数 ─────────────────────────────────────────────────────
  /** 安装技能 */
  const handleInstall = useCallback(async () => {
    setActionLoading('install');
    try {
      const result = await window.electronAPI.skillsInstall(skill.id);
      if (result.success) onRefresh?.();
      else setError(result.error || '安装失败');
    } catch { setError('安装异常'); }
    finally { setActionLoading(null); }
  }, [skill.id, onRefresh]);

  /** 卸载技能 */
  const handleUninstall = useCallback(async () => {
    setActionLoading('uninstall');
    try {
      const result = await window.electronAPI.skillsUninstall(skill.id);
      if (result.success) { onRefresh?.(); handleClose(); }
      else setError(result.error || '卸载失败');
    } catch { setError('卸载异常'); }
    finally { setActionLoading(null); }
  }, [skill.id, onRefresh, handleClose]);

  /** 启用/禁用技能 */
  const handleToggle = useCallback(async () => {
    const action = skill.enabled ? 'disable' : 'enable';
    setActionLoading(action);
    try {
      const result = skill.enabled
        ? await window.electronAPI.skillsDisable(skill.id)
        : await window.electronAPI.skillsEnable(skill.id);
      if (result.success) onRefresh?.();
      else setError(result.error || `${action === 'enable' ? '启用' : '禁用'}失败`);
    } catch { setError('操作异常'); }
    finally { setActionLoading(null); }
  }, [skill.id, skill.enabled, onRefresh]);

  /** 打开技能目录 */
  const handleOpenDir = useCallback(() => {
    if (skill.path) {
      window.electronAPI.openPath?.(skill.path);
    }
  }, [skill.path]);

  // ── 渲染辅助 ─────────────────────────────────────────────────────────
  const statusStyle = getStatusStyle(skill.status);
  const sourceStyle = getSourceStyle(skill.source);
  const isCustom = skill.isCustom || skill.source === 'custom';
  const isInstalled = skill.status === 'installed' || skill.status === 'updatable';

  /** 计算缺失的依赖项 */
  const missingItems: string[] = skill.missingRequirements || [];

  return (
    <>
      {/* 遮罩层 */}
      <div
        className="fixed inset-0 z-40 transition-opacity duration-300"
        style={{
          backgroundColor: 'rgba(15, 23, 42, 0.4)',
          opacity: visible ? 1 : 0,
        }}
        onClick={handleClose}
      />

      {/* 侧边面板 */}
      <div
        className="fixed top-0 right-0 bottom-0 z-50 flex flex-col border-l transition-transform duration-300 ease-in-out"
        style={{
          width: '480px',
          maxWidth: '90vw',
          backgroundColor: 'var(--app-bg)',
          borderColor: 'var(--app-border)',
          transform: visible ? 'translateX(0)' : 'translateX(100%)',
        }}
      >
        {/* ── 头部 ────────────────────────────────────────────────────── */}
        <div
          className="px-6 py-5 border-b shrink-0"
          style={{ borderColor: 'var(--app-border)' }}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3 min-w-0">
              {/* Emoji 图标 */}
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
                style={{ backgroundColor: 'var(--app-bg-subtle)' }}
              >
                {skill.emoji || '🔧'}
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold truncate" style={{ color: 'var(--app-text)' }}>
                  {skill.name}
                </h2>
                {/* 状态标签 + 来源标签 */}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span
                    className="text-xs font-medium px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: statusStyle.bg, color: statusStyle.text }}
                  >
                    {STATUS_LABELS[skill.status] || skill.status}
                  </span>
                  <span
                    className="text-xs font-medium px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: sourceStyle.bg, color: sourceStyle.text }}
                  >
                    {sourceStyle.label}
                  </span>
                  {skill.enabled && isInstalled && (
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#10B981' }}
                    >
                      已启用
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-1.5 rounded-lg transition-colors hover:opacity-80 shrink-0"
              style={{ color: 'var(--app-text-muted)' }}
              aria-label="关闭"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── 可滚动内容区域 ──────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {loading ? (
            /* ── 加载态：使用全局 GlobalLoading 组件（内联模式） ── */
            <div className="flex items-center justify-center py-12">
              <GlobalLoading visible overlay={false} size="md" />
            </div>
          ) : (
            <>
              {/* 描述 */}
              <p className="text-sm leading-relaxed" style={{ color: 'var(--app-text-muted)' }}>
                {skill.description}
              </p>

              {/* ── 基本信息 ──────────────────────────────────────────── */}
              <div
                className="rounded-xl border p-4 space-y-3"
                style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}
              >
                <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--app-text-muted)' }}>
                  基本信息
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  {/* 版本 */}
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 shrink-0" style={{ color: 'var(--app-text-muted)' }} />
                    <div>
                      <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>版本</div>
                      <div className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
                        {skill.version || '—'}
                      </div>
                    </div>
                  </div>
                  {/* 作者 */}
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 shrink-0" style={{ color: 'var(--app-text-muted)' }} />
                    <div>
                      <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>作者</div>
                      <div className="text-sm font-medium truncate" style={{ color: 'var(--app-text)' }}>
                        {skill.author || '—'}
                      </div>
                    </div>
                  </div>
                  {/* 分类 */}
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 shrink-0" style={{ color: 'var(--app-text-muted)' }} />
                    <div>
                      <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>分类</div>
                      <div className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
                        {skill.category || '—'}
                      </div>
                    </div>
                  </div>
                  {/* 路径 */}
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 shrink-0" style={{ color: 'var(--app-text-muted)' }} />
                    <div className="min-w-0">
                      <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>路径</div>
                      <div
                        className="text-xs font-mono truncate"
                        style={{ color: 'var(--app-text)' }}
                        title={skill.path || '—'}
                      >
                        {skill.path || '—'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── 依赖状态（缺失项警告） ────────────────────────────── */}
              {missingItems.length > 0 && (
                <div
                  className="rounded-xl border p-4"
                  style={{
                    backgroundColor: 'rgba(245, 158, 11, 0.06)',
                    borderColor: 'rgba(245, 158, 11, 0.2)',
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: '#F59E0B' }} />
                    <h4 className="text-xs font-semibold" style={{ color: '#F59E0B' }}>
                      缺失依赖项
                    </h4>
                  </div>
                  <ul className="space-y-1">
                    {missingItems.map((item) => (
                      <li key={item} className="text-xs flex items-center gap-1.5" style={{ color: 'var(--app-text-muted)' }}>
                        <span className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: '#F59E0B' }} />
                        <span className="font-mono">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* ── 运行时详情（来自 skillsInfo） ─────────────────────── */}
              {runtimeInfo && (
                <div
                  className="rounded-xl border p-4 space-y-2"
                  style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}
                >
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 shrink-0" style={{ color: 'var(--app-text-muted)' }} />
                    <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--app-text-muted)' }}>
                      运行时详情
                    </h4>
                  </div>
                  <pre
                    className="text-xs font-mono whitespace-pre-wrap break-all rounded-lg p-3"
                    style={{
                      backgroundColor: 'var(--app-bg)',
                      color: 'var(--app-text-muted)',
                      maxHeight: '200px',
                      overflow: 'auto',
                    }}
                  >
                    {JSON.stringify(runtimeInfo, null, 2)}
                  </pre>
                </div>
              )}

              {/* ── 配置区域 ──────────────────────────────────────────── */}
              {config && (
                <div
                  className="rounded-xl border p-4 space-y-3"
                  style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Settings className="w-4 h-4 shrink-0" style={{ color: 'var(--app-text-muted)' }} />
                      <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--app-text-muted)' }}>
                        当前配置
                      </h4>
                    </div>
                    {onEditConfig && (
                      <button
                        onClick={() => onEditConfig(skill.id)}
                        className="text-xs px-2 py-1 rounded-lg transition-colors hover:opacity-80"
                        style={{
                          backgroundColor: 'var(--app-bg)',
                          border: '1px solid var(--app-border)',
                          color: 'var(--app-text-muted)',
                        }}
                      >
                        编辑配置
                      </button>
                    )}
                  </div>

                  {/* apiKey 掩码显示 */}
                  {config.apiKey && (
                    <div className="space-y-1">
                      <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>API Key</div>
                      <div
                        className="text-xs font-mono px-2 py-1.5 rounded-lg"
                        style={{ backgroundColor: 'var(--app-bg)', color: 'var(--app-text)' }}
                      >
                        {maskApiKey(config.apiKey)}
                      </div>
                    </div>
                  )}

                  {/* env 键值对 */}
                  {config.env && Object.keys(config.env).length > 0 && (
                    <div className="space-y-1">
                      <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>环境变量</div>
                      <div className="space-y-1">
                        {Object.entries(config.env).map(([key, value]) => (
                          <div
                            key={key}
                            className="text-xs font-mono px-2 py-1.5 rounded-lg flex items-center gap-2"
                            style={{ backgroundColor: 'var(--app-bg)', color: 'var(--app-text)' }}
                          >
                            <span style={{ color: 'var(--app-text-muted)' }}>{key}=</span>
                            <span className="truncate">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* config 键值对 */}
                  {config.config && Object.keys(config.config).length > 0 && (
                    <div className="space-y-1">
                      <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>自定义配置</div>
                      <div className="space-y-1">
                        {Object.entries(config.config).map(([key, value]) => (
                          <div
                            key={key}
                            className="text-xs font-mono px-2 py-1.5 rounded-lg flex items-center gap-2"
                            style={{ backgroundColor: 'var(--app-bg)', color: 'var(--app-text)' }}
                          >
                            <span style={{ color: 'var(--app-text-muted)' }}>{key}:</span>
                            <span className="truncate">{typeof value === 'string' ? value : JSON.stringify(value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── SKILL.md 内容渲染 ─────────────────────────────────── */}
              {skillMdContent && (
                <div
                  className="rounded-xl border p-4 space-y-2"
                  style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}
                >
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 shrink-0" style={{ color: 'var(--app-text-muted)' }} />
                    <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--app-text-muted)' }}>
                      技能指令
                    </h4>
                  </div>
                  <div
                    className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed"
                    style={{ color: 'var(--app-text)' }}
                  >
                    <Markdown remarkPlugins={[remarkGfm]}>{skillMdContent}</Markdown>
                  </div>
                </div>
              )}

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
            </>
          )}
        </div>

        {/* ── 底部操作按钮 ────────────────────────────────────────────── */}
        <div
          className="px-6 py-4 border-t shrink-0"
          style={{ borderColor: 'var(--app-border)' }}
        >
          <div className="flex flex-wrap gap-2">
            {/* 安装（仅可安装状态） */}
            {skill.status === 'available' && (
              <AppButton
                variant="primary"
                size="sm"
                onClick={() => void handleInstall()}
                disabled={actionLoading !== null}
                loading={actionLoading === 'install'}
                icon={<Download className="w-4 h-4" />}
              >
                安装
              </AppButton>
            )}

            {/* 卸载（仅已安装状态） */}
            {isInstalled && (
              <AppButton
                variant="danger"
                size="sm"
                onClick={() => void handleUninstall()}
                disabled={actionLoading !== null}
                loading={actionLoading === 'uninstall'}
                icon={<Trash2 className="w-4 h-4" />}
              >
                卸载
              </AppButton>
            )}

            {/* 启用/禁用（仅已安装状态） */}
            {isInstalled && (
              <AppButton
                variant="secondary"
                size="sm"
                onClick={() => void handleToggle()}
                disabled={actionLoading !== null}
                loading={actionLoading === 'enable' || actionLoading === 'disable'}
                icon={skill.enabled
                  ? <StopCircle className="w-4 h-4" />
                  : <Play className="w-4 h-4" />}
              >
                {skill.enabled ? '禁用' : '启用'}
              </AppButton>
            )}

            {/* 编辑（仅自定义技能） */}
            {isCustom && onEdit && (
              <AppButton
                variant="secondary"
                size="sm"
                onClick={() => onEdit(skill.id)}
                icon={<Pencil className="w-4 h-4" />}
              >
                编辑
              </AppButton>
            )}

            {/* 打开目录 */}
            {skill.path && isInstalled && (
              <AppButton
                variant="secondary"
                size="sm"
                onClick={handleOpenDir}
                icon={<FolderOpen className="w-4 h-4" />}
              >
                打开目录
              </AppButton>
            )}

            {/* 编辑配置 */}
            {isInstalled && onEditConfig && (
              <AppButton
                variant="secondary"
                size="sm"
                onClick={() => onEditConfig(skill.id)}
                icon={<Settings className="w-4 h-4" />}
              >
                编辑配置
              </AppButton>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default SkillDetailPanel;
