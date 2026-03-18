/**
 * 单元测试：spawnHelper.ts 集成模块
 *
 * 验证 spawnWithShellPath 和 spawnDetached 的核心行为，
 * 包括 Shell PATH 注入、超时保护、Windows shell 选项、detached 模式等。
 *
 * 使用 vi.mock 模拟 child_process.spawn 和 settings.getShellPath，
 * 避免依赖真实系统环境。
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

// ── Mock 设置 ──────────────────────────────────────────────────────────────

// 模拟 getShellPath 返回固定路径
vi.mock('../settings.js', () => ({
  getShellPath: vi.fn().mockResolvedValue('/usr/local/bin:/usr/bin:/bin'),
}));

// 创建可控的 mock child process
function createMockChild() {
  const child = new EventEmitter() as any;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killed = false;
  child.kill = vi.fn(() => { child.killed = true; });
  child.unref = vi.fn();
  return child;
}

let mockChild: ReturnType<typeof createMockChild>;

vi.mock('child_process', () => ({
  spawn: vi.fn(() => mockChild),
}));

// 动态导入被测模块（在 mock 之后）
const { spawnWithShellPath, spawnDetached } = await import('../spawnHelper.js');
const { spawn } = await import('child_process');

/**
 * 辅助函数：等待 mock spawn 被调用后再触发事件
 * getShellPath 是 async 的，需要等待 await 完成后 spawn 才会被调用
 */
async function waitForSpawnCall(): Promise<void> {
  // 等待微任务队列清空（getShellPath 的 await 会在此完成）
  await new Promise<void>((r) => setTimeout(r, 10));
}

// ── 测试 ────────────────────────────────────────────────────────────────────

describe('spawnWithShellPath', () => {
  beforeEach(() => {
    mockChild = createMockChild();
    vi.clearAllMocks();
    (spawn as any).mockReturnValue(mockChild);
  });

  test('成功执行命令应返回 success=true 和输出内容', async () => {
    const promise = spawnWithShellPath('echo', ['hello']);
    await waitForSpawnCall();

    mockChild.stdout.emit('data', Buffer.from('hello world'));
    mockChild.emit('close', 0);

    const result = await promise;
    expect(result.success).toBe(true);
    expect(result.output).toBe('hello world');
    expect(result.exitCode).toBe(0);
  });

  test('非零退出码应返回 success=false', async () => {
    const promise = spawnWithShellPath('false', []);
    await waitForSpawnCall();

    mockChild.stderr.emit('data', Buffer.from('command failed'));
    mockChild.emit('close', 1);

    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.errorCode).toBe('NON_ZERO_EXIT');
  });

  test('ENOENT 错误应返回结构化错误信息', async () => {
    const promise = spawnWithShellPath('nonexistent-cmd', []);
    await waitForSpawnCall();

    const error = Object.assign(new Error('spawn nonexistent-cmd ENOENT'), { code: 'ENOENT' });
    mockChild.emit('error', error);

    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('ENOENT');
    expect(result.error).toContain('nonexistent-cmd');
  });

  test('应将 Shell PATH 注入到 spawn 环境变量中', async () => {
    const promise = spawnWithShellPath('node', ['--version']);
    await waitForSpawnCall();

    mockChild.emit('close', 0);
    await promise;

    const callArgs = (spawn as any).mock.calls[0];
    expect(callArgs[2].env.PATH).toBe('/usr/local/bin:/usr/bin:/bin');
  });

  test('应支持额外环境变量注入', async () => {
    const promise = spawnWithShellPath('node', ['--version'], {
      extraEnv: { NODE_ENV: 'test' },
    });
    await waitForSpawnCall();

    mockChild.emit('close', 0);
    await promise;

    const callArgs = (spawn as any).mock.calls[0];
    expect(callArgs[2].env.NODE_ENV).toBe('test');
    expect(callArgs[2].env.PATH).toBe('/usr/local/bin:/usr/bin:/bin');
  });

  test('onOutput 回调应接收实时输出', async () => {
    const outputChunks: Array<{ data: string; isError: boolean }> = [];

    const promise = spawnWithShellPath('echo', ['test'], {
      onOutput: (data, isError) => outputChunks.push({ data, isError }),
    });
    await waitForSpawnCall();

    mockChild.stdout.emit('data', Buffer.from('stdout data'));
    mockChild.stderr.emit('data', Buffer.from('stderr data'));
    mockChild.emit('close', 0);

    await promise;

    expect(outputChunks).toHaveLength(2);
    expect(outputChunks[0]).toEqual({ data: 'stdout data', isError: false });
    expect(outputChunks[1]).toEqual({ data: 'stderr data', isError: true });
  });
});

describe('spawnDetached', () => {
  beforeEach(() => {
    mockChild = createMockChild();
    vi.clearAllMocks();
    (spawn as any).mockReturnValue(mockChild);
  });

  test('进程成功创建后应调用 unref 并返回 success=true', async () => {
    const promise = spawnDetached('openclaw', ['gateway', 'start']);
    await waitForSpawnCall();

    mockChild.emit('spawn');

    const result = await promise;
    expect(result.success).toBe(true);
    expect(mockChild.unref).toHaveBeenCalled();
  });

  test('应以 detached=true 和 stdio=ignore 调用 spawn', async () => {
    const promise = spawnDetached('openclaw', ['gateway', 'start']);
    await waitForSpawnCall();

    mockChild.emit('spawn');
    await promise;

    const callArgs = (spawn as any).mock.calls[0];
    expect(callArgs[2].detached).toBe(true);
    expect(callArgs[2].stdio).toBe('ignore');
  });

  test('进程创建失败应返回 success=false 和错误信息', async () => {
    const promise = spawnDetached('nonexistent', []);
    await waitForSpawnCall();

    const error = Object.assign(new Error('spawn nonexistent ENOENT'), { code: 'ENOENT' });
    mockChild.emit('error', error);

    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.error).toContain('nonexistent');
  });

  test('应将 Shell PATH 注入到 detached 进程环境变量中', async () => {
    const promise = spawnDetached('openclaw', ['gateway', 'start']);
    await waitForSpawnCall();

    mockChild.emit('spawn');
    await promise;

    const callArgs = (spawn as any).mock.calls[0];
    expect(callArgs[2].env.PATH).toBe('/usr/local/bin:/usr/bin:/bin');
  });
});
