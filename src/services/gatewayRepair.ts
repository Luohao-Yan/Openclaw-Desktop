import type { DesktopRuntimeInfo } from '../types/desktopRuntime';
import type { GatewayRepairResult, OpenClawCommandRepairResult } from '../types/electron';

export interface GatewayRepairExecutionResult {
  message: string;
  shouldShowDetails: boolean;
  steps: string[];
  success: boolean;
  tone: 'success' | 'error' | 'loading';
}

interface RunGatewayRepairOptions {
  issueHint?: string;
  repairCapabilityAvailable: boolean;
  runtimeInfo: DesktopRuntimeInfo | null;
}

export const createGatewayRepairLoadingState = (): GatewayRepairExecutionResult => ({
  message: '正在检查并修复 OpenClaw，请稍候...',
  shouldShowDetails: true,
  steps: [],
  success: false,
  tone: 'loading',
});

export const runGatewayRepair = async ({
  issueHint,
  repairCapabilityAvailable,
  runtimeInfo,
}: RunGatewayRepairOptions): Promise<GatewayRepairExecutionResult> => {
  const normalizedHint = (issueHint || '').toLowerCase();
  const shouldTryCommandRepair = normalizedHint.includes('enoent')
    || normalizedHint.includes('not found')
    || normalizedHint.includes('未找到 openclaw')
    || normalizedHint.includes('可执行命令')
    || normalizedHint.includes('unable to execute openclaw')
    || normalizedHint.includes('spawn openclaw');

  if (shouldTryCommandRepair && typeof window.electronAPI?.autoRepairOpenClawCommand === 'function') {
    try {
      const result = await window.electronAPI.autoRepairOpenClawCommand() as OpenClawCommandRepairResult;
      const steps = Array.isArray(result?.steps) ? result.steps : [];

      return {
        message: result.message || (result.success ? 'OpenClaw 命令路径已修复。' : 'OpenClaw 命令未修复，请查看详情。'),
        shouldShowDetails: true,
        steps,
        success: Boolean(result.success),
        tone: result.success ? 'success' : 'error',
      };
    } catch (error) {
      return {
        message: 'OpenClaw 命令自动修复失败，请查看详情。',
        shouldShowDetails: true,
        steps: [error instanceof Error ? error.message : String(error)],
        success: false,
        tone: 'error',
      };
    }
  }

  if (!repairCapabilityAvailable || typeof window.electronAPI?.gatewayRepairCompatibility !== 'function') {
    return {
      message: '当前功能还没有完成更新，请先重启桌面应用后再试。',
      shouldShowDetails: true,
      steps: [
        `当前桌面端版本：${runtimeInfo?.appVersionLabel || 'unknown'}`,
        '当前运行中的窗口还没有加载完整的修复能力。',
        '请完全退出 OpenClaw Desktop 后重新打开，再点击修复入口。',
      ],
      success: false,
      tone: 'error',
    };
  }

  try {
    const result = await window.electronAPI.gatewayRepairCompatibility() as GatewayRepairResult;
    const steps = Array.isArray(result?.steps) ? result.steps : [];

    if (result?.success) {
      return {
        message: result.message || 'OpenClaw 已完成修复，请继续使用。',
        shouldShowDetails: true,
        steps,
        success: true,
        tone: 'success',
      };
    }

    return {
      message: result?.message || result?.status?.error || '修复没有完成，请查看详情继续处理。',
      shouldShowDetails: true,
      steps,
      success: false,
      tone: 'error',
    };
  } catch (error) {
    return {
      message: '修复没有完成，请查看详情后重试。',
      shouldShowDetails: true,
      steps: [error instanceof Error ? error.message : String(error)],
      success: false,
      tone: 'error',
    };
  }
};
