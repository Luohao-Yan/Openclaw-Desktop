/**
 * ExportHistoryPanel — 导出历史记录面板
 *
 * 使用 AppModal 统一弹窗结构，展示所有导出记录（按时间倒序），
 * 支持复制密钥和删除记录。
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  History,
  Copy,
  Trash2,
  CheckCircle,
  Clock,
  FileArchive,
  HardDrive,
  RefreshCw,
} from 'lucide-react';
import AppButton from '../../components/AppButton';
import AppModal from '../../components/AppModal';
import { useI18n } from '../../i18n/I18nContext';
import type { ExportHistoryRecord } from '../../types/electron';

/** 导出历史面板属性接口 */
interface ExportHistoryPanelProps {
  /** 是否显示面板 */
  open: boolean;
  /** 关闭面板回调 */
  onClose: () => void;
}

/**
 * 格式化文件大小为人类可读格式
 * @param bytes 文件大小（字节）
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * 格式化 ISO 8601 时间字符串为中文本地化格式
 * @param isoString ISO 8601 时间字符串
 */
function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const ExportHistoryPanel: React.FC<ExportHistoryPanelProps> = ({ open, onClose }) => {
  const { t } = useI18n();

  // ── 状态 ──────────────────────────────────────────────────────────────────
  /** 导出历史记录列表 */
  const [records, setRecords] = useState<ExportHistoryRecord[]>([]);
  /** 是否正在加载 */
  const [loading, setLoading] = useState(false);
  /** 当前已复制密钥的记录 ID（用于显示"已复制"提示） */
  const [copiedId, setCopiedId] = useState<string | null>(null);
  /** 当前处于删除确认状态的记录 ID */
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  /** 加载导出历史记录 */
  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.electronAPI.agentsGetExportHistory();
      if (result.success && result.history) {
        setRecords(result.history);
      }
    } catch (err) {
      console.error('加载导出历史失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // 面板打开时加载数据并重置交互状态
  useEffect(() => {
    if (open) {
      void loadHistory();
      setCopiedId(null);
      setConfirmDeleteId(null);
    }
  }, [open, loadHistory]);

  /** 复制密钥到剪贴板，显示 2 秒"已复制"提示 */
  const handleCopyPassphrase = useCallback(async (record: ExportHistoryRecord) => {
    try {
      await navigator.clipboard.writeText(record.passphrase);
      setCopiedId(record.id);
      setTimeout(() => setCopiedId((prev) => (prev === record.id ? null : prev)), 2000);
    } catch (err) {
      console.error('复制密钥失败:', err);
    }
  }, []);

  /** 删除导出历史记录（需先确认） */
  const handleDelete = useCallback(async (recordId: string) => {
    try {
      const result = await window.electronAPI.agentsDeleteExportHistory(recordId);
      if (result.success) {
        await loadHistory();
      }
    } catch (err) {
      console.error('删除导出记录失败:', err);
    } finally {
      setConfirmDeleteId(null);
    }
  }, [loadHistory]);

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title={
        t('exchange.history.title' as any) !== 'exchange.history.title'
          ? t('exchange.history.title' as any)
          : '导出历史'
      }
      icon={<History size={20} />}
      variant="default"
      size="lg"
      /* 底部关闭按钮 */
      footer={
        <AppButton variant="secondary" onClick={onClose}>
          {t('exchange.history.close' as any) !== 'exchange.history.close'
            ? t('exchange.history.close' as any)
            : '关闭'}
        </AppButton>
      }
    >
      {/* 内容区：限制最大高度并允许滚动 */}
      <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
        {/* 加载状态 */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin" style={{ color: 'var(--app-text-muted)' }} />
          </div>
        )}

        {/* 空状态 */}
        {!loading && records.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <FileArchive
              className="w-12 h-12"
              style={{ color: 'var(--app-text-muted)', opacity: 0.4 }}
            />
            <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
              {t('exchange.history.empty' as any) !== 'exchange.history.empty'
                ? t('exchange.history.empty' as any)
                : '暂无导出记录'}
            </p>
          </div>
        )}

        {/* 记录列表 */}
        {!loading && records.length > 0 && (
          <div className="space-y-3">
            {records.map((record) => (
              <div
                key={record.id}
                className="rounded-xl border p-4 transition-colors"
                style={{
                  backgroundColor: 'var(--app-bg-subtle)',
                  borderColor: 'var(--app-border)',
                }}
              >
                {/* 第一行：Agent 名称 + 导出时间 */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold truncate mr-2">
                    {record.agentName}
                  </span>
                  <span
                    className="text-xs flex items-center gap-1 shrink-0"
                    style={{ color: 'var(--app-text-muted)' }}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    {formatTime(record.exportTime)}
                  </span>
                </div>

                {/* 第二行：文件路径 */}
                <p
                  className="text-xs font-mono truncate mb-1.5"
                  style={{ color: 'var(--app-text-muted)' }}
                  title={record.filePath}
                >
                  {record.filePath}
                </p>

                {/* 第三行：文件大小 + 操作按钮 */}
                <div className="flex items-center justify-between">
                  <span
                    className="text-xs flex items-center gap-1"
                    style={{ color: 'var(--app-text-muted)' }}
                  >
                    <HardDrive className="w-3.5 h-3.5" />
                    {formatFileSize(record.fileSize)}
                  </span>

                  <div className="flex items-center gap-2">
                    {/* 删除确认状态 */}
                    {confirmDeleteId === record.id ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
                          {t('exchange.history.confirmDelete' as any) !== 'exchange.history.confirmDelete'
                            ? t('exchange.history.confirmDelete' as any)
                            : '确认删除？'}
                        </span>
                        <AppButton
                          variant="danger"
                          size="xs"
                          onClick={() => void handleDelete(record.id)}
                        >
                          {t('common.confirm' as any)}
                        </AppButton>
                        <AppButton
                          variant="secondary"
                          size="xs"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          {t('common.cancel' as any)}
                        </AppButton>
                      </div>
                    ) : (
                      <>
                        {/* 复制密钥按钮 */}
                        <AppButton
                          variant="secondary"
                          size="xs"
                          icon={
                            copiedId === record.id ? (
                              <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )
                          }
                          onClick={() => void handleCopyPassphrase(record)}
                        >
                          {copiedId === record.id
                            ? (t('exchange.history.copied' as any) !== 'exchange.history.copied'
                                ? t('exchange.history.copied' as any)
                                : '已复制')
                            : (t('exchange.history.copyPassphrase' as any) !== 'exchange.history.copyPassphrase'
                                ? t('exchange.history.copyPassphrase' as any)
                                : '复制密钥')}
                        </AppButton>

                        {/* 删除按钮 */}
                        <AppButton
                          variant="secondary"
                          size="xs"
                          icon={<Trash2 className="w-3.5 h-3.5" />}
                          onClick={() => setConfirmDeleteId(record.id)}
                        >
                          {t('exchange.history.delete' as any) !== 'exchange.history.delete'
                            ? t('exchange.history.delete' as any)
                            : '删除'}
                        </AppButton>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppModal>
  );
};

export default ExportHistoryPanel;
