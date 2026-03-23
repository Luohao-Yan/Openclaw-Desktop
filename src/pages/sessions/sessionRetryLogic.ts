/**
 * Session 回复重试逻辑
 *
 * 当 sessionsSend 返回成功但 transcript 为空时，使用指数退避重试机制
 * 多次尝试刷新 transcript，直到读取到非空数据或达到最大重试次数。
 *
 * 退避策略：首次立即调用，后续重试间隔依次翻倍
 * 示例（initialDelay=500）：
 *   第 1 次：立即调用（无延迟）
 *   第 2 次：等待 500ms 后调用
 *   第 3 次：等待 1000ms 后调用
 *   第 4 次：等待 2000ms 后调用
 */

/**
 * 指数退避重试刷新 transcript
 *
 * @param refreshFn - 刷新函数，返回 transcript 数组
 * @param options - 可选配置项
 * @param options.maxRetries - 最大重试次数，默认 4
 * @param options.initialDelay - 初始延迟（毫秒），默认 500
 * @returns 包含 success、transcript 和 attempts 的结果对象
 */
export async function retryRefreshTranscript(
  refreshFn: () => Promise<any[]>,
  options?: { maxRetries?: number; initialDelay?: number },
): Promise<{ success: boolean; transcript: any[]; attempts: number }> {
  // 解构配置，使用默认值
  const maxRetries = options?.maxRetries ?? 4;
  const initialDelay = options?.initialDelay ?? 500;

  // 当前延迟时间，每次重试后翻倍
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // 第一次立即调用，后续重试前等待退避延迟
    if (attempt > 1) {
      await new Promise(resolve => setTimeout(resolve, delay));
      // 延迟翻倍，为下一次重试准备
      delay *= 2;
    }

    // 调用 refreshFn 尝试获取 transcript
    const transcript = await refreshFn();

    // 若返回非空数组，立即返回成功结果
    if (transcript.length > 0) {
      return { success: true, transcript, attempts: attempt };
    }
  }

  // 所有重试均失败，返回失败结果
  return { success: false, transcript: [], attempts: maxRetries };
}

// ── 异步轮询机制 ──────────────────────────────────────────────────────────────

/** 异步轮询配置选项 */
export interface AsyncPollOptions {
  /** 初始轮询间隔（ms），默认 1000 */
  initialInterval: number;
  /** 最大轮询间隔（ms），默认 5000 */
  maxInterval: number;
  /** 退避因子，默认 1.5 */
  backoffFactor: number;
  /** 最大轮询总时长（ms），默认 180000 */
  maxDuration: number;
}

/** pollForReply 的返回结果 */
export interface PollResult {
  /** 是否成功检测到新回复 */
  success: boolean;
  /** 最新的 transcript 数组 */
  transcript: any[];
  /** 是否因超时而停止 */
  timedOut: boolean;
  /** 是否因连续失败而停止 */
  failedConsecutively?: boolean;
}

/** 默认轮询配置 */
const DEFAULT_POLL_OPTIONS: AsyncPollOptions = {
  initialInterval: 1000,
  maxInterval: 5000,
  backoffFactor: 1.5,
  maxDuration: 180_000,
};

/** 连续失败阈值：refreshFn 连续抛异常达到此次数后停止轮询 */
const CONSECUTIVE_FAILURE_THRESHOLD = 3;

/**
 * 计算第 n 次轮询的等待间隔
 *
 * 公式：min(initialInterval * backoffFactor^n, maxInterval)
 *
 * @param n - 轮询次数（从 0 开始）
 * @param options - 轮询配置
 * @returns 等待间隔（ms）
 */
export function calculateBackoffInterval(
  n: number,
  options?: Partial<AsyncPollOptions>,
): number {
  const { initialInterval, maxInterval, backoffFactor } = { ...DEFAULT_POLL_OPTIONS, ...options };
  return Math.min(initialInterval * Math.pow(backoffFactor, n), maxInterval);
}

/**
 * 异步轮询检测 agent 回复
 *
 * 使用指数退避策略定期调用 refreshFn 获取 transcript，
 * 当检测到新的 assistant 消息时停止轮询并返回。
 *
 * @param refreshFn - 刷新函数，返回 transcript 数组
 * @param baselineCount - 发送前 transcript 中 assistant 消息的数量
 * @param options - 可选的轮询配置
 * @returns 轮询结果
 */
export async function pollForReply(
  refreshFn: () => Promise<any[]>,
  baselineCount: number,
  options?: Partial<AsyncPollOptions>,
): Promise<PollResult> {
  const config = { ...DEFAULT_POLL_OPTIONS, ...options };
  const startTime = Date.now();
  let consecutiveFailures = 0;
  let pollCount = 0;

  while (true) {
    // 计算当前轮询间隔并等待
    const interval = calculateBackoffInterval(pollCount, config);
    await new Promise((resolve) => setTimeout(resolve, interval));
    pollCount++;

    // 检查是否超时
    const elapsed = Date.now() - startTime;
    if (elapsed >= config.maxDuration) {
      return { success: false, transcript: [], timedOut: true };
    }

    try {
      // 调用 refreshFn 获取最新 transcript
      const transcript = await refreshFn();
      // 重置连续失败计数
      consecutiveFailures = 0;

      // 统计 assistant 消息数量
      const assistantCount = transcript.filter(
        (msg: any) => msg.role === 'assistant',
      ).length;

      // 检测到新的 assistant 消息，轮询成功
      if (assistantCount > baselineCount) {
        return { success: true, transcript, timedOut: false };
      }
    } catch {
      // refreshFn 抛出异常，累计连续失败次数
      consecutiveFailures++;
      if (consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD) {
        return {
          success: false,
          transcript: [],
          timedOut: false,
          failedConsecutively: true,
        };
      }
    }
  }
}
