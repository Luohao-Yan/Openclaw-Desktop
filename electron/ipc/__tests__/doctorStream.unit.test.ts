/**
 * 单元测试：system:doctorStream IPC 处理器
 * Feature: openclaw-doctor-repair
 *
 * 验证 doctorStream 的核心行为：
 * - 正常执行返回 { success: true, output }
 * - 并发调用返回 { success: false, error: '修复正在进行中' }
 * - 超时处理
 * - 流式输出事件推送
 *
 * 需求：4.1, 4.5, 4.6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock spawnWithShellPath ──────────────────────────────────────────────────

/** 存储 spawnWithShellPath 的 mock 实现 */
let spawnMockImpl: (...args: any[]) => Promise<any>;

vi.mock('../spawnHelper.js', () => ({
  spawnWithShellPath: (...args: any[]) => spawnMockImpl(...args),
}));

// ── Mock electron 模块 ──────────────────────────────────────────────────────

const mockHandle = vi.fn();
vi.mock('electron', () => ({
  default: {
    app: { getVersion: () => '0.0.1-test' },
    ipcMain: { handle: (...args: any[]) => mockHandle(...args) },
    shell: { openExternal: vi.fn() },
  },
}));

// ── Mock 其他依赖 ────────────────────────────────────────────────────────────

vi.mock('../settings.js', () => ({
  getBundledOpenClawPath: () => null,
  detectOpenClawInstallation: async () => ({ source: 'not-found', path: '', type: '' }),
  getOpenClawRootDir: () => '/tmp/openclaw',
  resolveOpenClawCommand: () => 'openclaw',
  resolveNpmGlobalBin: async () => null,
  getVersionManagerPaths: () => [],
  getShellPath: async () => '/usr/bin:/bin',
}));

vi.mock('../runtime.js', () => ({
  resolveRuntime: async () => ({
    tier: 'system',
    nodePath: '/usr/bin/node',
    openclawPath: '/usr/bin/openclaw',
    bundledNodeAvailable: false,
    bundledOpenClawAvailable: false,
    systemNodeVersion: '22.0.0',
    systemNodeSatisfies: true,
    systemOpenClawInstalled: true,
  }),
  getBundledNodePath: () => null,
  getBundledOpenClawCLIPath: () => null,
}));

vi.mock('../runtimeLogic.js', () => ({}));
vi.mock('../modelTestLogic.js', () => ({
  buildModelTestUrl: () => 'http://localhost',
  resolveApiKey: () => ({ resolved: null }),
}));
vi.mock('../clawhubInstallLogic.js', () => ({
  resolveClawHubStatus: () => ({ installed: false }),
  buildClawHubFixableIssue: () => null,
}));
vi.mock('../../config/manifest-version.js', () => ({
  CURRENT_MANIFEST_VERSION: '3.24',
  SUPPORTED_MANIFEST_VERSIONS: ['3.24'],
}));

// ── 辅助函数 ────────────────────────────────────────────────────────────────

/** 从 mockHandle 调用中提取指定通道的处理器函数 */
function getHandler(channel: string): ((...args: any[]) => Promise<any>) | undefined {
  for (const call of mockHandle.mock.calls) {
    if (call[0] === channel) {
      return call[1];
    }
  }
  return undefined;
}

/** 创建模拟的 IPC event 对象 */
function createMockEvent() {
  return {
    sender: {
      send: vi.fn(),
    },
  };
}

// ── 测试 ────────────────────────────────────────────────────────────────────

describe('system:doctorStream IPC 处理器', () => {
  beforeEach(async () => {
    mockHandle.mockClear();

    // 默认 spawnWithShellPath mock：成功执行
    spawnMockImpl = vi.fn().mockResolvedValue({
      success: true,
      output: '✓ Fixed: test issue',
      error: undefined,
    });

    // 动态导入 system.ts 以触发 setupSystemIPC 注册
    // 需要重置模块缓存以确保每次测试都重新注册
    const mod = await import('../system.js');
    // 重置并发锁状态
    mod._resetDoctorRunning();
    mod.setupSystemIPC();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('正常执行返回 { success: true, output }', async () => {
    const handler = getHandler('system:doctorStream');
    expect(handler).toBeDefined();

    const event = createMockEvent();
    const result = await handler!(event);

    expect(result).toEqual({
      success: true,
      output: '✓ Fixed: test issue',
      error: undefined,
    });
  });

  it('执行时通过 onOutput 回调推送流式输出', async () => {
    // 自定义 spawnWithShellPath 以捕获 onOutput 回调
    spawnMockImpl = vi.fn().mockImplementation(
      async (_cmd: string, _args: string[], options?: { onOutput?: (data: string, isError: boolean) => void }) => {
        // 模拟流式输出
        options?.onOutput?.('stdout data', false);
        options?.onOutput?.('stderr data', true);
        return { success: true, output: 'stdout data\nstderr data', error: undefined };
      },
    );

    // 重新注册处理器
    mockHandle.mockClear();
    const mod = await import('../system.js');
    mod._resetDoctorRunning();
    mod.setupSystemIPC();

    const handler = getHandler('system:doctorStream');
    const event = createMockEvent();
    await handler!(event);

    // 验证 sender.send 被调用推送了输出事件
    expect(event.sender.send).toHaveBeenCalledWith('doctor:output', { data: 'stdout data', isError: false });
    expect(event.sender.send).toHaveBeenCalledWith('doctor:output', { data: 'stderr data', isError: true });
  });

  it('并发调用返回 { success: false, error: "修复正在进行中" }', async () => {
    // 使 spawnWithShellPath 永远不 resolve（模拟长时间运行）
    let resolveSpawn: (value: any) => void;
    spawnMockImpl = vi.fn().mockImplementation(
      () => new Promise((resolve) => { resolveSpawn = resolve; }),
    );

    // 重新注册处理器
    mockHandle.mockClear();
    const mod = await import('../system.js');
    mod._resetDoctorRunning();
    mod.setupSystemIPC();

    const handler = getHandler('system:doctorStream');
    const event1 = createMockEvent();
    const event2 = createMockEvent();

    // 第一次调用（不 await，让它挂起）
    const firstCall = handler!(event1);

    // 第二次调用应立即返回错误
    const secondResult = await handler!(event2);
    expect(secondResult).toEqual({
      success: false,
      error: '修复正在进行中，请等待完成',
    });

    // 清理：让第一次调用完成
    resolveSpawn!({ success: true, output: '', error: undefined });
    await firstCall;
  });

  it('并发锁在执行完成后释放', async () => {
    const handler = getHandler('system:doctorStream');
    const event = createMockEvent();

    // 第一次调用完成
    await handler!(event);

    // 第二次调用应该成功（锁已释放）
    const result = await handler!(createMockEvent());
    expect(result.success).toBe(true);
  });

  it('spawnWithShellPath 使用正确的命令和参数', async () => {
    const handler = getHandler('system:doctorStream');
    const event = createMockEvent();
    await handler!(event);

    // 验证 spawnWithShellPath 被调用时的参数
    const spawnFn = spawnMockImpl as ReturnType<typeof vi.fn>;
    expect(spawnFn).toHaveBeenCalledWith(
      'openclaw',
      ['doctor', '--fix'],
      expect.objectContaining({
        timeoutMs: 60_000,
        onOutput: expect.any(Function),
      }),
    );
  });

  it('执行失败时返回 { success: false, error }', async () => {
    spawnMockImpl = vi.fn().mockResolvedValue({
      success: false,
      output: '',
      error: '执行超时',
    });

    // 重新注册处理器
    mockHandle.mockClear();
    const mod = await import('../system.js');
    mod._resetDoctorRunning();
    mod.setupSystemIPC();

    const handler = getHandler('system:doctorStream');
    const event = createMockEvent();
    const result = await handler!(event);

    expect(result).toEqual({
      success: false,
      output: '',
      error: '执行超时',
    });
  });

  it('sender.send 抛出异常时不影响命令执行', async () => {
    // 模拟 sender.send 抛出异常（窗口已关闭）
    spawnMockImpl = vi.fn().mockImplementation(
      async (_cmd: string, _args: string[], options?: { onOutput?: (data: string, isError: boolean) => void }) => {
        options?.onOutput?.('some output', false);
        return { success: true, output: 'some output', error: undefined };
      },
    );

    mockHandle.mockClear();
    const mod = await import('../system.js');
    mod._resetDoctorRunning();
    mod.setupSystemIPC();

    const handler = getHandler('system:doctorStream');
    const event = createMockEvent();
    // 让 sender.send 抛出异常
    event.sender.send.mockImplementation(() => { throw new Error('sender destroyed'); });

    // 命令应该仍然成功完成
    const result = await handler!(event);
    expect(result.success).toBe(true);
  });
});
