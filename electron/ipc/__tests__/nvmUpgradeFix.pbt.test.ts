/**
 * 属性测试：NVM 升级修复 - Bug Condition 探索
 * Feature: nvm-upgrade-fix
 * 覆盖 Property 1: Bug Condition - runSpawnCommand 使用不完整 PATH 且缺少 NVM_DIR
 *
 * 本测试编码的是 **期望行为（正确行为）**：
 * - spawn env 的 PATH 应包含 getShellPath() 返回的完整路径
 * - nvm 场景下 spawn env 应包含 NVM_DIR
 * - 升级验证顺序应为：先清除缓存，再验证版本
 *
 * 在未修复代码上运行时，测试应 **失败**（证明 bug 存在）。
 * 修复后运行时，测试应 **通过**（证明 bug 已修复）。
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  buildSpawnEnv,
  buildUpgradeCommand,
  buildUpgradeVerificationOrder,
} from '../environmentFixerLogic';
import type {
  VersionManagerInfo,
  SpawnEnvParams,
  UpgradeCommandParams,
} from '../environmentFixerLogic';

// ── 生成器（Arbitraries）──────────────────────────────────────────────────

/**
 * 生成合法的目录路径片段（不含路径分隔符和特殊字符）
 */
const pathSegmentArb = (): fc.Arbitrary<string> =>
  fc.string({
    minLength: 1,
    maxLength: 12,
    unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_-'.split('')),
  });

/**
 * 生成类 Unix 风格的 homedir 路径
 */
const unixHomedirArb = (): fc.Arbitrary<string> =>
  pathSegmentArb().map((name) => `/home/${name}`);

/**
 * 生成模拟的 getShellPath() 返回值（包含版本管理器路径的完整 PATH）
 * 关键：shellPath 包含 nvm 版本目录等路径，而 processEnv.PATH 不包含
 */
const shellPathArb = (homedir: string): fc.Arbitrary<string> =>
  fc.tuple(
    fc.integer({ min: 18, max: 22 }),
    fc.integer({ min: 0, max: 20 }),
    fc.integer({ min: 0, max: 10 }),
  ).map(([major, minor, patch]) =>
    `/usr/local/bin:/usr/bin:/bin:${homedir}/.nvm/versions/node/v${major}.${minor}.${patch}/bin`,
  );

/**
 * 生成不完整的 process.env（模拟 Electron 主进程环境）
 * PATH 仅包含基础系统路径，不包含版本管理器路径
 */
const incompleteProcessEnvArb = (): fc.Arbitrary<Record<string, string | undefined>> =>
  fc.record({
    PATH: fc.constant('/usr/bin:/bin'),
    HOME: unixHomedirArb(),
    SHELL: fc.constantFrom('/bin/zsh', '/bin/bash'),
    // NVM_DIR 可能存在也可能不存在
    NVM_DIR: fc.option(
      unixHomedirArb().map((h) => `${h}/.nvm`),
      { nil: undefined },
    ),
  });

/**
 * 生成 nvm 版本管理器配置（useLoginShell = true）
 */
const nvmVersionManagerArb = (): fc.Arbitrary<VersionManagerInfo> =>
  fc.constant({
    name: 'nvm',
    command: 'nvm',
    args: ['install', '22'],
    useLoginShell: true,
  });

/**
 * 生成非 Windows 平台标识
 */
const unixPlatformArb = (): fc.Arbitrary<string> =>
  fc.constantFrom('darwin', 'linux');

// ── 非 nvm 版本管理器生成器 ──────────────────────────────────────────────

/**
 * 生成 volta 版本管理器配置（useLoginShell = false）
 */
const voltaVersionManagerArb = (): fc.Arbitrary<VersionManagerInfo> =>
  fc.constant({
    name: 'volta',
    command: 'volta',
    args: ['install', 'node@22'],
    useLoginShell: false,
  });

/**
 * 生成 fnm 版本管理器配置（useLoginShell = false）
 */
const fnmVersionManagerArb = (): fc.Arbitrary<VersionManagerInfo> =>
  fc.constant({
    name: 'fnm',
    command: 'fnm',
    args: ['install', '22'],
    useLoginShell: false,
  });

/**
 * 生成 n 版本管理器配置（useLoginShell = false）
 */
const nVersionManagerArb = (): fc.Arbitrary<VersionManagerInfo> =>
  fc.constant({
    name: 'n',
    command: 'n',
    args: ['22'],
    useLoginShell: false,
  });

/**
 * 生成随机的非 nvm 版本管理器配置（volta/fnm/n 之一）
 */
const nonNvmVersionManagerArb = (): fc.Arbitrary<VersionManagerInfo> =>
  fc.oneof(voltaVersionManagerArb(), fnmVersionManagerArb(), nVersionManagerArb());

/**
 * 生成所有版本管理器配置（包含 nvm）
 * 用于 Windows 平台测试
 */
const allVersionManagerArb = (): fc.Arbitrary<VersionManagerInfo> =>
  fc.oneof(nvmVersionManagerArb(), nonNvmVersionManagerArb());

/**
 * 生成 Windows 平台的 process.env
 */
const windowsProcessEnvArb = (): fc.Arbitrary<Record<string, string | undefined>> =>
  fc.record({
    PATH: fc.constant('C:\\Windows\\system32;C:\\Windows'),
    USERPROFILE: fc.constant('C:\\Users\\test'),
    SHELL: fc.constant(undefined),
  });

/**
 * 生成 Windows 风格的 homedir 路径
 */
const winHomedirArb = (): fc.Arbitrary<string> =>
  pathSegmentArb().map((name) => `C:\\Users\\${name}`);

// ============================================================
// Property 1: Bug Condition - runSpawnCommand 使用不完整 PATH 且缺少 NVM_DIR
// Feature: nvm-upgrade-fix
// ============================================================

describe('Feature: nvm-upgrade-fix, Property 1: Bug Condition 探索', () => {
  /**
   * Validates: Requirements 1.1, 1.2, 1.3, 1.4
   *
   * Case 1: buildSpawnEnv 应使用 shellPath 覆盖 PATH
   * 对于任意 processEnv 和 shellPath，构建的 spawn env 的 PATH
   * 应等于 shellPath（而非 processEnv.PATH）
   */
  test('Case 1: buildSpawnEnv 应将 shellPath 合并到 spawn env 的 PATH 中', () => {
    fc.assert(
      fc.property(
        incompleteProcessEnvArb(),
        unixHomedirArb().chain((h) => shellPathArb(h).map((sp) => ({ homedir: h, shellPath: sp }))),
        (processEnv, { shellPath }) => {
          const params: SpawnEnvParams = {
            processEnv,
            shellPath,
            extraEnv: {},
          };

          const env = buildSpawnEnv(params);

          // 期望行为：spawn env 的 PATH 应为 shellPath（包含版本管理器路径）
          // 未修复代码中 PATH 等于 processEnv.PATH（不完整），测试将失败
          expect(env.PATH).toBe(shellPath);
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * Validates: Requirements 1.1, 1.2
   *
   * Case 2: nvm 场景下 buildUpgradeCommand 返回的 env 应包含 NVM_DIR
   * 当 processEnv.NVM_DIR 未设置时，应自动注入 NVM_DIR
   */
  test('Case 2: nvm 场景下 spawn env 应包含 NVM_DIR', () => {
    fc.assert(
      fc.property(
        nvmVersionManagerArb(),
        unixPlatformArb(),
        unixHomedirArb(),
        // 生成不含 NVM_DIR 的 processEnv
        fc.record({
          PATH: fc.constant('/usr/bin:/bin'),
          HOME: unixHomedirArb(),
          SHELL: fc.constantFrom('/bin/zsh', '/bin/bash'),
        }),
        unixHomedirArb().chain((h) => shellPathArb(h)),
        (vm, platform, homedir, processEnv, shellPath) => {
          const params: UpgradeCommandParams = {
            versionManager: vm,
            platform,
            homedir,
            processEnv,
            shellPath,
          };

          const result = buildUpgradeCommand(params);

          // 期望行为：nvm 场景下 env 应包含 NVM_DIR
          // 未修复代码中 env 不包含 NVM_DIR（因为 processEnv 中没有），测试将失败
          expect(result.env.NVM_DIR).toBeDefined();
          expect(typeof result.env.NVM_DIR).toBe('string');
          expect(result.env.NVM_DIR!.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * Validates: Requirements 1.4
   *
   * Case 3: 升级验证顺序应为先清除缓存再验证版本
   * upgradeNodeVersion 中 clearPathCache() 应在 runCommand('node', ['--version']) 之前调用
   */
  test('Case 3: 升级验证顺序应为先清除缓存再验证版本', () => {
    const steps = buildUpgradeVerificationOrder();

    // 期望行为：第一步是清除缓存，第二步是验证版本
    // 未修复代码中顺序相反（先验证再清除），测试将失败
    expect(steps).toEqual(['clearPathCache', 'verifyVersion']);
  });
});

// ============================================================
// Property 2: Preservation - 非 nvm 版本管理器升级流程不变
// Feature: nvm-upgrade-fix
// ============================================================

describe('Feature: nvm-upgrade-fix, Property 2: Preservation - 非 nvm 版本管理器升级流程不变', () => {
  /**
   * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
   *
   * 对于非 nvm 版本管理器（volta/fnm/n），buildUpgradeCommand 应直接返回
   * 版本管理器自身的 command 和 args，不经过 login shell 包装。
   * 这些行为在修复前后应保持一致。
   */

  test('volta 升级命令直接执行，不经过 login shell', () => {
    fc.assert(
      fc.property(
        voltaVersionManagerArb(),
        unixPlatformArb(),
        unixHomedirArb(),
        incompleteProcessEnvArb(),
        unixHomedirArb().chain((h) => shellPathArb(h)),
        (vm, platform, homedir, processEnv, shellPath) => {
          const result = buildUpgradeCommand({
            versionManager: vm,
            platform,
            homedir,
            processEnv,
            shellPath,
          });

          // volta 应直接执行，command 为 'volta'，args 为 ['install', 'node@22']
          expect(result.command).toBe('volta');
          expect(result.args).toEqual(['install', 'node@22']);
        },
      ),
      { numRuns: 200 },
    );
  });

  test('fnm 升级命令直接执行，不经过 login shell', () => {
    fc.assert(
      fc.property(
        fnmVersionManagerArb(),
        unixPlatformArb(),
        unixHomedirArb(),
        incompleteProcessEnvArb(),
        unixHomedirArb().chain((h) => shellPathArb(h)),
        (vm, platform, homedir, processEnv, shellPath) => {
          const result = buildUpgradeCommand({
            versionManager: vm,
            platform,
            homedir,
            processEnv,
            shellPath,
          });

          // fnm 应直接执行，command 为 'fnm'，args 为 ['install', '22']
          expect(result.command).toBe('fnm');
          expect(result.args).toEqual(['install', '22']);
        },
      ),
      { numRuns: 200 },
    );
  });

  test('n 升级命令直接执行，不经过 login shell', () => {
    fc.assert(
      fc.property(
        nVersionManagerArb(),
        unixPlatformArb(),
        unixHomedirArb(),
        incompleteProcessEnvArb(),
        unixHomedirArb().chain((h) => shellPathArb(h)),
        (vm, platform, homedir, processEnv, shellPath) => {
          const result = buildUpgradeCommand({
            versionManager: vm,
            platform,
            homedir,
            processEnv,
            shellPath,
          });

          // n 应直接执行，command 为 'n'，args 为 ['22']
          expect(result.command).toBe('n');
          expect(result.args).toEqual(['22']);
        },
      ),
      { numRuns: 200 },
    );
  });

  test('随机非 nvm 版本管理器的 command 和 args 与原始配置一致', () => {
    fc.assert(
      fc.property(
        nonNvmVersionManagerArb(),
        unixPlatformArb(),
        unixHomedirArb(),
        incompleteProcessEnvArb(),
        unixHomedirArb().chain((h) => shellPathArb(h)),
        (vm, platform, homedir, processEnv, shellPath) => {
          const result = buildUpgradeCommand({
            versionManager: vm,
            platform,
            homedir,
            processEnv,
            shellPath,
          });

          // 非 nvm 版本管理器：command 和 args 应与输入的 vm 配置完全一致
          expect(result.command).toBe(vm.command);
          expect(result.args).toEqual(vm.args);
        },
      ),
      { numRuns: 200 },
    );
  });

  test('Windows 平台下所有版本管理器都不使用 login shell 包装', () => {
    fc.assert(
      fc.property(
        allVersionManagerArb(),
        winHomedirArb(),
        windowsProcessEnvArb(),
        fc.constant('C:\\shellpath'),
        (vm, homedir, processEnv, shellPath) => {
          const result = buildUpgradeCommand({
            versionManager: vm,
            platform: 'win32',
            homedir,
            processEnv,
            shellPath,
          });

          // Windows 平台：即使是 nvm（useLoginShell=true），也应直接执行
          // 不应出现 login shell 包装（-l -c）
          expect(result.command).toBe(vm.command);
          expect(result.args).toEqual(vm.args);
          // 确保不是 shell 包装命令
          expect(result.args).not.toContain('-l');
          expect(result.args).not.toContain('-c');
        },
      ),
      { numRuns: 200 },
    );
  });

  test('非 nvm 版本管理器的 buildSpawnEnv 输出不受 nvm 修复影响', () => {
    fc.assert(
      fc.property(
        nonNvmVersionManagerArb(),
        unixPlatformArb(),
        unixHomedirArb(),
        incompleteProcessEnvArb(),
        unixHomedirArb().chain((h) => shellPathArb(h)),
        (vm, platform, homedir, processEnv, shellPath) => {
          const result = buildUpgradeCommand({
            versionManager: vm,
            platform,
            homedir,
            processEnv,
            shellPath,
          });

          // 非 nvm 场景下，env 应保留 processEnv 中的非 PATH 键值
          for (const [key, value] of Object.entries(processEnv)) {
            if (value !== undefined && key !== 'PATH') {
              expect(result.env[key]).toBe(value);
            }
          }
          // PATH 应使用 shellPath（所有版本管理器都受益于完整 PATH）
          expect(result.env.PATH).toBe(shellPath);
        },
      ),
      { numRuns: 200 },
    );
  });
});
