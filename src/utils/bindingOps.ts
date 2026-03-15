/**
 * 绑定操作纯函数模块
 * 提取绑定 CRUD 的核心逻辑，便于属性测试验证
 */

/** 绑定记录结构（新版 schema 不再支持 enabled 字段） */
export interface BindingRecord {
  agentId: string;
  match: {
    channel: string;
    accountId: string;
  };
  [key: string]: any;
}

/** 绑定草稿结构（新版 schema 不再支持 enabled 字段） */
export interface BindingDraft {
  binding: {
    agentId: string;
    match: {
      channel: string;
      accountId: string;
    };
    [key: string]: any;
  };
  accountConfig: any | null;
}

/** 配置结构（简化） */
export interface OpenClawConfig {
  bindings: BindingRecord[];
  channels?: Record<string, any>;
  [key: string]: any;
}

/**
 * 验证通道名称是否有效（非空且非纯空白）
 */
export function isValidChannel(channel: string): boolean {
  return typeof channel === 'string' && channel.trim().length > 0;
}

/**
 * 新增绑定：将新绑定追加到配置的 bindings 数组中
 * 返回更新后的配置副本
 */
export function addBindingToConfig(
  config: OpenClawConfig,
  draft: BindingDraft,
): OpenClawConfig {
  const channel = draft.binding.match.channel.trim();
  const accountId = draft.binding.match.accountId.trim();

  const newBinding: BindingRecord = {
    agentId: draft.binding.agentId,
    match: { channel, accountId },
  };

  const nextBindings = [...config.bindings, newBinding];
  const nextConfig: OpenClawConfig = { ...config, bindings: nextBindings };

  // 如有账号配置，写入 channels 节点
  if (draft.accountConfig && channel && accountId) {
    nextConfig.channels = {
      ...(nextConfig.channels || {}),
      [channel]: {
        ...(nextConfig.channels?.[channel] || {}),
        accounts: {
          ...(nextConfig.channels?.[channel]?.accounts || {}),
          [accountId]: draft.accountConfig,
        },
      },
    };
  }

  return nextConfig;
}

/**
 * 删除绑定：从配置中移除指定 Agent 的第 localIndex 条绑定
 * 返回更新后的配置副本，如果索引越界返回 null
 */
export function deleteBindingFromConfig(
  config: OpenClawConfig,
  agentId: string,
  localIndex: number,
): OpenClawConfig | null {
  const bindings = [...config.bindings];

  // 找到属于该 Agent 的所有绑定及其全局索引
  const agentBindings = bindings
    .map((b, i) => ({ binding: b, globalIndex: i }))
    .filter((item) => item.binding.agentId === agentId);

  if (localIndex < 0 || localIndex >= agentBindings.length) {
    return null; // 索引越界
  }

  const globalIndex = agentBindings[localIndex].globalIndex;
  bindings.splice(globalIndex, 1);

  return { ...config, bindings };
}

/**
 * 编辑绑定：更新配置中指定 Agent 的第 localIndex 条绑定
 * 返回更新后的配置副本，如果索引越界返回 null
 */
export function editBindingInConfig(
  config: OpenClawConfig,
  agentId: string,
  localIndex: number,
  draft: BindingDraft,
): OpenClawConfig | null {
  const bindings = [...config.bindings];

  const agentBindings = bindings
    .map((b, i) => ({ binding: b, globalIndex: i }))
    .filter((item) => item.binding.agentId === agentId);

  if (localIndex < 0 || localIndex >= agentBindings.length) {
    return null;
  }

  const target = agentBindings[localIndex];
  // 合并策略：保留原始记录的扩展字段，对 match 子对象也进行合并而非覆盖
  bindings[target.globalIndex] = {
    ...target.binding,
    ...draft.binding,
    match: {
      ...target.binding.match,
      ...draft.binding.match,
    },
  };

  const nextConfig: OpenClawConfig = { ...config, bindings };

  const channel = typeof draft.binding?.match?.channel === 'string'
    ? draft.binding.match.channel
    : '';
  const accountId = typeof draft.binding?.match?.accountId === 'string'
    ? draft.binding.match.accountId
    : '';

  if (channel && accountId && draft.accountConfig) {
    (nextConfig as any).channels = {
      ...(nextConfig.channels || {}),
      [channel]: {
        ...(nextConfig.channels?.[channel] || {}),
        accounts: {
          ...(nextConfig.channels?.[channel]?.accounts || {}),
          [accountId]: draft.accountConfig,
        },
      },
    };
  }

  return nextConfig;
}

/**
 * 获取指定 Agent 的绑定列表
 */
export function getAgentBindings(
  config: OpenClawConfig,
  agentId: string,
): BindingRecord[] {
  return config.bindings.filter((b) => b.agentId === agentId);
}

/**
 * 检查绑定记录结构是否合法
 */
export function isValidBindingRecord(record: any, expectedAgentId: string): boolean {
  if (!record || typeof record !== 'object') return false;
  if (record.agentId !== expectedAgentId) return false;
  if (!record.match || typeof record.match !== 'object') return false;
  if (typeof record.match.channel !== 'string') return false;
  if (typeof record.match.accountId !== 'string') return false;
  return true;
}


/**
 * 脏检查：比较草稿和基线的 JSON 序列化结果
 * 返回 true 表示有未保存的修改
 */
export function isDirtyBinding(draft: any, baseline: any): boolean {
  return JSON.stringify(draft ?? {}, null, 2) !== JSON.stringify(baseline ?? {}, null, 2);
}


/**
 * 按渠道类型筛选绑定列表
 * 返回 bindings 数组中 match.channel === channelType 的记录
 */
export function filterBindingsByChannel(
  config: OpenClawConfig,
  channelType: string,
): BindingRecord[] {
  return config.bindings.filter((b) => b.match.channel === channelType);
}

/**
 * 验证绑定草稿（agentId + channel 必填）
 * 返回错误消息数组，空数组表示验证通过
 */
export function validateBindingDraft(draft: BindingDraft): string[] {
  const errors: string[] = [];

  if (
    !draft.binding.agentId ||
    typeof draft.binding.agentId !== 'string' ||
    draft.binding.agentId.trim().length === 0
  ) {
    errors.push('agentId 不能为空');
  }

  if (
    !draft.binding.match.channel ||
    typeof draft.binding.match.channel !== 'string' ||
    draft.binding.match.channel.trim().length === 0
  ) {
    errors.push('match.channel 不能为空');
  }

  return errors;
}
