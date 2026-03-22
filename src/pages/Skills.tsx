/**
 * Skills.tsx — 技能管理页面（重构版）
 *
 * 标签页布局：本地技能 | 市场搜索 | 插件
 * 顶部操作栏：创建自定义技能、诊断、刷新
 * 集成文件监听和自动刷新
 *
 * 需求: 1.1, 2.1, 3.1, 4.1, 5.1-5.5, 7.1, 8.1, 9.1, 11.1-11.3, 12.1-12.4
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  BookOpen, Search,
  RefreshCw, Download, Trash2,
  AlertCircle,
  ExternalLink, Pencil,
  Plus, Stethoscope,
  AlertTriangle,
} from 'lucide-react';
import AppButton from '../components/AppButton';
import AppModal from '../components/AppModal';
import AppBadge from '../components/AppBadge';
import GlobalLoading from '../components/GlobalLoading';
import type { SkillInfo } from '../types/electron';

// ── 子组件导入 ──────────────────────────────────────────────────────────────
import CreateSkillDialog from '../components/skills/CreateSkillDialog';
import SegmentedTabs from '../components/SegmentedTabs';
import EditSkillDialog from '../components/skills/EditSkillDialog';
import DeleteSkillConfirm from '../components/skills/DeleteSkillConfirm';
import SkillDetailPanel from '../components/skills/SkillDetailPanel';
import SkillConfigEditor from '../components/skills/SkillConfigEditor';
import PluginsTab from '../components/skills/PluginsTab';
import DiagnosticsPanel from '../components/skills/DiagnosticsPanel';

// ── 标签页类型 ──────────────────────────────────────────────────────────────
type TabKey = 'local' | 'market' | 'plugins';

/** 标签页定义 */
const TABS: { key: TabKey; label: string }[] = [
  { key: 'local', label: '本地技能' },
  { key: 'market', label: '市场搜索' },
  { key: 'plugins', label: '插件' },
];

// ── 依赖安装引导对话框 ──────────────────────────────────────────────────────

/** 缺失依赖项 */
interface MissingDep {
  name: string;
  installCommand?: string;
  installLabel?: string;
}

/** 依赖安装引导对话框属性 */
interface DependencyGuideDialogProps {
  isOpen: boolean;
  onClose: () => void;
  skillName: string;
  missingDeps: MissingDep[];
  onRefresh?: () => void;
}

/** 依赖安装引导对话框（需求 12.1-12.4） */
const DependencyGuideDialog: React.FC<DependencyGuideDialogProps> = ({
  isOpen,
  onClose,
  skillName,
  missingDeps,
  onRefresh,
}) => {
  /** 安装状态：key 为依赖名称 */
  const [installing, setInstalling] = useState<Record<string, boolean>>({});
  /** 安装结果 */
  const [results, setResults] = useState<Record<string, { success: boolean; message: string }>>({});

  /** 执行单个依赖安装 */
  const handleInstallDep = useCallback(async (dep: MissingDep) => {
    if (!dep.installCommand) return;
    setInstalling((prev) => ({ ...prev, [dep.name]: true }));
    try {
      // 解析命令和参数
      const parts = dep.installCommand.split(/\s+/);
      const command = parts[0];
      const args = parts.slice(1);
      const result = await window.electronAPI.skillsInstallDependency({ command, args });
      setResults((prev) => ({
        ...prev,
        [dep.name]: { success: result.success, message: result.error || '安装成功' },
      }));
      if (result.success) onRefresh?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setResults((prev) => ({ ...prev, [dep.name]: { success: false, message: msg } }));
    } finally {
      setInstalling((prev) => ({ ...prev, [dep.name]: false }));
    }
  }, [onRefresh]);

  if (missingDeps.length === 0) return null;

  return (
    <AppModal
      open={isOpen}
      onClose={onClose}
      title={
        <div>
          <div className="text-base font-semibold" style={{ color: 'var(--app-text)' }}>缺失依赖</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--app-text-muted)' }}>{skillName}</div>
        </div>
      }
      icon={<AlertTriangle size={20} />}
      variant="warning"
      size="md"
      footer={
        <AppButton variant="secondary" onClick={onClose}>关闭</AppButton>
      }
    >
      {/* 依赖列表 */}
      <div className="space-y-3" style={{ maxHeight: '50vh', overflowY: 'auto' }}>
        <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
          该技能需要以下依赖才能正常运行：
        </p>
        {missingDeps.map((dep) => (
          <div
            key={dep.name}
            className="rounded-xl border p-3 flex items-center justify-between"
            style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}
          >
            <div className="min-w-0">
              <span className="text-sm font-mono font-medium" style={{ color: 'var(--app-text)' }}>
                {dep.name}
              </span>
              {dep.installCommand && (
                <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
                  {dep.installCommand}
                </p>
              )}
              {results[dep.name] && (
                <p
                  className="text-xs mt-1"
                  style={{ color: results[dep.name].success ? '#10B981' : '#EF4444' }}
                >
                  {results[dep.name].message}
                </p>
              )}
            </div>
            {dep.installCommand && !results[dep.name]?.success && (
              <AppButton
                variant="primary"
                size="xs"
                onClick={() => void handleInstallDep(dep)}
                disabled={installing[dep.name]}
                icon={installing[dep.name]
                  ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  : <Download className="w-3.5 h-3.5" />}
              >
                {dep.installLabel || '安装'}
              </AppButton>
            )}
          </div>
        ))}
      </div>
    </AppModal>
  );
};

// ── 市场搜索结果卡片 ────────────────────────────────────────────────────────

/** 市场搜索结果卡片属性 */
interface MarketSkillCardProps {
  skill: SkillInfo;
  onInstall: (skill: SkillInfo) => void;
  installing: boolean;
}

/** 市场搜索结果卡片 */
const MarketSkillCard: React.FC<MarketSkillCardProps> = ({ skill, onInstall, installing }) => {
  const isInstalled = skill.status === 'installed' || skill.status === 'updatable';
  return (
    <div
      className="rounded-2xl border p-4 flex flex-col gap-3 transition-all hover:shadow-md"
      style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)' }}
    >
      {/* 头部 */}
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
          style={{ backgroundColor: 'var(--app-bg-subtle)' }}
        >
          {skill.emoji || '📦'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold truncate" style={{ color: 'var(--app-text)' }}>
              {skill.name}
            </span>
            {isInstalled && (
              <span
                className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#10B981' }}
              >
                已安装
              </span>
            )}
          </div>
          {skill.author && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
              by {skill.author}
            </p>
          )}
        </div>
      </div>
      {/* 描述 */}
      <p className="text-xs leading-relaxed line-clamp-2" style={{ color: 'var(--app-text-muted)' }}>
        {skill.description || '暂无描述'}
      </p>
      {/* 底部操作 */}
      <div className="flex items-center justify-between mt-auto">
        <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
          {skill.version ? `v${skill.version}` : ''}
        </span>
        {!isInstalled ? (
          <button
            onClick={() => onInstall(skill)}
            disabled={installing}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all disabled:opacity-50"
            style={{
              backgroundColor: 'rgba(59, 130, 246, 0.12)',
              color: '#3B82F6',
              border: '1px solid rgba(59, 130, 246, 0.2)',
            }}
          >
            {installing
              ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              : <Download className="w-3.5 h-3.5" />}
            {installing ? '安装中...' : '安装'}
          </button>
        ) : (
          <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>已安装</span>
        )}
      </div>
    </div>
  );
};

// ── 本地技能卡片 ────────────────────────────────────────────────────────────

/** 本地技能卡片属性 */
interface LocalSkillCardProps {
  skill: SkillInfo;
  isSelected: boolean;
  onClick: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

/** 获取状态颜色 */
function getStatusColor(status: SkillInfo['status']): { bg: string; text: string } {
  switch (status) {
    case 'installed': return { bg: 'rgba(16, 185, 129, 0.12)', text: '#10B981' };
    case 'available': return { bg: 'rgba(59, 130, 246, 0.12)', text: '#3B82F6' };
    case 'updatable': return { bg: 'rgba(245, 158, 11, 0.12)', text: '#F59E0B' };
    case 'error': return { bg: 'rgba(239, 68, 68, 0.12)', text: '#EF4444' };
    default: return { bg: 'rgba(107, 114, 128, 0.12)', text: '#6B7280' };
  }
}

/** 状态文本 */
const STATUS_TEXT: Record<string, string> = {
  installed: '已安装',
  available: '可安装',
  updatable: '可更新',
  error: '错误',
};

/** 本地技能卡片 */
const LocalSkillCard: React.FC<LocalSkillCardProps> = ({
  skill, isSelected, onClick, onEdit, onDelete,
}) => {
  const statusColor = getStatusColor(skill.status);
  const isCustom = skill.isCustom || skill.source === 'custom';
  const hasMissing = (skill.missingRequirements?.length ?? 0) > 0;

  return (
    <div
      onClick={onClick}
      className="rounded-2xl border p-4 cursor-pointer transition-all hover:shadow-md"
      style={{
        backgroundColor: isSelected ? 'var(--app-bg-subtle)' : 'var(--app-bg-elevated)',
        borderColor: isSelected ? 'rgba(168, 85, 247, 0.4)' : 'var(--app-border)',
        boxShadow: isSelected ? '0 0 0 2px rgba(168, 85, 247, 0.15)' : undefined,
      }}
    >
      <div className="flex items-start gap-3">
        {/* Emoji */}
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
          style={{ backgroundColor: 'var(--app-bg-subtle)' }}
        >
          {skill.emoji || '🔧'}
        </div>
        <div className="min-w-0 flex-1">
          {/* 名称 + 状态 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold truncate" style={{ color: 'var(--app-text)' }}>
              {skill.name}
            </span>
            <span
              className="text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0"
              style={{ backgroundColor: statusColor.bg, color: statusColor.text }}
            >
              {STATUS_TEXT[skill.status] || skill.status}
            </span>
            {isCustom && (
              <span
                className="text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0"
                style={{ backgroundColor: 'rgba(168, 85, 247, 0.12)', color: '#A855F7' }}
              >
                自定义
              </span>
            )}
          </div>
          {/* 描述 */}
          <p className="text-xs mt-1 line-clamp-2 leading-relaxed" style={{ color: 'var(--app-text-muted)' }}>
            {skill.description || '暂无描述'}
          </p>
          {/* 缺失依赖警告 */}
          {hasMissing && (
            <div className="flex items-center gap-1 mt-1.5">
              <AlertTriangle className="w-3 h-3 shrink-0" style={{ color: '#F59E0B' }} />
              <span className="text-xs" style={{ color: '#F59E0B' }}>
                缺失 {skill.missingRequirements!.length} 个依赖
              </span>
            </div>
          )}
        </div>
        {/* 操作按钮（仅自定义技能） */}
        {isCustom && (
          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            {onEdit && (
              <button
                onClick={onEdit}
                className="p-1.5 rounded-lg transition-colors hover:opacity-80"
                style={{ color: 'var(--app-text-muted)' }}
                title="编辑"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                className="p-1.5 rounded-lg transition-colors hover:opacity-80"
                style={{ color: '#EF4444' }}
                title="删除"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ── 主组件 Skills ───────────────────────────────────────────────────────────

/** 主技能管理页面组件 */
const Skills: React.FC = () => {
  // ── 标签页状态 ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabKey>('local');

  // ── 本地技能状态 ────────────────────────────────────────────────────────
  /** 技能列表 */
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  /** 加载状态 */
  const [loading, setLoading] = useState(false);
  /** 错误信息 */
  const [loadError, setLoadError] = useState('');
  /** 本地搜索关键词 */
  const [searchQuery, setSearchQuery] = useState('');
  /** 当前选中的技能（用于详情面板） */
  const [selectedSkill, setSelectedSkill] = useState<SkillInfo | null>(null);

  // ── 插件 tab 外部控制信号（每次 +1 触发子组件对应操作） ────────────────
  /** 触发安装对话框的计数器 */
  const [pluginInstallTrigger, setPluginInstallTrigger] = useState(0);
  /** 触发诊断的计数器 */
  const [pluginDoctorTrigger, setPluginDoctorTrigger] = useState(0);
  /** 触发刷新的计数器 */
  const [pluginRefreshTrigger, setPluginRefreshTrigger] = useState(0);
  /** 插件列表加载状态（由子组件回调） */
  const [pluginLoading, setPluginLoading] = useState(false);
  /** 插件诊断加载状态（由子组件回调） */
  const [pluginDoctorLoading, setPluginDoctorLoading] = useState(false);

  // ── 对话框状态 ──────────────────────────────────────────────────────────
  /** 创建技能对话框 */
  const [showCreate, setShowCreate] = useState(false);
  /** 编辑技能对话框 */
  const [editSkillId, setEditSkillId] = useState<string | null>(null);
  /** 删除确认对话框 */
  const [deleteSkill, setDeleteSkill] = useState<SkillInfo | null>(null);
  /** 配置编辑器 */
  const [configSkillId, setConfigSkillId] = useState<string | null>(null);
  /** 诊断面板 */
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  /** 依赖引导对话框 */
  const [depGuide, setDepGuide] = useState<{
    skillName: string;
    missingDeps: Array<{ name: string; installCommand?: string; installLabel?: string }>;
  } | null>(null);

  // ── 市场搜索状态 ────────────────────────────────────────────────────────
  /** 市场搜索关键词 */
  const [marketQuery, setMarketQuery] = useState('');
  /** 市场搜索结果 */
  const [marketResults, setMarketResults] = useState<SkillInfo[]>([]);
  /** 市场搜索加载状态 */
  const [marketLoading, setMarketLoading] = useState(false);
  /** 市场搜索错误 */
  const [marketError, setMarketError] = useState('');
  /** 正在安装的技能 ID */
  const [installingId, setInstallingId] = useState<string | null>(null);

  // ── 文件监听 ref ────────────────────────────────────────────────────────
  /** 监听器取消函数 */
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // ── 加载技能列表 ─────────────────────────────────────────────────────────
  const loadSkills = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const result = await window.electronAPI.skillsGetAll();
      if (result.success && 'skills' in result) {
        setSkills(result.skills ?? []);
      } else {
        setLoadError('error' in result ? (result.error ?? '加载失败') : '加载失败');
      }
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : '加载技能失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── 文件监听生命周期 ─────────────────────────────────────────────────────
  useEffect(() => {
    // 页面挂载时启动文件监听
    void window.electronAPI.skillsStartWatcher?.();

    // 注册 skills:changed 事件监听，自动刷新列表
    const unsub = window.electronAPI.onSkillsChanged?.(() => {
      void loadSkills();
    });
    if (unsub) unsubscribeRef.current = unsub;

    // 初始加载
    void loadSkills();

    return () => {
      // 页面卸载时停止监听
      void window.electronAPI.skillsStopWatcher?.();
      unsubscribeRef.current?.();
    };
  }, [loadSkills]);

  // ── 市场搜索 ─────────────────────────────────────────────────────────────
  const handleMarketSearch = useCallback(async () => {
    const q = marketQuery.trim();
    if (!q) return;
    setMarketLoading(true);
    setMarketError('');
    setMarketResults([]);
    try {
      const result = await window.electronAPI.skillsClawHubSearch(q);
      if (result.success && 'skills' in result) {
        setMarketResults(result.skills ?? []);
      } else {
        setMarketError('error' in result ? (result.error ?? '搜索失败') : '搜索失败');
      }
    } catch (err: unknown) {
      setMarketError(err instanceof Error ? err.message : '搜索失败');
    } finally {
      setMarketLoading(false);
    }
  }, [marketQuery]);

  // ── 安装提示状态 ─────────────────────────────────────────────────────────
  /** 安装结果提示：{ type: 'success' | 'error', message: string } */
  const [installToast, setInstallToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  /** 显示安装提示，3 秒后自动消失 */
  const showInstallToast = useCallback((type: 'success' | 'error', message: string) => {
    setInstallToast({ type, message });
    setTimeout(() => setInstallToast(null), 3000);
  }, []);

  // ── 安装市场技能 ─────────────────────────────────────────────────────────
  const handleMarketInstall = useCallback(async (skill: SkillInfo) => {
    setInstallingId(skill.id);
    try {
      const result = await window.electronAPI.skillsInstall(skill.id);
      if (result.success) {
        // 安装成功：刷新本地列表、更新搜索结果状态、显示成功提示
        void loadSkills();
        setMarketResults((prev) =>
          prev.map((s) => s.id === skill.id ? { ...s, status: 'installed' as const } : s),
        );
        showInstallToast('success', `「${skill.name}」安装成功`);
        // 检查是否有缺失依赖，有则弹出引导对话框
        if (skill.missingRequirements && skill.missingRequirements.length > 0) {
          setDepGuide({
            skillName: skill.name,
            missingDeps: skill.missingRequirements.map((dep) => ({ name: dep })),
          });
        }
      } else {
        // 安装失败：显示错误提示
        const errMsg = 'error' in result ? (result.error ?? '安装失败') : '安装失败';
        showInstallToast('error', `安装失败：${errMsg}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '安装失败，请重试';
      showInstallToast('error', `安装失败：${msg}`);
    } finally {
      setInstallingId(null);
    }
  }, [loadSkills, showInstallToast]);

  // ── 本地技能过滤 ─────────────────────────────────────────────────────────
  const filteredSkills = skills.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.description ?? '').toLowerCase().includes(q) ||
      (s.category ?? '').toLowerCase().includes(q)
    );
  });

  // ── 配置编辑器对应的技能 ─────────────────────────────────────────────────
  const configSkill = configSkillId
    ? skills.find((s) => s.id === configSkillId) ?? null
    : null;

  // ── 渲染 ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="flex flex-col h-full"
      style={{ backgroundColor: 'var(--app-bg)', color: 'var(--app-text)' }}
    >
      {/* ── 安装结果 Toast 提示 ─────────────────────────────────────────── */}
      {installToast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-5 py-3 rounded-2xl shadow-lg text-sm font-medium transition-all"
          style={{
            backgroundColor: installToast.type === 'success' ? 'rgba(16, 185, 129, 0.95)' : 'rgba(239, 68, 68, 0.95)',
            color: '#fff',
            backdropFilter: 'blur(8px)',
          }}
        >
          {installToast.type === 'success'
            ? <Download className="w-4 h-4 shrink-0" />
            : <AlertCircle className="w-4 h-4 shrink-0" />}
          {installToast.message}
        </div>
      )}

      {/* ── 顶部渐变标题卡片（仿 Settings 风格，紫色调） ──────────────── */}
      <div className="px-4 pt-4 pb-0 shrink-0">
        <div
          className="relative rounded-[24px] px-6 py-5 overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.14) 0%, rgba(124, 58, 237, 0.10) 50%, rgba(255, 255, 255, 0.02) 100%)',
            backdropFilter: 'blur(18px)',
          }}
        >
          {/* 装饰光晕 */}
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full blur-3xl" style={{ backgroundColor: 'rgba(168, 85, 247, 0.18)' }} />
          <div className="pointer-events-none absolute bottom-0 right-20 h-32 w-32 rounded-full blur-3xl" style={{ backgroundColor: 'rgba(124, 58, 237, 0.14)' }} />

          <div className="relative flex items-start justify-between gap-4">
            <div>
              {/* badge 标签 */}
              <AppBadge
                variant="neutral"
                icon={<BookOpen size={13} />}
                style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.08)' }}
              >
                Skills Management
              </AppBadge>
              <h1 className="mt-2 text-3xl font-semibold leading-tight" style={{ color: 'var(--app-text)' }}>
                技能管理
              </h1>
              <p className="mt-2 text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
                管理和配置智能体的技能与能力，支持本地技能、市场搜索与插件。
              </p>
              {/* 内联统计指标 badge 组 */}
              <div className="mt-3 flex flex-wrap gap-2.5">
                {[
                  { label: '全部技能', value: skills.length, color: '#a855f7' },
                  { label: '已安装', value: skills.filter(s => s.status === 'installed').length, color: '#34d399' },
                  { label: '自定义', value: skills.filter(s => s.isCustom || s.source === 'custom').length, color: '#60a5fa' },
                ].map((m) => (
                  <AppBadge
                    key={m.label}
                    variant="neutral"
                    style={{ backgroundColor: 'var(--app-bg-elevated)', backdropFilter: 'blur(10px)' }}
                  >
                    <span style={{ color: 'var(--app-text-muted)' }}>{m.label}</span>
                    <span className="font-semibold ml-1" style={{ color: m.color }}>{m.value}</span>
                  </AppBadge>
                ))}
              </div>
            </div>

            {/* 操作按钮组：根据当前 tab 显示不同按钮 */}
            <div className="flex items-center gap-2 shrink-0">
              {/* local / market tab：诊断、刷新、创建技能 */}
              {activeTab !== 'plugins' && (
                <>
                  <button
                    onClick={() => setShowDiagnostics(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all hover:opacity-80"
                    style={{ backgroundColor: 'var(--app-bg-elevated)', border: '1px solid var(--app-border)', color: 'var(--app-text-muted)' }}
                    title="运行诊断"
                  >
                    <Stethoscope className="w-4 h-4" />
                    <span className="hidden sm:inline">诊断</span>
                  </button>
                  <button
                    onClick={() => void loadSkills()}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all hover:opacity-80 disabled:opacity-50"
                    style={{ backgroundColor: 'var(--app-bg-elevated)', border: '1px solid var(--app-border)', color: 'var(--app-text-muted)' }}
                    title="刷新"
                  >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">刷新</span>
                  </button>
                  <button
                    onClick={() => setShowCreate(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg, #A855F7, #7C3AED)', color: '#fff' }}
                  >
                    <Plus className="w-4 h-4" />
                    创建技能
                  </button>
                </>
              )}
              {/* plugins tab：插件诊断、刷新、安装插件 */}
              {activeTab === 'plugins' && (
                <>
                  <button
                    onClick={() => setPluginDoctorTrigger(v => v + 1)}
                    disabled={pluginDoctorLoading}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all hover:opacity-80 disabled:opacity-50"
                    style={{ backgroundColor: 'var(--app-bg-elevated)', border: '1px solid var(--app-border)', color: 'var(--app-text-muted)' }}
                    title="插件诊断"
                  >
                    <Stethoscope className={`w-4 h-4 ${pluginDoctorLoading ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">插件诊断</span>
                  </button>
                  <button
                    onClick={() => setPluginRefreshTrigger(v => v + 1)}
                    disabled={pluginLoading}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all hover:opacity-80 disabled:opacity-50"
                    style={{ backgroundColor: 'var(--app-bg-elevated)', border: '1px solid var(--app-border)', color: 'var(--app-text-muted)' }}
                    title="刷新"
                  >
                    <RefreshCw className={`w-4 h-4 ${pluginLoading ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">刷新</span>
                  </button>
                  <button
                    onClick={() => setPluginInstallTrigger(v => v + 1)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg, #A855F7, #7C3AED)', color: '#fff' }}
                  >
                    <Plus className="w-4 h-4" />
                    安装插件
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── 标签页导航（SegmentedTabs 胶囊风格，与智能体页面保持一致） ── */}
      <div className="px-6 pt-4 pb-2 shrink-0">
        <SegmentedTabs
          items={TABS.map((tab) => ({ key: tab.key, label: tab.label }))}
          value={activeTab}
          onChange={(key) => setActiveTab(key)}
        />
      </div>

      {/* ── 标签页内容区域 ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex">
        {/* ── 本地技能标签页 ─────────────────────────────────────────── */}
        {activeTab === 'local' && (
          <div className="flex-1 flex overflow-hidden">
            {/* 左侧技能列表 */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* 搜索框 */}
              <div className="px-6 py-3 shrink-0">
                <div className="relative">
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                    style={{ color: 'var(--app-text-muted)' }}
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="搜索技能..."
                    className="w-full pl-9 pr-4 py-2 rounded-xl text-sm outline-none"
                    style={{
                      backgroundColor: 'var(--app-bg-subtle)',
                      border: '1px solid var(--app-border)',
                      color: 'var(--app-text)',
                    }}
                  />
                </div>
              </div>

              {/* 技能卡片列表 */}
              <div className="flex-1 overflow-y-auto px-6 pb-6">
                {loading ? (
                  /* 使用全局 GlobalLoading 组件（overlay=false 内联模式） */
                  <GlobalLoading visible text="加载技能列表" overlay={false} size="md" />
                ) : loadError ? (
                  <div
                    className="rounded-xl border px-4 py-3 text-sm flex items-center gap-2 mt-4"
                    style={{
                      backgroundColor: 'rgba(239, 68, 68, 0.08)',
                      borderColor: 'rgba(239, 68, 68, 0.22)',
                      color: '#FCA5A5',
                    }}
                  >
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {loadError}
                  </div>
                ) : filteredSkills.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <BookOpen className="w-12 h-12" style={{ color: 'var(--app-text-muted)', opacity: 0.4 }} />
                    <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
                      {searchQuery ? '没有符合搜索条件的技能' : '暂无技能，点击「创建技能」开始'}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 pt-1">
                    {filteredSkills.map((skill) => (
                      <LocalSkillCard
                        key={skill.id}
                        skill={skill}
                        isSelected={selectedSkill?.id === skill.id}
                        onClick={() => setSelectedSkill(
                          selectedSkill?.id === skill.id ? null : skill,
                        )}
                        onEdit={
                          (skill.isCustom || skill.source === 'custom')
                            ? () => setEditSkillId(skill.id)
                            : undefined
                        }
                        onDelete={
                          (skill.isCustom || skill.source === 'custom')
                            ? () => setDeleteSkill(skill)
                            : undefined
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── 市场搜索标签页 ─────────────────────────────────────────── */}
        {activeTab === 'market' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* 搜索框 */}
            <div className="px-6 py-4 shrink-0">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                    style={{ color: 'var(--app-text-muted)' }}
                  />
                  <input
                    type="text"
                    value={marketQuery}
                    onChange={(e) => setMarketQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void handleMarketSearch()}
                    placeholder="搜索 ClawHub 技能市场..."
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none"
                    style={{
                      backgroundColor: 'var(--app-bg-subtle)',
                      border: '1px solid var(--app-border)',
                      color: 'var(--app-text)',
                    }}
                  />
                </div>
                <button
                  onClick={() => void handleMarketSearch()}
                  disabled={marketLoading || !marketQuery.trim()}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                  style={{
                    background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
                    color: '#fff',
                  }}
                >
                  {marketLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : '搜索'}
                </button>
              </div>
            </div>

            {/* 搜索结果 */}
            <div className="flex-1 overflow-y-auto px-6 pb-6">
              {marketLoading ? (
                /* 使用全局 GlobalLoading 组件（overlay=false 内联模式） */
                <GlobalLoading visible text="搜索中" overlay={false} size="md" />
              ) : marketError ? (
                <div
                  className="rounded-xl border px-4 py-3 text-sm flex items-center gap-2"
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.08)',
                    borderColor: 'rgba(239, 68, 68, 0.22)',
                    color: '#FCA5A5',
                  }}
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {marketError}
                </div>
              ) : marketResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <ExternalLink className="w-12 h-12" style={{ color: 'var(--app-text-muted)', opacity: 0.4 }} />
                  <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
                    {marketQuery ? '未找到相关技能' : '输入关键词搜索 ClawHub 技能市场'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {marketResults.map((skill) => (
                    <MarketSkillCard
                      key={skill.id}
                      skill={skill}
                      onInstall={handleMarketInstall}
                      installing={installingId === skill.id}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── 插件标签页 ─────────────────────────────────────────────── */}
        {activeTab === 'plugins' && (
          <div className="flex-1 overflow-hidden">
            {/* 传入外部控制信号和状态回调，顶部按钮由父组件统一管理 */}
            <PluginsTab
              installTrigger={pluginInstallTrigger}
              doctorTrigger={pluginDoctorTrigger}
              refreshTrigger={pluginRefreshTrigger}
              onLoadingChange={setPluginLoading}
              onDoctorLoadingChange={setPluginDoctorLoading}
            />
          </div>
        )}
      </div>

      {/* ── 技能详情侧边面板 ─────────────────────────────────────────────── */}
      {selectedSkill && (
        <SkillDetailPanel
          skill={selectedSkill}
          onClose={() => setSelectedSkill(null)}
          onRefresh={() => void loadSkills()}
          onEdit={(id) => {
            setEditSkillId(id);
            setSelectedSkill(null);
          }}
          onEditConfig={(id) => {
            setConfigSkillId(id);
            setSelectedSkill(null);
          }}
        />
      )}

      {/* ── 配置编辑器 ───────────────────────────────────────────────────── */}
      {configSkillId && configSkill && (
        <SkillConfigEditor
          skillId={configSkillId}
          skillName={configSkill.name}
          requires={configSkill.requires}
          isOpen={true}
          onClose={() => setConfigSkillId(null)}
          onSuccess={() => {
            setConfigSkillId(null);
            void loadSkills();
          }}
        />
      )}

      {/* ── 创建技能对话框 ───────────────────────────────────────────────── */}
      <CreateSkillDialog
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onSuccess={() => void loadSkills()}
      />

      {/* ── 编辑技能对话框 ───────────────────────────────────────────────── */}
      {editSkillId && (
        <EditSkillDialog
          skillId={editSkillId}
          skillName={skills.find((s) => s.id === editSkillId)?.name ?? editSkillId}
          isCustom={true}
          isOpen={true}
          onClose={() => setEditSkillId(null)}
          onSuccess={() => {
            setEditSkillId(null);
            void loadSkills();
          }}
        />
      )}

      {/* ── 删除确认对话框 ───────────────────────────────────────────────── */}
      {deleteSkill && (
        <DeleteSkillConfirm
          skillId={deleteSkill.id}
          skillName={deleteSkill.name}
          isOpen={true}
          onClose={() => setDeleteSkill(null)}
          onSuccess={() => {
            setDeleteSkill(null);
            void loadSkills();
          }}
        />
      )}

      {/* ── 诊断面板 ─────────────────────────────────────────────────────── */}
      {showDiagnostics && (
        <DiagnosticsPanel
          isOpen={showDiagnostics}
          onClose={() => setShowDiagnostics(false)}
        />
      )}

      {/* ── 依赖安装引导对话框 ───────────────────────────────────────────── */}
      {depGuide && (
        <DependencyGuideDialog
          isOpen={true}
          onClose={() => setDepGuide(null)}
          skillName={depGuide.skillName}
          missingDeps={depGuide.missingDeps}
          onRefresh={() => void loadSkills()}
        />
      )}
    </div>
  );
};

export default Skills;
