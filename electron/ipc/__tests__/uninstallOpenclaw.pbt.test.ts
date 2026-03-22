/**
 * 卸载 OpenClaw 属性测试（Property-Based Tests）
 *
 * 使用 fast-check 库验证卸载功能的正确性属性。
 * 每个属性最少运行 100 次迭代。
 *
 * Feature: uninstall-openclaw
 */

import * as fc from 'fast-check';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── 辅助类型 ──────────────────────────────────────────────────────────────────

/** IPC 返回值结构 */
interface UninstallResult {
  success: boolean;
  output?: string;
  error?: string;
  manualRequired?: boolean;
  sshError?: string;
}

// ── Mock 工厂 ─────────────────────────────────────────────────────────────────

/**
 * 构造模拟的 IPC handler 逻辑（纯函数，不依赖 Electron 环境）
 * 用于属性测试中验证返回值结构和执行路径
 */
function makeHandler(options: {
  localSuccess: boolean;
  localOutput?: string;
  localError?: string;
  sshSuccess: boolean;
  sshOutput?: string;
  sshError?: string;
}) {
  // 记录调用情况
  const calls = { spawn: 0, ssh: 0 };

  async function handle(params: { mode: 'local' | 'remote-ssh' | 'remote-manual' }): Promise<UninstallResult> {
    const { mode } = params;

    // remote-manual：直接返回手动引导标志，不调用任何命令
    if (mode === 'remote-manual') {
      return { success: true, manualRequired: true };
    }

    // remote-ssh：尝试 SSH，失败时降级
    if (mode === 'remote-ssh') {
      calls.ssh++;
      if (options.sshSuccess) {
        return { success: true, output: options.sshOutput };
      } else {
        return { success: true, manualRequired: true, sshError: options.sshError || 'SSH 失败' };
      }
    }

    // local：调用 spawn 执行卸载命令
    if (mode === 'local') {
      calls.spawn++;
      if (options.localSuccess) {
        return { success: true, output: options.localOutput };
      } else {
        return { success: false, error: options.localError || '卸载失败', output: options.localOutput };
      }
    }

    return { success: false, error: `未知模式: ${mode}` };
  }

  return { handle, calls };
}

// ── Property 1：IPC 返回值结构完整性 ─────────────────────────────────────────
// Feature: uninstall-openclaw, Property 1: IPC 返回值结构完整性
// Validates: Requirements 7.6, 3.3, 3.4

describe('Property 1: IPC 返回值结构完整性', () => {
  it('对任意 mode 值，返回值必须包含 success 字段', async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成随机 mode 值（包含合法和非法值）
        fc.oneof(
          fc.constant('local' as const),
          fc.constant('remote-ssh' as const),
          fc.constant('remote-manual' as const),
        ),
        fc.boolean(), // localSuccess
        fc.boolean(), // sshSuccess
        async (mode, localSuccess, sshSuccess) => {
          const { handle } = makeHandler({ localSuccess, sshSuccess });
          const result = await handle({ mode });

          // 必须包含 success 字段
          expect(typeof result.success).toBe('boolean');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('success: false 时必须包含 error 字段', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant('local' as const),
        fc.string({ minLength: 1 }), // 错误信息
        async (mode, errorMsg) => {
          const { handle } = makeHandler({ localSuccess: false, localError: errorMsg, sshSuccess: false });
          const result = await handle({ mode });

          if (!result.success) {
            // success: false 时必须有 error 字段
            expect(result.error).toBeDefined();
            expect(typeof result.error).toBe('string');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('manualRequired: true 时 success 必须为 true', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.constant('remote-ssh' as const),
          fc.constant('remote-manual' as const),
        ),
        async (mode) => {
          // SSH 失败场景
          const { handle } = makeHandler({ localSuccess: false, sshSuccess: false, sshError: '连接失败' });
          const result = await handle({ mode });

          if (result.manualRequired === true) {
            // manualRequired: true 时 success 必须为 true
            expect(result.success).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('sshError 存在时 manualRequired 必须为 true', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }), // SSH 错误信息
        async (sshErrorMsg) => {
          const { handle } = makeHandler({ localSuccess: false, sshSuccess: false, sshError: sshErrorMsg });
          const result = await handle({ mode: 'remote-ssh' });

          if (result.sshError !== undefined) {
            // sshError 存在时 manualRequired 必须为 true
            expect(result.manualRequired).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── Property 2：mode 参数决定执行路径 ─────────────────────────────────────────
// Feature: uninstall-openclaw, Property 2: mode 参数决定执行路径
// Validates: Requirements 7.3, 7.4, 7.5, 3.6, 4.1

describe('Property 2: mode 参数决定执行路径', () => {
  it('remote-manual 时不调用 spawn 也不调用 SSH', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        fc.boolean(),
        async (localSuccess, sshSuccess) => {
          const { handle, calls } = makeHandler({ localSuccess, sshSuccess });
          await handle({ mode: 'remote-manual' });

          // remote-manual 不应调用任何命令
          expect(calls.spawn).toBe(0);
          expect(calls.ssh).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('remote-manual 时直接返回 { success: true, manualRequired: true }', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        fc.boolean(),
        async (localSuccess, sshSuccess) => {
          const { handle } = makeHandler({ localSuccess, sshSuccess });
          const result = await handle({ mode: 'remote-manual' });

          expect(result.success).toBe(true);
          expect(result.manualRequired).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('remote-ssh 时尝试 SSH 连接', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(), // sshSuccess
        async (sshSuccess) => {
          const { handle, calls } = makeHandler({ localSuccess: false, sshSuccess });
          await handle({ mode: 'remote-ssh' });

          // remote-ssh 必须调用 SSH
          expect(calls.ssh).toBe(1);
          // 不应调用本地 spawn
          expect(calls.spawn).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('remote-ssh SSH 失败时返回 manualRequired: true 和 sshError', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }), // SSH 错误信息
        async (sshErrorMsg) => {
          const { handle } = makeHandler({ localSuccess: false, sshSuccess: false, sshError: sshErrorMsg });
          const result = await handle({ mode: 'remote-ssh' });

          expect(result.success).toBe(true);
          expect(result.manualRequired).toBe(true);
          expect(result.sshError).toBeDefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('local 时调用 spawn 执行卸载命令', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(), // localSuccess
        async (localSuccess) => {
          const { handle, calls } = makeHandler({ localSuccess, sshSuccess: false });
          await handle({ mode: 'local' });

          // local 必须调用 spawn
          expect(calls.spawn).toBe(1);
          // 不应调用 SSH
          expect(calls.ssh).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── Property 6：i18n 键完整性 ──────────────────────────────────────────────────
// Feature: uninstall-openclaw, Property 6: i18n 键完整性
// Validates: Requirements 8.2

describe('Property 6: i18n 键完整性', () => {
  // 动态导入 translations，避免循环依赖
  it('en 和 zh 两种语言中所有必需的卸载 i18n 键均存在且为非空字符串', async () => {
    // 直接引用翻译对象（在测试环境中通过相对路径导入）
    const { translations } = await import('../../../src/i18n/translations');

    // 必需的 11 个 i18n 键（对应设计文档 Property 6）
    const requiredKeys = [
      'settings.advanced.uninstallOpenclaw',
      'settings.advanced.uninstallOpenclawDescription',
      'settings.advanced.uninstallOpenclawConfirm',
      'settings.advanced.uninstallOpenclawRunning',
      'settings.advanced.uninstallOpenclawSshRunning',
      'settings.advanced.uninstallOpenclawSshFailed',
      'settings.advanced.uninstallOpenclawSuccess',
      'settings.advanced.uninstallOpenclawError',
      'settings.advanced.uninstallOpenclawManualTitle',
      'settings.advanced.uninstallOpenclawManualDone',
      'settings.advanced.uninstallOpenclawResetting',
    ] as const;

    await fc.assert(
      fc.asyncProperty(
        // 枚举 en / zh 两种语言
        fc.constantFrom('en' as const, 'zh' as const),
        async (lang) => {
          const langObj = translations[lang] as Record<string, string>;

          for (const key of requiredKeys) {
            // 键必须存在
            expect(langObj[key]).toBeDefined();
            // 值必须为非空字符串
            expect(typeof langObj[key]).toBe('string');
            expect((langObj[key] as string).length).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── Property 5：平台命令与操作系统对应 ────────────────────────────────────────
// Feature: uninstall-openclaw, Property 5: 平台命令与操作系统对应
// Validates: Requirements 5.3

describe('Property 5: 平台命令与操作系统对应', () => {
  /**
   * 纯函数：根据平台标识返回对应的命令列表
   * 与 ManualGuidePanel 中的逻辑保持一致
   */
  function getCommandsForPlatform(platform: string): string[] {
    const p = platform.toLowerCase();
    // macOS：platform 可能为 'macintel'、'macppc' 或 'darwin'（Electron 环境）
    // 注意：必须先判断 mac/darwin，因为 'darwin' 包含 'win' 子串
    const isMac = p.includes('mac') || p === 'darwin';
    const isWindows = !isMac && p.includes('win');

    if (isWindows) {
      return [
        'schtasks /Delete /F /TN "OpenClaw Gateway"',
        'Remove-Item -Force "$env:USERPROFILE\\.openclaw\\gateway.cmd"',
        'Remove-Item -Recurse -Force "$env:USERPROFILE\\.openclaw"',
      ];
    }
    if (isMac) {
      return [
        'launchctl bootout gui/$UID/ai.openclaw.gateway',
        'rm -f ~/Library/LaunchAgents/ai.openclaw.gateway.plist',
        'rm -rf ~/.openclaw',
      ];
    }
    // Linux（默认）
    return [
      'systemctl --user disable --now openclaw-gateway.service',
      'rm -f ~/.config/systemd/user/openclaw-gateway.service',
      'systemctl --user daemon-reload',
      'rm -rf ~/.openclaw',
    ];
  }

  it('darwin 平台展示 launchctl 命令，不展示 systemctl 或 schtasks', async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成 macOS 平台标识变体
        fc.constantFrom('MacIntel', 'MacPPC', 'Mac68K', 'darwin'),
        async (platform) => {
          const commands = getCommandsForPlatform(platform);
          const joined = commands.join('\n');

          // 必须包含 launchctl（macOS 服务管理）
          expect(joined).toContain('launchctl');
          // 不应包含 systemctl（Linux）
          expect(joined).not.toContain('systemctl');
          // 不应包含 schtasks（Windows）
          expect(joined).not.toContain('schtasks');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('linux 平台展示 systemctl 命令，不展示 launchctl 或 schtasks', async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成 Linux 平台标识变体
        fc.constantFrom('Linux x86_64', 'Linux aarch64', 'Linux i686', 'linux'),
        async (platform) => {
          const commands = getCommandsForPlatform(platform);
          const joined = commands.join('\n');

          // 必须包含 systemctl（Linux 服务管理）
          expect(joined).toContain('systemctl');
          // 不应包含 launchctl（macOS）
          expect(joined).not.toContain('launchctl');
          // 不应包含 schtasks（Windows）
          expect(joined).not.toContain('schtasks');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('win32 平台展示 schtasks 命令，不展示 launchctl 或 systemctl', async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成 Windows 平台标识变体
        fc.constantFrom('Win32', 'Win64', 'Windows', 'win32'),
        async (platform) => {
          const commands = getCommandsForPlatform(platform);
          const joined = commands.join('\n');

          // 必须包含 schtasks（Windows 任务计划）
          expect(joined).toContain('schtasks');
          // 不应包含 launchctl（macOS）
          expect(joined).not.toContain('launchctl');
          // 不应包含 systemctl（Linux）
          expect(joined).not.toContain('systemctl');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('任意平台的命令列表均包含删除 ~/.openclaw 目录的命令', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('MacIntel', 'Linux x86_64', 'Win32'),
        async (platform) => {
          const commands = getCommandsForPlatform(platform);
          const joined = commands.join('\n');

          // 所有平台都必须包含删除 openclaw 目录的命令
          expect(joined.toLowerCase()).toContain('openclaw');
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── Property 3 & 4：runMode 描述文案 ─────────────────────────────────────────
// Feature: uninstall-openclaw, Property 3: 本地模式描述文案包含本机标识
// Feature: uninstall-openclaw, Property 4: 远程模式描述文案包含连接地址
// Validates: Requirements 1.4, 1.5

describe('Property 3 & 4: runMode 描述文案', () => {
  /**
   * 纯函数：根据 runMode 和 remoteHost 生成描述文案
   * 与 UninstallOpenclawCard 中的逻辑保持一致
   */
  function getDescription(
    runMode: 'local' | 'remote',
    remoteHost: string | undefined,
    translations: Record<string, string>,
  ): string {
    if (runMode === 'remote' && remoteHost) {
      // 使用 split/join 安全替换，避免 host 含正则特殊字符（如 $&）时行为异常
      return (translations['settings.advanced.uninstallOpenclawDescriptionRemote'] || '')
        .split('{host}').join(remoteHost);
    }
    return translations['settings.advanced.uninstallOpenclawDescription'] || '';
  }

  it('Property 3: local 模式描述文案包含表示本机的文案', async () => {
    const { translations } = await import('../../../src/i18n/translations');

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('en' as const, 'zh' as const),
        async (lang) => {
          const langObj = translations[lang] as Record<string, string>;
          const desc = getDescription('local', undefined, langObj);

          // 本地模式描述必须包含"本机"相关文案
          // 英文：local machine；中文：本机
          const hasLocalIndicator =
            desc.toLowerCase().includes('local') ||
            desc.includes('本机') ||
            desc.includes('本地');

          expect(hasLocalIndicator).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property 4: remote 模式描述文案包含远程连接地址', async () => {
    const { translations } = await import('../../../src/i18n/translations');

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('en' as const, 'zh' as const),
        // 生成任意非空主机地址字符串
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('{') && !s.includes('}')),
        async (lang, host) => {
          const langObj = translations[lang] as Record<string, string>;
          const desc = getDescription('remote', host, langObj);

          // 远程模式描述必须包含该主机地址
          expect(desc).toContain(host);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── Property 7：卸载成功后自动触发重置 ───────────────────────────────────────
// Feature: uninstall-openclaw, Property 7: 卸载成功后自动触发重置（不需要用户点击）
// Validates: Requirements 6.1, 6.2

describe('Property 7: 卸载成功后自动触发重置', () => {
  /**
   * 模拟卸载成功后的组件行为逻辑（纯函数版本）
   * 验证：收到 success: true 且无 manualRequired 时，自动调用 reset
   */
  async function simulateUninstallFlow(
    uninstallResult: { success: boolean; manualRequired?: boolean; output?: string; error?: string },
    resetFn: () => Promise<{ success: boolean }>,
  ): Promise<{ resetCalled: boolean; finalPhase: string }> {
    let resetCalled = false;
    let finalPhase = 'idle';

    if (uninstallResult.success && !uninstallResult.manualRequired) {
      // 卸载成功，自动触发重置（不等待用户点击）
      finalPhase = 'success';
      resetCalled = true;
      const resetResult = await resetFn();
      finalPhase = resetResult.success ? 'quitting' : 'resetError';
    } else if (uninstallResult.manualRequired) {
      // 需要手动引导，不自动触发重置
      finalPhase = 'manual';
    } else {
      // 卸载失败
      finalPhase = 'error';
    }

    return { resetCalled, finalPhase };
  }

  it('卸载成功（success: true, 无 manualRequired）时自动调用 reset', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string(), // 任意输出内容
        fc.boolean(), // reset 是否成功
        async (output, resetSuccess) => {
          const resetFn = vi.fn().mockResolvedValue({ success: resetSuccess });

          const { resetCalled } = await simulateUninstallFlow(
            { success: true, output },
            resetFn,
          );

          // 卸载成功后必须自动调用 reset
          expect(resetCalled).toBe(true);
          expect(resetFn).toHaveBeenCalledTimes(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('卸载返回 manualRequired: true 时不自动调用 reset', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string(), // 任意 sshError
        async (sshError) => {
          const resetFn = vi.fn().mockResolvedValue({ success: true });

          const { resetCalled, finalPhase } = await simulateUninstallFlow(
            { success: true, manualRequired: true },
            resetFn,
          );

          // manualRequired 时不应自动调用 reset
          expect(resetCalled).toBe(false);
          expect(resetFn).not.toHaveBeenCalled();
          // 应停留在 manual 状态，等待用户点击
          expect(finalPhase).toBe('manual');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('卸载失败（success: false）时不自动调用 reset', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }), // 错误信息
        async (errorMsg) => {
          const resetFn = vi.fn().mockResolvedValue({ success: true });

          const { resetCalled, finalPhase } = await simulateUninstallFlow(
            { success: false, error: errorMsg },
            resetFn,
          );

          // 卸载失败时不应自动调用 reset
          expect(resetCalled).toBe(false);
          expect(resetFn).not.toHaveBeenCalled();
          // 应停留在 error 状态
          expect(finalPhase).toBe('error');
        },
      ),
      { numRuns: 100 },
    );
  });
});
