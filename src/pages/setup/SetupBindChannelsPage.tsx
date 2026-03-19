// ============================================================================
// SetupBindChannelsPage — Agent-Channel 绑定页面
// 路由: /setup/local/bind-channels
// 位于 create-agent 之后、verify 之前
// 通过 IPC 查询 openclaw.json 中系统可用渠道及其账户，
// 展示未绑定的 渠道/账户 组合供用户勾选绑定
// ============================================================================

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Link2, Loader2, SkipForward, XCircle, AlertCircle, UserCheck } from 'lucide-react';
import AppButton from '../../components/AppButton';
import SetupLayout from '../../components/setup/SetupLayout';
import { useSetupFlow } from '../../contexts/SetupFlowContext';

// ============================================================================
// 辅助类型
// ============================================================================

/** 可绑定的渠道-账户条目（从 IPC 查询结果派生） */
interface BindableAccount {
  /** 渠道 key（如 feishu、telegram） */
  channelKey: string;
  /** 账户 ID（如 testbot、default） */
  accountId: string;
  /** 勾选状态的唯一 key（channelKey/accountId） */
  checkKey: string;
  /** 显示标签 */
  displayLabel: string;
  /** 该账户已绑定的 agentId（空字符串表示未绑定） */
  boundAgentId: string;
}

// ============================================================================
// 主页面组件
// ============================================================================

/**
 * Agent-Channel 绑定页面组件
 *
 * 业务逻辑：
 * - 进入页面时通过 IPC 查询 agent 已有绑定和系统可用渠道及账户
 * - 如果 agent 已绑定所有可用渠道账户 → 自动跳过到 verify
 * - 如果系统中没有可用渠道 → 显示提示，允许跳过
 * - 展示未绑定的 渠道/账户 组合供用户勾选
 * - 每个选项显示该账户是否已被其他 agent 绑定
 * - 默认不勾选任何账户，用户手动选择
 * - "继续"按钮调用 coreConfig:writeBinding 写入绑定
 */
export const SetupBindChannelsPage: React.FC = () => {
  const navigate = useNavigate();
  const { createdAgent, dispatch, isBusy, isBootstrapping } = useSetupFlow();

  // ── IPC 查询状态 ──────────────────────────────────────────────────────────
  /** 是否正在加载绑定信息 */
  const [isLoading, setIsLoading] = React.useState(true);
  /** 所有可绑定的渠道-账户条目 */
  const [allBindableAccounts, setAllBindableAccounts] = React.useState<BindableAccount[]>([]);
  /** agent 已有的绑定 key 集合（channelKey/accountId 格式） */
  const [existingBindingKeys, setExistingBindingKeys] = React.useState<Set<string>>(new Set());
  /** 查询错误 */
  const [loadError, setLoadError] = React.useState('');

  // ── 自动跳过：bootstrapping 阶段或无已创建 agent 时跳转到验证页面 ────────
  React.useEffect(() => {
    if (isBootstrapping) return;
    if (!createdAgent) {
      navigate('/setup/local/verify', { replace: true });
    }
  }, [createdAgent, isBootstrapping, navigate]);

  // ── 进入页面时查询 agent 绑定信息 ────────────────────────────────────────
  React.useEffect(() => {
    if (isBootstrapping || !createdAgent) return;

    const fetchBindableInfo = async () => {
      setIsLoading(true);
      setLoadError('');

      try {
        if (typeof window.electronAPI?.coreConfigGetAgentBindableInfo !== 'function') {
          // IPC 不可用时，回退到显示空列表
          setAllBindableAccounts([]);
          setExistingBindingKeys(new Set());
          return;
        }

        const result = await window.electronAPI.coreConfigGetAgentBindableInfo(createdAgent.id);

        if (!result.success) {
          setLoadError(result.error || '查询绑定信息失败');
          return;
        }

        // 构建已绑定 key 集合（channelKey/accountId 格式）
        const boundKeys = new Set(
          result.existingBindings
            .filter((b) => b.channel)
            .map((b) => `${b.channel}/${b.accountId || 'default'}`),
        );
        setExistingBindingKeys(boundKeys);

        // 全局绑定映射（channelKey/accountId → agentId）
        const accountBindings = result.accountBindings || {};

        // 从 channelAccounts 构建可绑定的账户列表
        const accounts: BindableAccount[] = [];
        const channelAccounts = result.channelAccounts || {};

        for (const channelKey of result.availableChannels) {
          const accountIds = channelAccounts[channelKey];
          if (accountIds && accountIds.length > 0) {
            // 渠道下有账户：为每个账户创建一个条目
            for (const accountId of accountIds) {
              const checkKey = `${channelKey}/${accountId}`;
              accounts.push({
                channelKey,
                accountId,
                checkKey,
                displayLabel: `${channelKey} / ${accountId}`,
                boundAgentId: accountBindings[checkKey] || '',
              });
            }
          } else {
            // 渠道下无账户配置：回退到 provider 级别（使用 default）
            const checkKey = `${channelKey}/default`;
            accounts.push({
              channelKey,
              accountId: 'default',
              checkKey,
              displayLabel: channelKey,
              boundAgentId: accountBindings[checkKey] || '',
            });
          }
        }
        setAllBindableAccounts(accounts);

        // 如果所有账户都已绑定到当前 agent，自动跳过
        if (accounts.length > 0 && accounts.every((a) => boundKeys.has(a.checkKey))) {
          navigate('/setup/local/verify', { replace: true });
        }
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : '查询绑定信息时发生未知错误');
      } finally {
        setIsLoading(false);
      }
    };

    void fetchBindableInfo();
  }, [createdAgent, isBootstrapping, navigate]);

  // ── 从所有账户中过滤出未绑定到当前 agent 的 ────────────────────────────────
  const unboundAccounts = React.useMemo<BindableAccount[]>(() => {
    return allBindableAccounts.filter((a) => !existingBindingKeys.has(a.checkKey));
  }, [allBindableAccounts, existingBindingKeys]);

  // ── 勾选状态：默认不勾选 ──────────────────────────────────────────────────
  const [checked, setChecked] = React.useState<Record<string, boolean>>({});

  // 当 unboundAccounts 变化时同步勾选状态（默认不勾选）
  React.useEffect(() => {
    setChecked((prev) => {
      const next: Record<string, boolean> = {};
      for (const a of unboundAccounts) {
        next[a.checkKey] = prev[a.checkKey] ?? false;
      }
      return next;
    });
  }, [unboundAccounts]);

  /** 切换单个账户的勾选状态 */
  const toggleAccount = (checkKey: string) => {
    setChecked((prev) => ({ ...prev, [checkKey]: !prev[checkKey] }));
  };

  // ── 写入绑定状态 ──────────────────────────────────────────────────────────
  const [isBinding, setIsBinding] = React.useState(false);
  const [bindError, setBindError] = React.useState('');

  /** 已勾选的账户列表 */
  const checkedAccounts = React.useMemo(
    () => unboundAccounts.filter((a) => checked[a.checkKey]),
    [unboundAccounts, checked],
  );

  /** 按钮禁用状态 */
  const buttonsDisabled = isBusy || isBinding || isLoading;

  /** "继续"按钮：写入绑定到 openclaw.json 并导航到验证页面 */
  const handleContinue = async () => {
    if (!createdAgent) {
      navigate('/setup/local/verify');
      return;
    }

    setBindError('');
    setIsBinding(true);

    try {
      const bindings: Array<{ agentId: string; channelKey: string; accountId: string }> = [];

      // 遍历已勾选的渠道-账户组合，逐个调用 IPC 写入绑定
      for (const a of checkedAccounts) {
        try {
          const result = await window.electronAPI.coreConfigWriteBinding(
            createdAgent.id,
            a.channelKey,
            a.accountId,
          );
          if (result.success) {
            bindings.push({
              agentId: createdAgent.id,
              channelKey: a.channelKey,
              accountId: a.accountId,
            });
          } else {
            console.warn(`绑定写入失败 [${a.checkKey}]:`, result.error);
          }
        } catch (err) {
          console.warn(`绑定写入异常 [${a.checkKey}]:`, err);
        }
      }

      // 将成功写入的绑定同步到引导流程状态
      if (bindings.length > 0) {
        dispatch({ type: 'SET_AGENT_CHANNEL_BINDINGS', payload: bindings });
      }

      navigate('/setup/local/verify');
    } catch (err) {
      setBindError(err instanceof Error ? err.message : '写入绑定时发生未知错误');
    } finally {
      setIsBinding(false);
    }
  };

  /** "跳过"按钮：直接导航到验证页面 */
  const handleSkip = () => {
    navigate('/setup/local/verify');
  };

  // ── 加载中状态 ────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <SetupLayout
        title="绑定渠道到智能体"
        description="正在查询系统渠道配置…"
        stepLabel="渠道绑定"
      >
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--app-text-muted)' }} />
        </div>
      </SetupLayout>
    );
  }

  return (
    <SetupLayout
      title="绑定渠道到智能体"
      description={
        createdAgent
          ? `选择要绑定到智能体「${createdAgent.name}」的渠道账户。绑定后，该智能体将能接收对应渠道的消息。`
          : '选择要绑定到智能体的渠道账户。'
      }
      stepLabel="渠道绑定"
      footer={
        <div className="flex flex-wrap items-center gap-3">
          <AppButton
            variant="secondary"
            onClick={handleSkip}
            disabled={buttonsDisabled}
            icon={<SkipForward size={14} />}
          >
            跳过
          </AppButton>
          <AppButton
            variant="primary"
            onClick={() => void handleContinue()}
            disabled={buttonsDisabled || checkedAccounts.length === 0}
            icon={
              isBinding ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Link2 size={15} />
              )
            }
          >
            {isBinding ? '绑定中…' : '继续'}
          </AppButton>
        </div>
      }
    >
      {/* 查询错误提示 */}
      {loadError && (
        <div
          className="mb-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            borderColor: 'rgba(239, 68, 68, 0.25)',
            color: '#dc2626',
          }}
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {/* 渠道-账户列表（带最大高度和滚动） */}
      {unboundAccounts.length > 0 ? (
        <div
          className="space-y-2 overflow-y-auto pr-1"
        >
          {unboundAccounts.map((a) => {
            /** 该账户是否已被其他 agent 绑定 */
            const isBoundByOther = !!a.boundAgentId && a.boundAgentId !== createdAgent?.id;
            return (
              <label
                key={a.checkKey}
                className="flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition-all duration-200 hover:-translate-y-0.5"
                style={{
                  backgroundColor: 'var(--app-bg)',
                  borderColor: checked[a.checkKey]
                    ? 'var(--app-active-border)'
                    : 'var(--app-border)',
                  boxShadow: checked[a.checkKey]
                    ? '0 0 0 1px var(--app-active-border)'
                    : 'none',
                }}
              >
                {/* 复选框 */}
                <input
                  type="checkbox"
                  checked={!!checked[a.checkKey]}
                  onChange={() => toggleAccount(a.checkKey)}
                  className="h-4 w-4 shrink-0 rounded accent-[var(--app-active-text)]"
                />
                {/* 渠道-账户信息 */}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{a.displayLabel}</div>
                  {/* 绑定状态提示 */}
                  {isBoundByOther ? (
                    <div className="mt-0.5 flex items-center gap-1 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                      <UserCheck size={12} className="shrink-0" />
                      <span className="truncate">已绑定到 {a.boundAgentId}</span>
                    </div>
                  ) : (
                    <div className="mt-0.5 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                      未绑定
                    </div>
                  )}
                </div>
                {/* 状态图标 */}
                {isBoundByOther ? (
                  <UserCheck size={16} style={{ color: 'var(--app-text-muted)', flexShrink: 0 }} />
                ) : (
                  <CheckCircle2 size={16} style={{ color: '#22c55e', flexShrink: 0 }} />
                )}
              </label>
            );
          })}
        </div>
      ) : (
        /* 无可绑定渠道时的提示 */
        <div
          className="rounded-2xl border px-4 py-6 text-center text-sm"
          style={{
            backgroundColor: 'var(--app-bg)',
            borderColor: 'var(--app-border)',
            color: 'var(--app-text-muted)',
          }}
        >
          {allBindableAccounts.length === 0
            ? '系统中尚未配置任何渠道。你可以跳过此步骤，稍后在设置中配置。'
            : '所有渠道账户已绑定到该智能体。'}
        </div>
      )}

      {/* 已勾选计数提示 */}
      {unboundAccounts.length > 0 && (
        <div
          className="mt-4 rounded-xl px-4 py-2.5 text-xs"
          style={{ backgroundColor: 'var(--app-bg)', color: 'var(--app-text-muted)' }}
        >
          已选择 {checkedAccounts.length} / {unboundAccounts.length} 个渠道账户
        </div>
      )}

      {/* 已绑定渠道提示 */}
      {existingBindingKeys.size > 0 && (
        <div
          className="mt-3 rounded-xl px-4 py-2.5 text-xs"
          style={{ backgroundColor: 'var(--app-bg)', color: 'var(--app-text-muted)' }}
        >
          已绑定：{Array.from(existingBindingKeys).join('、')}
        </div>
      )}

      {/* 绑定错误提示 */}
      {bindError && (
        <div
          className="mt-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            borderColor: 'rgba(239, 68, 68, 0.25)',
            color: '#dc2626',
          }}
        >
          <XCircle size={16} className="mt-0.5 shrink-0" />
          <span>{bindError}</span>
        </div>
      )}

    </SetupLayout>
  );
};

export default SetupBindChannelsPage;
