/**
 * 运行时解析纯逻辑模块
 *
 * 将 runtime.ts 中的核心决策逻辑提取为纯函数，
 * 不依赖 Electron、文件系统、进程或网络，便于单元测试和属性测试。
 */

// ─── 类型定义 ────────────────────────────────────────────────────────────────

/** 运行时层级：内置 > 系统 > 在线安装 > 缺失 */
export type RuntimeTier = 'bundled' | 'system' | 'online' | 'missing';

/** 描述运行时各组件可用性的场景对象 */
export interface RuntimeScenario {
  /** 内置 Node.js 文件是否存在 */
  bundledNodeAvailable: boolean;
  /** 内置 Node.js 是否可执行（文件存在但可能损坏或无权限） */
  bundledNodeExecutable: boolean;
  /** 内置 OpenClaw CLI 文件是否存在 */
  bundledClawAvailable: boolean;
  /** 内置 OpenClaw CLI 是否可执行 */
  bundledClawExecutable: boolean;
  /** 系统 Node.js 是否可用 */
  systemNodeAvailable: boolean;
  /** 系统 Node.js 主版本号（仅在 systemNodeAvailable 为 true 时有意义） */
  systemNodeVersion: number;
  /** 系统 OpenClaw CLI 是否可用 */
  systemClawAvailable: boolean;
  /** 网络是否可用 */
  networkAvailable: boolean;
}

// ─── 纯函数：确定运行时层级 ──────────────────────────────────────────────────

/**
 * 根据运行时场景确定运行时层级
 *
 * 封装 resolveRuntime() 的核心决策逻辑，不依赖文件系统、进程或网络，
 * 便于属性测试验证三级回退优先级的一致性。
 *
 * 决策规则：
 *   1. bundledNode 和 bundledClaw 都可用且可执行 → 'bundled'
 *   2. bundledNode 可用可执行但 bundledClaw 不可执行，系统 CLI 可用 → 'bundled'
 *   3. 系统 Node.js >= 22 → 'system'（无论系统 CLI 是否可用）
 *   4. 有网络 → 'online'
 *   5. 无网络 → 'missing'
 */
export function determineRuntimeTier(scenario: RuntimeScenario): RuntimeTier {
  // ── 第一级：内置运行时 ──────────────────────────────────────────────────
  if (scenario.bundledNodeAvailable && scenario.bundledClawAvailable) {
    if (scenario.bundledNodeExecutable) {
      if (scenario.bundledClawExecutable) {
        // 内置 Node.js + 内置 CLI 均可执行
        return 'bundled';
      }
      // 内置 CLI 不可执行，尝试系统 CLI 作为补充
      if (scenario.systemClawAvailable) {
        return 'bundled';
      }
    }
    // 内置 Node.js 不可执行，回退到第二级
  }

  // ── 第二级：系统 Node.js ────────────────────────────────────────────────
  if (scenario.systemNodeAvailable && scenario.systemNodeVersion >= 22) {
    return 'system';
  }

  // ── 第三级：网络可用性 ──────────────────────────────────────────────────
  return scenario.networkAvailable ? 'online' : 'missing';
}

// ─── 辅助：解析主版本号 ─────────────────────────────────────────────────────

/**
 * 从版本字符串中提取主版本号
 * 例如 "v22.16.0" → 22, "18.0.0" → 18
 */
export function parseMajorVersion(version?: string): number | null {
  if (!version) return null;
  const cleaned = version.trim().replace(/^v/i, '');
  const major = Number.parseInt(cleaned.split('.')[0] || '', 10);
  return Number.isFinite(major) ? major : null;
}
