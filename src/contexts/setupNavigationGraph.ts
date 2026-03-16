// ============================================================================
// Setup Flow Navigation Graph
// 引导流程声明式导航图，定义所有步骤及其前进/后退关系
// ============================================================================

import type { SetupState } from './setupReducer';

// ============================================================================
// 导航节点接口定义
// ============================================================================

/**
 * 导航节点定义
 * 描述引导流程中的单个步骤及其导航关系
 *
 * @see 需求 4.1 — Navigation_Graph 使用声明式配置定义所有步骤及其前进/后退关系
 */
export interface NavigationNode {
  /** 路由路径 */
  path: string;
  /** 默认前进目标，null 表示由用户选择或流程结束 */
  next: string | null;
  /** 默认后退目标，可以是字符串或根据状态计算的函数 */
  prev: string | ((state: SetupState) => string | null);
  /** 跳过条件：返回 true 时跳过此步骤 */
  skip?: (state: SetupState) => boolean;
  /** 步骤标签（用于 UI 显示） */
  label?: string;
}

// ============================================================================
// 导航图常量定义
// ============================================================================

/**
 * 完整导航图配置
 * 包含所有引导步骤节点及其导航关系
 *
 * 导航分支说明：
 * - 本地路径: welcome → local/intro → local/environment → local/check →
 *            (confirm-existing OR install-guide) → local/configure →
 *            local/channels → local/create-agent → local/verify → complete
 * - 远程路径: welcome → remote/intro → remote/config → remote/verify → complete
 *
 * @see 需求 4.1 — Navigation_Graph 使用声明式配置定义所有步骤及其前进/后退关系
 * @see 需求 4.3 — Navigation_Graph 支持条件导航
 * @see 需求 4.5 — Navigation_Graph 支持步骤跳过逻辑
 */
export const NAVIGATION_GRAPH: NavigationNode[] = [
  // ========================================================================
  // 欢迎页（入口）
  // ========================================================================
  {
    path: '/setup/welcome',
    next: null, // 由用户选择 local 或 remote 路径
    prev: () => null, // 无上一步
    label: '欢迎',
  },

  // ========================================================================
  // 本地安装路径
  // ========================================================================
  {
    path: '/setup/local/intro',
    next: '/setup/local/environment',
    prev: () => '/setup/welcome',
    label: '本地安装介绍',
  },
  {
    path: '/setup/local/environment',
    next: '/setup/local/check',
    prev: () => '/setup/local/intro',
    // 当运行时层级为 bundled 且内置 Node 和 OpenClaw 都可用时，可跳过环境检测
    skip: (state) => {
      const check = state.environment.check;
      if (check.status !== 'success' && check.status !== 'fallback') {
        return false;
      }
      const data = check.data;
      return (
        data.runtimeTier === 'bundled' &&
        data.bundledNodeAvailable === true &&
        data.bundledOpenClawAvailable === true
      );
    },
    label: '环境检测',
  },
  {
    path: '/setup/local/check',
    next: null, // 根据检测结果决定：confirm-existing 或 install-guide
    prev: () => '/setup/local/environment',
    label: '本地检测',
  },
  {
    path: '/setup/local/confirm-existing',
    next: '/setup/local/configure',
    prev: () => '/setup/local/check',
    label: '确认现有安装',
  },
  {
    path: '/setup/local/install-guide',
    next: '/setup/local/configure',
    prev: () => '/setup/local/check',
    label: '安装指南',
  },
  {
    path: '/setup/local/configure',
    next: '/setup/local/channels',
    // 条件导航：根据 localInstallValidated 决定回退目标
    prev: (state) =>
      state.settings.localInstallValidated
        ? '/setup/local/confirm-existing'
        : '/setup/local/install-guide',
    label: '配置',
  },
  {
    path: '/setup/local/channels',
    next: '/setup/local/create-agent',
    prev: () => '/setup/local/configure',
    label: '渠道配置',
  },
  {
    path: '/setup/local/create-agent',
    next: '/setup/local/verify',
    prev: () => '/setup/local/channels',
    label: '创建 Agent',
  },
  {
    path: '/setup/local/verify',
    next: '/setup/complete',
    prev: () => '/setup/local/create-agent',
    label: '验证',
  },

  // ========================================================================
  // 远程连接路径
  // ========================================================================
  {
    path: '/setup/remote/intro',
    next: '/setup/remote/config',
    prev: () => '/setup/welcome',
    label: '远程连接介绍',
  },
  {
    path: '/setup/remote/config',
    next: '/setup/remote/verify',
    prev: () => '/setup/remote/intro',
    label: '远程配置',
  },
  {
    path: '/setup/remote/verify',
    next: '/setup/complete',
    prev: () => '/setup/remote/config',
    label: '远程验证',
  },

  // ========================================================================
  // 完成页（终点）
  // ========================================================================
  {
    path: '/setup/complete',
    next: null, // 流程结束
    // 条件导航：根据模式决定回退目标
    prev: (state) =>
      state.mode === 'remote'
        ? '/setup/remote/verify'
        : '/setup/local/verify',
    label: '完成',
  },
];

// ============================================================================
// 导航辅助函数
// ============================================================================

/**
 * 根据路径查找导航节点
 *
 * @param pathname - 当前路由路径
 * @returns 匹配的导航节点，未找到时返回 undefined
 */
function findNode(pathname: string): NavigationNode | undefined {
  return NAVIGATION_GRAPH.find((node) => node.path === pathname);
}

/**
 * 从导航图中查找上一步路径
 * 替代原有的硬编码 backMap
 *
 * @param pathname - 当前路由路径
 * @param state - 当前引导流程状态
 * @returns 上一步路径，无上一步时返回 null，路径无效时回退到 welcome
 *
 * @see 需求 4.4 — getPreviousStep 函数从 Navigation_Graph 配置中查找而非硬编码映射
 */
export function getPreviousStep(pathname: string, state: SetupState): string | null {
  const node = findNode(pathname);

  // 路径不在导航图中，回退到 welcome
  if (!node) {
    return '/setup/welcome';
  }

  // 计算上一步路径
  const prev = typeof node.prev === 'function' ? node.prev(state) : node.prev;
  return prev;
}

/**
 * 从导航图中查找下一步路径
 *
 * @param pathname - 当前路由路径
 * @param state - 当前引导流程状态（预留，用于未来条件导航扩展）
 * @returns 下一步路径，无下一步时返回 null
 */
export function getNextStep(pathname: string, _state: SetupState): string | null {
  const node = findNode(pathname);

  // 路径不在导航图中
  if (!node) {
    return null;
  }

  return node.next;
}

/**
 * 检查是否应该跳过指定步骤
 *
 * @param pathname - 要检查的路由路径
 * @param state - 当前引导流程状态
 * @returns 是否应该跳过该步骤
 *
 * @see 需求 4.5 — Navigation_Graph 支持步骤跳过逻辑
 */
export function shouldSkipStep(pathname: string, state: SetupState): boolean {
  const node = findNode(pathname);

  // 路径不在导航图中，不跳过
  if (!node) {
    return false;
  }

  // 没有定义跳过条件，不跳过
  if (!node.skip) {
    return false;
  }

  return node.skip(state);
}

/**
 * 验证指定路径从 welcome 是否可达
 * 通过 next 链接遍历检查可达性
 *
 * @param pathname - 要验证的路由路径
 * @returns 是否从 welcome 可达
 *
 * @see 需求 4.2 — Navigation_Graph 自动验证所有步骤的可达性
 */
export function validateStepReachability(pathname: string): boolean {
  // welcome 本身始终可达
  if (pathname === '/setup/welcome') {
    return true;
  }

  // 检查路径是否存在于导航图中
  const targetNode = findNode(pathname);
  if (!targetNode) {
    return false;
  }

  // 构建所有可达路径的集合
  // 从 welcome 开始，通过 next 链接和分支遍历
  const reachable = new Set<string>();
  const queue: string[] = ['/setup/welcome'];

  while (queue.length > 0) {
    const current = queue.shift()!;

    // 已访问过，跳过
    if (reachable.has(current)) {
      continue;
    }

    reachable.add(current);

    // 找到目标路径，可达
    if (current === pathname) {
      return true;
    }

    const node = findNode(current);
    if (!node) {
      continue;
    }

    // 添加 next 链接到队列
    if (node.next) {
      queue.push(node.next);
    }

    // 特殊处理：从 welcome 可以到达 local/intro 和 remote/intro
    if (current === '/setup/welcome') {
      queue.push('/setup/local/intro');
      queue.push('/setup/remote/intro');
    }

    // 特殊处理：从 local/check 可以到达 confirm-existing 和 install-guide
    if (current === '/setup/local/check') {
      queue.push('/setup/local/confirm-existing');
      queue.push('/setup/local/install-guide');
    }
  }

  // 遍历完成后检查是否可达
  return reachable.has(pathname);
}

/**
 * 恢复持久化的步骤路径
 * 验证路径有效性，无效时回退到 welcome
 *
 * @param persistedPath - 从存储中恢复的路径
 * @returns 有效的路径，无效时返回 welcome
 *
 * @see 需求 4.6 — 从持久化存储恢复当前步骤并验证步骤有效性
 */
export function restoreStep(persistedPath: string | null | undefined): string {
  // 空路径，回退到 welcome
  if (!persistedPath) {
    return '/setup/welcome';
  }

  // 检查路径是否存在于导航图中
  const node = findNode(persistedPath);
  if (!node) {
    return '/setup/welcome';
  }

  // 路径有效，返回原路径
  return persistedPath;
}

/**
 * 获取所有导航图中的有效路径
 * 用于验证和调试
 *
 * @returns 所有有效路径的数组
 */
export function getAllValidPaths(): string[] {
  return NAVIGATION_GRAPH.map((node) => node.path);
}

/**
 * 获取指定路径的步骤标签
 *
 * @param pathname - 路由路径
 * @returns 步骤标签，未找到时返回 undefined
 */
export function getStepLabel(pathname: string): string | undefined {
  const node = findNode(pathname);
  return node?.label;
}
