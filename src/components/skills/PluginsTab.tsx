/**
 * PluginsTab — 插件管理标签页
 *
 * 插件管理标签页组件，作为技能管理页面的一个标签页内容：
 * - 插件列表：名称、状态、版本
 * - 安装插件对话框（输入路径或标识符）
 * - 启用/禁用/卸载操作按钮
 * - 插件详情展示（调用 pluginsInspect）
 * - 插件诊断按钮（调用 pluginsDoctor）
 *
 * 需求: 8.1-8.6
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, Plus, Trash2, Play, StopCircle,
  Info, Stethoscope, AlertTriangle, X,
  Package, CheckCircle, XCircle, AlertCircle,
} from 'lucide-react';
import AppButton from '../AppButton';
import AppModal from '../AppModal';
import GlobalLoading from '../GlobalLoading';
import type { PluginInfo } from '../../types/electron';

// ── 安装插件对话框 ──────────────────────────────────────────────────────────

/** 安装插件对话框属性 */
interface InstallPluginDialogProps {
  /** 是否显示 */
  isOpen: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 安装成功回调 */
  onSuccess?: () => void;
}

/** 安装插件对话框组件 */
const InstallPluginDialog: React.FC<InstallPluginDialogProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  /** 插件路径或标识符 */
  const [spec, setSpec] = useState('');
  /** 安装中状态 */
  const [installing, setInstalling] = useState(false);
  /** 错误信息 */
  const [error, setError] = useState('');

  // 打开时重置状态
  useEffect(() => {
    if (isOpen) {
      setSpec('');
      setInstalling(false);
      setError('');
    }
  }, [isOpen]);

  /** 执行安装 */
  const handleInstall = useCallback(async () => {
    const trimmed = spec.trim();
    if (!trimmed || installing) return;

    setInstalling(true);
    setError('');

    try {
      const result = await window.electronAPI.pluginsInstall(trimmed);
      if (result.success) {
        onSuccess?.();
        onClose();
      } else {
        setError(result.error || '安装失败');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`安装异常: ${msg}`);
    } finally {
      setInstalling(false);
    }
  }, [spec, installing, onSuccess, onClose]);

  /** 键盘事件 */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'Enter' && spec.trim() && !installing) {
        e.preventDefault();
        void handleInstall();
      }
    },
    [onClose, spec, installing, handleInstall],
  );

  return (
    <AppModal
      open={isOpen}
      onClose={onClose}
      title="安装插件"
      icon={<Package size={20} />}
      variant="default"
      size="md"
      disableClose={installing}
      footer={
        <>
          <AppButton variant="secondary" onClick={onClose} disabled={installing}>
            取消
          </AppButton>
          <AppButton
            variant="primary"
            onClick={() => void handleInstall()}
            disabled={!spec.trim() || installing}
            icon={installing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          >
            {installing ? '安装中...' : '安装'}
          </AppButton>
        </>
      }
    >
      {/* 表单内容区 */}
      <div className="space-y-4" onKeyDown={handleKeyDown}>
        <div className="space-y-2">
          <label className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
            插件路径或标识符 <span style={{ color: '#F87171' }}>*</span>
          </label>
          <input
            type="text"
            value={spec}
            onChange={(e) => {
              setSpec(e.target.value);
              if (error) setError('');
            }}
            placeholder="例如: /path/to/plugin 或 plugin-name"
            className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-colors"
            style={{
              backgroundColor: 'var(--app-bg-subtle)',
              border: error
                ? '1px solid rgba(239, 68, 68, 0.5)'
                : '1px solid var(--app-border)',
              color: 'var(--app-text)',
            }}
            autoFocus
            disabled={installing}
          />
          <p className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
            输入本地插件目录路径或 ClawHub 插件标识符
          </p>
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
    </AppModal>
  );
};

// ── 插件状态图标 ────────────────────────────────────────────────────────────

/** 获取插件状态对应的图标和颜色 */
function getPluginStatusDisplay(status: PluginInfo['status']): {
  icon: React.ReactNode;
  label: string;
  color: string;
  bg: string;
} {
  switch (status) {
    case 'enabled':
      return {
        icon: <CheckCircle className="w-4 h-4" />,
        label: '已启用',
        color: '#10B981',
        bg: 'rgba(16, 185, 129, 0.12)',
      };
    case 'disabled':
      return {
        icon: <StopCircle className="w-4 h-4" />,
        label: '已禁用',
        color: '#6B7280',
        bg: 'rgba(107, 114, 128, 0.12)',
      };
    case 'error':
      return {
        icon: <XCircle className="w-4 h-4" />,
        label: '错误',
        color: '#EF4444',
        bg: 'rgba(239, 68, 68, 0.12)',
      };
    default:
      return {
        icon: <AlertCircle className="w-4 h-4" />,
        label: '未知',
        color: '#6B7280',
        bg: 'rgba(107, 114, 128, 0.12)',
      };
  }
}

// ── 主组件 PluginsTab ───────────────────────────────────────────────────────

/** PluginsTab 外部控制 props（由父组件 Skills.tsx 传入，用于顶部按钮组联动） */
export interface PluginsTabProps {
  /** 触发安装对话框的外部信号（每次变化时打开对话框） */
  installTrigger?: number;
  /** 触发诊断的外部信号（每次变化时执行诊断） */
  doctorTrigger?: number;
  /** 触发刷新的外部信号（每次变化时刷新列表） */
  refreshTrigger?: number;
  /** 通知父组件当前 loading 状态 */
  onLoadingChange?: (loading: boolean) => void;
  /** 通知父组件诊断 loading 状态 */
  onDoctorLoadingChange?: (loading: boolean) => void;
}

const PluginsTab: React.FC<PluginsTabProps> = ({
  installTrigger,
  doctorTrigger,
  refreshTrigger,
  onLoadingChange,
  onDoctorLoadingChange,
}) => {
  // ── 状态 ──────────────────────────────────────────────────────────────
  /** 插件列表 */
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  /** 加载状态 */
  const [loading, setLoading] = useState(false);
  /** 错误信息 */
  const [error, setError] = useState('');
  /** 安装对话框是否打开 */
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  /** 当前查看详情的插件 ID */
  const [inspectingId, setInspectingId] = useState<string | null>(null);
  /** 插件详情数据 */
  const [inspectDetail, setInspectDetail] = useState<Record<string, unknown> | null>(null);
  /** 插件详情加载状态 */
  const [inspectLoading, setInspectLoading] = useState(false);
  /** 操作加载状态（key 为插件 ID + 操作名） */
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  /** 诊断报告 */
  const [doctorReport, setDoctorReport] = useState<Record<string, unknown> | null>(null);
  /** 诊断加载状态 */
  const [doctorLoading, setDoctorLoading] = useState(false);

  // ── 加载插件列表 ─────────────────────────────────────────────────────
  const loadPlugins = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await window.electronAPI.pluginsList();
      if (result.success && result.plugins) {
        setPlugins(result.plugins);
      } else {
        setError(result.error || '获取插件列表失败');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`加载异常: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, []);

  // 初始加载
  useEffect(() => {
    void loadPlugins();
  }, [loadPlugins]);

  // ── 插件操作 ─────────────────────────────────────────────────────────

  /** 启用/禁用插件 */
  const handleToggle = useCallback(async (plugin: PluginInfo) => {
    const key = `${plugin.id}-toggle`;
    setActionLoading(key);
    try {
      const result = plugin.status === 'enabled'
        ? await window.electronAPI.pluginsDisable(plugin.id)
        : await window.electronAPI.pluginsEnable(plugin.id);
      if (result.success) {
        await loadPlugins();
      } else {
        setError(result.error || '操作失败');
      }
    } catch {
      setError('操作异常');
    } finally {
      setActionLoading(null);
    }
  }, [loadPlugins]);

  /** 卸载插件 */
  const handleUninstall = useCallback(async (plugin: PluginInfo) => {
    const key = `${plugin.id}-uninstall`;
    setActionLoading(key);
    try {
      const result = await window.electronAPI.pluginsUninstall(plugin.id);
      if (result.success) {
        // 如果正在查看该插件详情，关闭详情面板
        if (inspectingId === plugin.id) {
          setInspectingId(null);
          setInspectDetail(null);
        }
        await loadPlugins();
      } else {
        setError(result.error || '卸载失败');
      }
    } catch {
      setError('卸载异常');
    } finally {
      setActionLoading(null);
    }
  }, [loadPlugins, inspectingId]);

  /** 查看插件详情 */
  const handleInspect = useCallback(async (pluginId: string) => {
    // 切换详情面板：再次点击同一插件则关闭
    if (inspectingId === pluginId) {
      setInspectingId(null);
      setInspectDetail(null);
      return;
    }

    setInspectingId(pluginId);
    setInspectDetail(null);
    setInspectLoading(true);

    try {
      const result = await window.electronAPI.pluginsInspect(pluginId);
      if (result.success && result.detail) {
        setInspectDetail(result.detail);
      }
    } catch {
      // 静默处理
    } finally {
      setInspectLoading(false);
    }
  }, [inspectingId]);

  /** 执行插件诊断 */
  const handleDoctor = useCallback(async () => {
    setDoctorLoading(true);
    setDoctorReport(null);
    try {
      const result = await window.electronAPI.pluginsDoctor();
      if (result.success && result.report) {
        setDoctorReport(result.report);
      } else {
        setError(result.error || '诊断失败');
      }
    } catch {
      setError('诊断异常');
    } finally {
      setDoctorLoading(false);
    }
  }, []);

  // ── 响应外部 trigger（父组件顶部按钮触发） ───────────────────────────

  /** loading 变化时通知父组件 */
  useEffect(() => { onLoadingChange?.(loading); }, [loading, onLoadingChange]);

  /** doctorLoading 变化时通知父组件 */
  useEffect(() => { onDoctorLoadingChange?.(doctorLoading); }, [doctorLoading, onDoctorLoadingChange]);

  /** 响应安装触发信号 */
  useEffect(() => {
    if (installTrigger !== undefined && installTrigger > 0) {
      setInstallDialogOpen(true);
    }
  }, [installTrigger]);

  /** 响应诊断触发信号 */
  useEffect(() => {
    if (doctorTrigger !== undefined && doctorTrigger > 0) {
      void handleDoctor();
    }
  }, [doctorTrigger, handleDoctor]);

  /** 响应刷新触发信号 */
  useEffect(() => {
    if (refreshTrigger !== undefined && refreshTrigger > 0) {
      void loadPlugins();
    }
  }, [refreshTrigger, loadPlugins]);

  // ── 渲染 ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

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
          <button
            onClick={() => setError('')}
            className="ml-auto shrink-0 hover:opacity-80"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 诊断报告 */}
      {doctorReport && (
        <div
          className="rounded-xl border p-4 space-y-2"
          style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Stethoscope className="w-4 h-4" style={{ color: 'var(--app-text-muted)' }} />
              <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--app-text-muted)' }}>
                插件诊断报告
              </h4>
            </div>
            <button
              onClick={() => setDoctorReport(null)}
              className="p-1 rounded hover:opacity-80"
              style={{ color: 'var(--app-text-muted)' }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
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
            {JSON.stringify(doctorReport, null, 2)}
          </pre>
        </div>
      )}

      {/* 加载状态：使用全局 GlobalLoading 组件（overlay=false 内联模式） */}
      {loading && plugins.length === 0 ? (
        <GlobalLoading visible text="加载插件列表" overlay={false} size="md" />
      ) : plugins.length === 0 ? (
        /* 空状态 */
        <div className="flex flex-col items-center justify-center py-16 space-y-3">
          <Package className="w-12 h-12" style={{ color: 'var(--app-text-muted)', opacity: 0.4 }} />
          <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>暂无已安装插件</p>
          <AppButton
            variant="primary"
            size="sm"
            onClick={() => setInstallDialogOpen(true)}
            icon={<Plus className="w-4 h-4" />}
          >
            安装第一个插件
          </AppButton>
        </div>
      ) : (
        /* 插件列表 */
        <div className="space-y-2">
          {plugins.map((plugin) => {
            const statusDisplay = getPluginStatusDisplay(plugin.status);
            const isInspecting = inspectingId === plugin.id;
            const toggleKey = `${plugin.id}-toggle`;
            const uninstallKey = `${plugin.id}-uninstall`;

            return (
              <div key={plugin.id}>
                {/* 插件行 */}
                <div
                  className="rounded-xl border p-4 transition-colors"
                  style={{
                    backgroundColor: isInspecting ? 'var(--app-bg-subtle)' : 'var(--app-bg)',
                    borderColor: isInspecting ? 'var(--app-active-border)' : 'var(--app-border)',
                  }}
                >
                  <div className="flex items-center justify-between">
                    {/* 左侧：名称 + 状态 + 版本 */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: statusDisplay.bg }}
                      >
                        <span style={{ color: statusDisplay.color }}>{statusDisplay.icon}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate" style={{ color: 'var(--app-text)' }}>
                            {plugin.name}
                          </span>
                          <span
                            className="text-xs font-medium px-1.5 py-0.5 rounded-full shrink-0"
                            style={{ backgroundColor: statusDisplay.bg, color: statusDisplay.color }}
                          >
                            {statusDisplay.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs font-mono" style={{ color: 'var(--app-text-muted)' }}>
                            v{plugin.version}
                          </span>
                          {plugin.description && (
                            <span className="text-xs truncate" style={{ color: 'var(--app-text-muted)' }}>
                              · {plugin.description}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 右侧：操作按钮 */}
                    <div className="flex items-center gap-1.5 shrink-0 ml-3">
                      {/* 详情按钮 */}
                      <AppButton
                        variant="secondary"
                        size="xs"
                        onClick={() => void handleInspect(plugin.id)}
                        title="查看详情"
                        icon={<Info className="w-3.5 h-3.5" />}
                      >
                        详情
                      </AppButton>

                      {/* 启用/禁用按钮 */}
                      <AppButton
                        variant="secondary"
                        size="xs"
                        onClick={() => void handleToggle(plugin)}
                        disabled={actionLoading === toggleKey}
                        title={plugin.status === 'enabled' ? '禁用插件' : '启用插件'}
                        icon={actionLoading === toggleKey
                          ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          : plugin.status === 'enabled'
                            ? <StopCircle className="w-3.5 h-3.5" />
                            : <Play className="w-3.5 h-3.5" />}
                      >
                        {plugin.status === 'enabled' ? '禁用' : '启用'}
                      </AppButton>

                      {/* 卸载按钮 */}
                      <AppButton
                        variant="danger"
                        size="xs"
                        onClick={() => void handleUninstall(plugin)}
                        disabled={actionLoading === uninstallKey}
                        title="卸载插件"
                        icon={actionLoading === uninstallKey
                          ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />}
                      >
                        卸载
                      </AppButton>
                    </div>
                  </div>
                </div>

                {/* 插件详情展开区域 */}
                {isInspecting && (
                  <div
                    className="ml-4 mt-1 rounded-xl border p-4"
                    style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}
                  >
                    {inspectLoading ? (
                      <div className="flex items-center gap-2 py-2">
                        <RefreshCw className="w-4 h-4 animate-spin" style={{ color: 'var(--app-text-muted)' }} />
                        <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>加载详情...</span>
                      </div>
                    ) : inspectDetail ? (
                      <pre
                        className="text-xs font-mono whitespace-pre-wrap break-all rounded-lg p-3"
                        style={{
                          backgroundColor: 'var(--app-bg)',
                          color: 'var(--app-text-muted)',
                          maxHeight: '240px',
                          overflow: 'auto',
                        }}
                      >
                        {JSON.stringify(inspectDetail, null, 2)}
                      </pre>
                    ) : (
                      <p className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
                        无法获取插件详情
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 安装插件对话框 */}
      <InstallPluginDialog
        isOpen={installDialogOpen}
        onClose={() => setInstallDialogOpen(false)}
        onSuccess={() => void loadPlugins()}
      />
    </div>
  );
};

export default PluginsTab;
