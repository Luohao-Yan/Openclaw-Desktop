/**
 * AddInstanceModal — 添加远程/Docker 实例的弹窗表单
 *
 * 功能：
 * - 填写别名、协议、Host、Port、Token（可选）
 * - 点击「测试连接」调用 remoteInstancesAdd IPC 验证连通性
 * - 连通后自动保存并回调 onSuccess
 */

import React, { useState } from 'react';
import { Server, CheckCircle, XCircle, Loader2, Plus } from 'lucide-react';
import AppModal from '../AppModal';
import AppButton from '../AppButton';
import AppInput from '../AppInput';
import { useI18n } from '../../i18n/I18nContext';
import type { AddInstanceFormData } from '../../types/instanceManager';

// ─── Props ────────────────────────────────────────────────────────────────────

interface AddInstanceModalProps {
  /** 是否显示弹窗 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 添加成功回调，传入新实例 ID */
  onSuccess: (newInstanceId: string) => void;
}

// ─── 表单默认值 ───────────────────────────────────────────────────────────────

const DEFAULT_FORM: AddInstanceFormData = {
  alias: '',
  protocol: 'http',
  host: '',
  port: 18789,
  token: '',
};

// ─── 表单字段校验 ─────────────────────────────────────────────────────────────

interface FormErrors {
  alias?: string;
  host?: string;
  port?: string;
}

function validateForm(form: AddInstanceFormData): FormErrors {
  const errors: FormErrors = {};
  if (!form.alias.trim()) {
    errors.alias = '别名不能为空';
  }
  if (!form.host.trim()) {
    errors.host = 'Host 地址不能为空';
  }
  if (!form.port || form.port < 1 || form.port > 65535) {
    errors.port = '端口号须在 1 ~ 65535 之间';
  }
  return errors;
}

// ─── 组件 ─────────────────────────────────────────────────────────────────────

const AddInstanceModal: React.FC<AddInstanceModalProps> = ({ open, onClose, onSuccess }) => {
  const { t } = useI18n();

  /** 表单数据 */
  const [form, setForm] = useState<AddInstanceFormData>(DEFAULT_FORM);
  /** 字段校验错误 */
  const [errors, setErrors] = useState<FormErrors>({});
  /** 测试连接状态：idle / testing / success / failed */
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  /** 测试连接错误信息 */
  const [testError, setTestError] = useState<string>('');
  /** 是否正在提交 */
  const [submitting, setSubmitting] = useState(false);

  /** 重置表单状态 */
  const resetState = () => {
    setForm(DEFAULT_FORM);
    setErrors({});
    setTestStatus('idle');
    setTestError('');
    setSubmitting(false);
  };

  /** 关闭弹窗并重置 */
  const handleClose = () => {
    resetState();
    onClose();
  };

  /** 更新表单字段 */
  const updateField = <K extends keyof AddInstanceFormData>(
    key: K,
    value: AddInstanceFormData[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    // 修改字段时清除对应错误
    if (errors[key as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
    // 修改字段时重置测试状态
    setTestStatus('idle');
    setTestError('');
  };

  /**
   * 测试连接 & 添加实例
   *
   * 调用 remoteInstancesAdd IPC，该接口内部会先进行连通性测试，
   * 通过后才持久化到 electron-store。
   */
  const handleTestAndAdd = async () => {
    // 校验表单
    const validationErrors = validateForm(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setTestStatus('testing');
    setTestError('');

    try {
      const result = await window.electronAPI.remoteInstancesAdd({
        alias: form.alias.trim(),
        protocol: form.protocol,
        host: form.host.trim(),
        port: form.port,
        token: form.token?.trim() || undefined,
      });

      if (result.success && result.id) {
        setTestStatus('success');
        // 短暂展示成功状态后关闭
        setTimeout(() => {
          onSuccess(result.id!);
          resetState();
        }, 800);
      } else {
        setTestStatus('failed');
        setTestError(result.error || t('instances.form.testFailed' as any));
      }
    } catch (err: any) {
      setTestStatus('failed');
      setTestError(err?.message || t('instances.form.testFailed' as any));
    }
  };

  // ─── 渲染 ──────────────────────────────────────────────────────────────────

  return (
    <AppModal
      open={open}
      onClose={handleClose}
      title={t('instances.addInstance' as any)}
      icon={<Server size={20} />}
      variant="default"
      size="md"
      footer={
        <>
          <AppButton variant="secondary" onClick={handleClose} disabled={submitting}>
            {t('instances.form.cancel' as any)}
          </AppButton>
          <AppButton
            variant="primary"
            onClick={handleTestAndAdd}
            disabled={testStatus === 'testing' || testStatus === 'success'}
            icon={
              testStatus === 'testing' ? (
                <Loader2 size={16} className="animate-spin" />
              ) : testStatus === 'success' ? (
                <CheckCircle size={16} />
              ) : (
                <Plus size={16} />
              )
            }
          >
            {testStatus === 'testing'
              ? t('instances.form.testConnection' as any)
              : testStatus === 'success'
                ? t('instances.form.testSuccess' as any)
                : t('instances.form.addButton' as any)}
          </AppButton>
        </>
      }
    >
      <div className="space-y-5">
        {/* 别名 */}
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--app-text)' }}>
            {t('instances.form.alias' as any)}
            <span className="text-red-400 ml-0.5">*</span>
          </label>
          <AppInput
            value={form.alias}
            onChange={(e) => updateField('alias', e.target.value)}
            placeholder={t('instances.form.aliasPlaceholder' as any)}
            error={!!errors.alias}
          />
          {errors.alias && (
            <p className="mt-1 text-xs text-red-400">{errors.alias}</p>
          )}
        </div>

        {/* 协议 + Host + 端口（一行） */}
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--app-text)' }}>
            {t('instances.form.host' as any)}
            <span className="text-red-400 ml-0.5">*</span>
          </label>
          <div className="flex gap-2">
            {/* 协议选择 */}
            <select
              value={form.protocol}
              onChange={(e) => updateField('protocol', e.target.value as 'http' | 'https')}
              className="rounded-lg border text-sm px-2 py-2 outline-none transition-all duration-200 flex-shrink-0"
              style={{
                backgroundColor: 'var(--app-bg)',
                borderColor: 'var(--app-border)',
                color: 'var(--app-text)',
                width: '90px',
              }}
            >
              <option value="http">http://</option>
              <option value="https">https://</option>
            </select>
            {/* Host 地址 */}
            <div className="flex-1">
              <AppInput
                value={form.host}
                onChange={(e) => updateField('host', e.target.value)}
                placeholder={t('instances.form.hostPlaceholder' as any)}
                error={!!errors.host}
              />
            </div>
            {/* 端口 */}
            <div className="flex-shrink-0" style={{ width: '90px' }}>
              <AppInput
                type="number"
                value={form.port}
                onChange={(e) => updateField('port', parseInt(e.target.value, 10) || 0)}
                placeholder="18789"
                error={!!errors.port}
              />
            </div>
          </div>
          {/* 校验错误提示 */}
          <div className="flex gap-2 mt-1">
            <div style={{ width: '90px' }} />
            {errors.host && <p className="flex-1 text-xs text-red-400">{errors.host}</p>}
            {errors.port && <p style={{ width: '90px' }} className="text-xs text-red-400">{errors.port}</p>}
          </div>
        </div>

        {/* Token（可选） */}
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--app-text)' }}>
            {t('instances.form.token' as any)}
          </label>
          <AppInput
            type="password"
            value={form.token || ''}
            onChange={(e) => updateField('token', e.target.value)}
            placeholder={t('instances.form.tokenPlaceholder' as any)}
          />
        </div>

        {/* 连接测试结果反馈 */}
        {testStatus === 'success' && (
          <div
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm"
            style={{
              backgroundColor: 'rgba(52, 211, 153, 0.08)',
              border: '1px solid rgba(52, 211, 153, 0.25)',
              color: '#34d399',
            }}
          >
            <CheckCircle size={15} />
            <span>{t('instances.form.testSuccess' as any)}</span>
          </div>
        )}
        {testStatus === 'failed' && (
          <div
            className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-sm"
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              color: '#f87171',
            }}
          >
            <XCircle size={15} className="flex-shrink-0 mt-0.5" />
            <span>{testError || t('instances.form.testFailed' as any)}</span>
          </div>
        )}

        {/* 提示信息 */}
        <p className="text-xs leading-5" style={{ color: 'var(--app-text-muted)' }}>
          点击「添加实例」后将自动测试连通性，连接成功后才会保存。
        </p>
      </div>
    </AppModal>
  );
};

export default AddInstanceModal;
