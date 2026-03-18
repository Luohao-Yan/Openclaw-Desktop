/**
 * 属性测试：PATH Resolver 版本管理器路径完整性
 * Feature: setup-flow-optimization
 * 覆盖 Property 2: 版本管理器路径完整性
 *
 * 由于 getVersionManagerPaths() 依赖 Electron 的 electron-store（通过 settings.ts 的模块初始化），
 * 无法直接在 vitest 中运行。因此提取纯函数 getVersionManagerPathsPure(params) 封装核心路径生成逻辑，
 * 使用 fast-check 生成随机的 homedir 和环境变量值来验证路径完整性。
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import { getVersionManagerPathsPure } from '../pathResolverLogic';
import type { PathResolverParams } from '../pathResolverLogic';

// ── 生成器（Arbitraries）──────────────────────────────────────────────────

/**
 * 生成合法的目录路径片段（不含路径分隔符和特殊字符）
 * 用于模拟 homedir、环境变量等路径值
 */
const pathSegmentArb = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 12, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_-'.split('')) });

/**
 * 生成类 Unix 风格的 homedir 路径
 */
const unixHomedirArb = (): fc.Arbitrary<string> =>
  pathSegmentArb().map((name) => `/home/${name}`);

/**
 * 生成 Windows 风格的 homedir 路径
 */
const winHomedirArb = (): fc.Arbitrary<string> =>
  pathSegmentArb().map((name) => `C:\\Users\\${name}`);

/**
 * 生成版本号字符串列表（模拟 scanDir 返回的版本目录名）
 */
const versionListArb = (): fc.Arbitrary<string[]> =>
  fc.array(
    fc.tuple(
      fc.integer({ min: 14, max: 22 }),
      fc.integer({ min: 0, max: 20 }),
      fc.integer({ min: 0, max: 10 }),
    ).map(([major, minor, patch]) => `v${major}.${minor}.${patch}`),
    { minLength: 0, maxLength: 5 },
  );

/**
 * 生成非 Windows 平台的 PathResolverParams
 * 包含随机 homedir 和可选的环境变量
 */
const unixParamsArb = (): fc.Arbitrary<PathResolverParams> =>
  fc.record({
    homedir: unixHomedirArb(),
    platform: fc.constantFrom('darwin', 'linux'),
    nvmDir: fc.option(pathSegmentArb().map((s) => `/custom/nvm/${s}`), { nil: undefined }),
    fnmDir: fc.option(pathSegmentArb().map((s) => `/custom/fnm/${s}`), { nil: undefined }),
    nPrefix: fc.option(pathSegmentArb().map((s) => `/custom/n/${s}`), { nil: undefined }),
  });

/**
 * 生成 Windows 平台的 PathResolverParams
 * 包含 Windows 特定的环境变量
 */
const winParamsArb = (): fc.Arbitrary<PathResolverParams> =>
  fc.record({
    homedir: winHomedirArb(),
    platform: fc.constant('win32'),
    nvmDir: fc.option(pathSegmentArb().map((s) => `C:\\custom\\nvm\\${s}`), { nil: undefined }),
    fnmDir: fc.option(pathSegmentArb().map((s) => `C:\\custom\\fnm\\${s}`), { nil: undefined }),
    nPrefix: fc.option(pathSegmentArb().map((s) => `C:\\custom\\n\\${s}`), { nil: undefined }),
    appData: fc.option(pathSegmentArb().map((s) => `C:\\Users\\${s}\\AppData\\Roaming`), { nil: undefined }),
    localAppData: fc.option(pathSegmentArb().map((s) => `C:\\Users\\${s}\\AppData\\Local`), { nil: undefined }),
    programFiles: fc.option(fc.constant('C:\\Program Files'), { nil: undefined }),
    programFilesX86: fc.option(fc.constant('C:\\Program Files (x86)'), { nil: undefined }),
    userProfile: fc.option(winHomedirArb(), { nil: undefined }),
  });

// ── 辅助函数 ──────────────────────────────────────────────────────────────

/**
 * 检查路径列表中是否至少有一个路径包含指定关键字
 */
function hasPathContaining(paths: string[], keyword: string): boolean {
  return paths.some((p) => p.includes(keyword));
}

// ============================================================
// Property 2: 版本管理器路径完整性
// Feature: setup-flow-optimization
// ============================================================

describe('Feature: setup-flow-optimization, Property 2: 版本管理器路径完整性', () => {
  /**
   * Validates: Requirements 4.1, 4.2, 4.3, 4.4
   *
   * 对于每个支持的版本管理器，生成的路径列表中至少包含一个对应目录。
   * 使用 fast-check 生成随机的 homedir 和环境变量值进行验证。
   */

  test('返回的路径列表中包含 nvm 相关路径（当 scanDir 返回版本时包含 .nvm）', () => {
    fc.assert(
      fc.property(
        unixParamsArb(),
        versionListArb().filter((v) => v.length > 0),
        (params, versions) => {
          // 构造 scanDir：对 nvm 版本目录返回版本列表
          const paramsWithScan: PathResolverParams = {
            ...params,
            scanDir: () => versions,
          };
          const paths = getVersionManagerPathsPure(paramsWithScan);
          // nvm 路径应包含 .nvm（使用默认路径时）或自定义 nvmDir 中的版本路径
          const nvmBase = params.nvmDir || `${params.homedir}/.nvm`;
          const hasNvmPath = paths.some((p) => p.includes(nvmBase));
          expect(hasNvmPath).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  test('返回的路径列表中包含 volta 相关路径（包含 .volta）', () => {
    fc.assert(
      fc.property(unixParamsArb(), (params) => {
        const paths = getVersionManagerPathsPure(params);
        // volta 路径始终包含 .volta/bin，不依赖 scanDir
        expect(hasPathContaining(paths, '.volta')).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  test('返回的路径列表中包含 fnm 相关路径（当 scanDir 返回版本时包含 fnm）', () => {
    fc.assert(
      fc.property(
        unixParamsArb(),
        versionListArb().filter((v) => v.length > 0),
        (params, versions) => {
          const paramsWithScan: PathResolverParams = {
            ...params,
            scanDir: () => versions,
          };
          const paths = getVersionManagerPathsPure(paramsWithScan);
          // fnm 路径应包含 .fnm（使用默认路径时）或自定义 fnmDir
          const fnmBase = params.fnmDir || `${params.homedir}/.fnm`;
          const hasFnmPath = paths.some((p) => p.includes(fnmBase));
          expect(hasFnmPath).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  test('返回的路径列表中包含 asdf 相关路径（包含 .asdf）', () => {
    fc.assert(
      fc.property(unixParamsArb(), (params) => {
        const paths = getVersionManagerPathsPure(params);
        // asdf shims 路径始终存在，不依赖 scanDir
        expect(hasPathContaining(paths, '.asdf')).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  test('返回的路径列表中包含 nodenv 相关路径（包含 .nodenv）', () => {
    fc.assert(
      fc.property(unixParamsArb(), (params) => {
        const paths = getVersionManagerPathsPure(params);
        // nodenv shims 路径始终存在，不依赖 scanDir
        expect(hasPathContaining(paths, '.nodenv')).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  test('返回的路径列表中包含 n 相关路径（包含 /n/bin）', () => {
    fc.assert(
      fc.property(unixParamsArb(), (params) => {
        const paths = getVersionManagerPathsPure(params);
        // n 的默认路径 ~/n/bin 始终存在
        const nBinPath = `${params.homedir}/n/bin`;
        const hasNPath = paths.some((p) => p === nBinPath);
        expect(hasNPath).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  test('当提供 N_PREFIX 时，路径列表中包含 N_PREFIX/bin', () => {
    fc.assert(
      fc.property(
        unixParamsArb().filter((p) => p.nPrefix !== undefined),
        (params) => {
          const paths = getVersionManagerPathsPure(params);
          // N_PREFIX/bin 应存在于路径列表中
          const expectedPath = `${params.nPrefix}/bin`;
          const hasNPrefixPath = paths.some((p) => p === expectedPath);
          expect(hasNPrefixPath).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  test('当 platform 为 win32 时，包含 Windows 特定路径', () => {
    fc.assert(
      fc.property(winParamsArb(), (params) => {
        const paths = getVersionManagerPathsPure(params);

        // Windows 路径应包含 nvm（APPDATA 下）
        const effectiveAppData = params.appData || '';
        expect(paths.some((p) => p.includes(effectiveAppData) && p.includes('nvm'))).toBe(true);

        // Windows 路径应包含 volta（LOCALAPPDATA 下）
        const effectiveLocalAppData = params.localAppData || '';
        expect(paths.some((p) => p.includes(effectiveLocalAppData) && p.includes('volta'))).toBe(true);

        // Windows 路径应包含 nodejs（ProgramFiles 下）
        const effectiveProgramFiles = params.programFiles || 'C:\\Program Files';
        expect(paths.some((p) => p.includes(effectiveProgramFiles) && p.includes('nodejs'))).toBe(true);

        // Windows 路径应包含 chocolatey
        expect(hasPathContaining(paths, 'chocolatey')).toBe(true);

        // Windows 路径应包含 scoop
        expect(hasPathContaining(paths, 'scoop')).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  test('当 platform 不是 win32 时，不包含 Windows 特定路径', () => {
    fc.assert(
      fc.property(unixParamsArb(), (params) => {
        const paths = getVersionManagerPathsPure(params);
        // 非 Windows 平台不应包含 chocolatey 和 scoop 路径
        expect(hasPathContaining(paths, 'chocolatey')).toBe(false);
        expect(hasPathContaining(paths, 'scoop')).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  test('scanDir 返回空数组时，仍包含静态路径（volta、asdf shims、nodenv shims、n）', () => {
    fc.assert(
      fc.property(unixParamsArb(), (params) => {
        // scanDir 始终返回空数组，模拟无已安装版本的情况
        const paramsWithEmptyScan: PathResolverParams = {
          ...params,
          scanDir: () => [],
        };
        const paths = getVersionManagerPathsPure(paramsWithEmptyScan);

        // 静态路径应始终存在
        expect(hasPathContaining(paths, '.volta')).toBe(true);
        expect(hasPathContaining(paths, '.asdf')).toBe(true);
        expect(hasPathContaining(paths, '.nodenv')).toBe(true);
        expect(paths.some((p) => p.endsWith('/n/bin') || p.endsWith('\\n\\bin'))).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});

// ============================================================
// Property 18: Windows 版本管理器路径覆盖
// Feature: setup-flow-hardening
// ============================================================

describe('Feature: setup-flow-hardening, Property 18: Windows 版本管理器路径覆盖', () => {
  /**
   * Validates: Requirements 10.5
   *
   * 对于任意 Windows 环境参数（homedir、appData、localAppData、programFiles、userProfile），
   * getVersionManagerPathsPure({ platform: 'win32', ... }) 返回的路径列表应包含：
   * - nvm-windows（APPDATA/nvm）
   * - volta（LOCALAPPDATA/volta/bin）
   * - nodejs 官方安装（ProgramFiles/nodejs）
   * - chocolatey（ProgramData/chocolatey/bin）
   * - scoop（USERPROFILE/scoop/shims）
   */

  test('路径列表包含 nvm-windows 路径（APPDATA/nvm）', () => {
    fc.assert(
      fc.property(winParamsArb(), (params) => {
        const paths = getVersionManagerPathsPure(params);
        // nvm-windows 路径应位于 APPDATA 下的 nvm 目录
        const effectiveAppData = params.appData || '';
        const hasNvmWindows = paths.some(
          (p) => p.includes(effectiveAppData) && p.includes('nvm'),
        );
        expect(hasNvmWindows).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  test('路径列表包含 volta 路径（LOCALAPPDATA/volta/bin）', () => {
    fc.assert(
      fc.property(winParamsArb(), (params) => {
        const paths = getVersionManagerPathsPure(params);
        // volta 路径应位于 LOCALAPPDATA 下的 volta/bin 目录
        const effectiveLocalAppData = params.localAppData || '';
        const hasVolta = paths.some(
          (p) => p.includes(effectiveLocalAppData) && p.includes('volta'),
        );
        expect(hasVolta).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  test('路径列表包含 nodejs 官方安装路径（ProgramFiles/nodejs）', () => {
    fc.assert(
      fc.property(winParamsArb(), (params) => {
        const paths = getVersionManagerPathsPure(params);
        // nodejs 路径应位于 ProgramFiles 下的 nodejs 目录
        const effectiveProgramFiles = params.programFiles || 'C:\\Program Files';
        const hasNodejs = paths.some(
          (p) => p.includes(effectiveProgramFiles) && p.includes('nodejs'),
        );
        expect(hasNodejs).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  test('路径列表包含 chocolatey 路径（ProgramData/chocolatey/bin）', () => {
    fc.assert(
      fc.property(winParamsArb(), (params) => {
        const paths = getVersionManagerPathsPure(params);
        // chocolatey 路径应包含 'chocolatey' 关键字
        expect(hasPathContaining(paths, 'chocolatey')).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  test('路径列表包含 scoop 路径（USERPROFILE/scoop/shims）', () => {
    fc.assert(
      fc.property(winParamsArb(), (params) => {
        const paths = getVersionManagerPathsPure(params);
        // scoop 路径应位于 USERPROFILE 下的 scoop/shims 目录
        const effectiveUserProfile = params.userProfile || params.homedir;
        const hasScoop = paths.some(
          (p) => p.includes(effectiveUserProfile) && p.includes('scoop'),
        );
        expect(hasScoop).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
