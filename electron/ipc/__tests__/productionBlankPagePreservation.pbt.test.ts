/**
 * 保持不变属性测试（Property 2: Preservation）
 *
 * 验证开发模式行为与非 Bug 输入行为在修复前后保持不变。
 * 遵循观察优先方法论：先在未修复代码上观察行为，再编写测试捕获基线。
 *
 * 观察（未修复代码）：
 * - isDevelopment === true 时 loadURL('http://localhost:51741') 被调用
 * - isDevelopment === true 时 preloadPath 解析为 path.join(__dirname, '../../electron/preload.cjs')
 * - isDevelopment === true 时 CSP 策略包含 connect-src 'self' ws://localhost:* http://localhost:*
 * - isDevelopment === false 时 CSP 策略为 default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:
 *
 * 预期结果：在未修复代码上运行时测试通过（确认基线行为已被捕获）
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// 常量
// ============================================================================

/** 项目根目录 */
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

/** 开发服务器默认端口（与 vite.config.ts 保持一致） */
const DEV_SERVER_PORT = 51741;

/** 开发服务器默认地址 */
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

/** 开发模式 CSP 策略（未修复代码中的观察值） */
const DEV_CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://localhost:* http://localhost:*; img-src 'self' data: https:;";

/** 生产模式 CSP 策略（未修复代码中的观察值） */
const PROD_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;";

// ============================================================================
// 辅助函数：模拟 electron/main.ts 中的核心逻辑
// ============================================================================

/**
 * 模拟 main.ts 中的环境判断逻辑
 * 当前代码：const isDevelopment = process.env.NODE_ENV === 'development'
 */
function resolveIsDevelopment(nodeEnv: string | undefined): boolean {
  return nodeEnv === 'development';
}

/**
 * 模拟 main.ts 中的 devServerUrl 解析逻辑
 * 当前代码：const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:51741'
 */
function resolveDevServerUrl(viteDevServerUrl: string | undefined): string {
  return viteDevServerUrl || DEV_SERVER_URL;
}

/**
 * 模拟 main.ts 中的 preloadPath 解析逻辑
 * 当前代码：
 *   isDevelopment
 *     ? path.join(__dirname, '../../electron/preload.cjs')
 *     : path.join(__dirname, './preload.cjs')
 */
function resolvePreloadPath(dirname: string, isDevelopment: boolean): string {
  return isDevelopment
    ? path.join(dirname, '../../electron/preload.cjs')
    : path.join(dirname, './preload.cjs');
}

/**
 * 模拟 main.ts 中的页面加载逻辑
 * 当前代码：
 *   if (isDevelopment) { mainWindow.loadURL(devServerUrl) }
 *   else { mainWindow.loadFile(indexPath) }
 *
 * 返回 { method, target }：
 *   - method: 'loadURL' 或 'loadFile'
 *   - target: 加载的 URL 或文件路径
 */
function resolveLoadAction(
  isDevelopment: boolean,
  devServerUrl: string,
  dirname: string,
): { method: 'loadURL' | 'loadFile'; target: string } {
  if (isDevelopment) {
    return { method: 'loadURL', target: devServerUrl };
  } else {
    // 当前未修复代码中的路径表达式
    const indexPath = path.join(dirname, '../../dist/index.html');
    return { method: 'loadFile', target: indexPath };
  }
}

/**
 * 模拟 main.ts 中的 CSP 策略选择逻辑
 * 当前代码根据 isDevelopment 选择不同的 CSP 策略
 */
function resolveCSP(isDevelopment: boolean): string {
  return isDevelopment ? DEV_CSP : PROD_CSP;
}


/**
 * Bug 条件判定函数（与 productionBlankPage.pbt.test.ts 中一致）
 * 用于筛选"非 bug 条件"的配置
 */
function isBugCondition(input: {
  viteBase: string;
  indexPathExpr: string;
  isPackaged: boolean;
  builderOutputDir: string;
  viteOutDir: string;
}): boolean {
  const hasAbsoluteAssetPaths = (input.viteBase === '/' || input.viteBase === '') && input.isPackaged;
  const hasIncorrectIndexPath = input.isPackaged && input.indexPathExpr.includes('../../dist/index.html');
  const hasDirectoryConflict = input.builderOutputDir === input.viteOutDir;
  return hasAbsoluteAssetPaths || hasIncorrectIndexPath || hasDirectoryConflict;
}

// ============================================================================
// 自定义生成器
// ============================================================================

/** 生成随机的 __dirname 路径（模拟不同安装位置） */
const dirnameArb = fc.constantFrom(
  'dist-electron/electron',
  '/Users/test/project/dist-electron/electron',
  '/Applications/OpenClaw.app/Contents/Resources/app/dist-electron/electron',
  'C:\\Users\\test\\AppData\\Local\\Programs\\OpenClaw\\resources\\app\\dist-electron\\electron',
  '/opt/OpenClaw/resources/app/dist-electron/electron',
);

/** 生成随机的 VITE_DEV_SERVER_URL 环境变量（undefined 或自定义 URL） */
const viteDevServerUrlArb = fc.oneof(
  fc.constant(undefined as string | undefined),
  fc.constant('http://localhost:51741'),
  fc.constant('http://localhost:3000'),
  fc.constant('http://127.0.0.1:51741'),
);

/** 生成随机的开发模式端口号 */
const devPortArb = fc.integer({ min: 1024, max: 65535 });

// ============================================================================
// 属性测试
// ============================================================================

describe('Property 2: Preservation — 开发模式行为与非 Bug 输入行为保持不变', () => {

  // --------------------------------------------------------------------------
  // 2.1 开发模式下 loadURL 行为保持不变
  // --------------------------------------------------------------------------

  /**
   * 对于所有 isDevelopment === true 的输入，loadURL 应始终被调用，
   * 且目标地址为 devServerUrl（默认 http://localhost:51741）
   *
   * 观察：未修复代码中 isDevelopment === true 时调用 loadURL(devServerUrl)
   * 此测试捕获该基线行为
   *
   * **Validates: Requirements 3.1**
   */
  test('开发模式下始终使用 loadURL 加载开发服务器地址', () => {
    fc.assert(
      fc.property(
        dirnameArb,
        viteDevServerUrlArb,
        (dirname, viteDevServerUrl) => {
          // 开发模式
          const isDevelopment = true;
          const devServerUrl = resolveDevServerUrl(viteDevServerUrl);
          const action = resolveLoadAction(isDevelopment, devServerUrl, dirname);

          // 断言：开发模式下必须使用 loadURL
          expect(action.method).toBe('loadURL');
          // 断言：加载目标为 devServerUrl
          expect(action.target).toBe(devServerUrl);
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * 对于所有 isDevelopment === true 的输入，当未设置 VITE_DEV_SERVER_URL 时，
   * 默认加载 http://localhost:51741
   *
   * 观察：未修复代码中 devServerUrl 默认为 'http://localhost:51741'
   *
   * **Validates: Requirements 3.1**
   */
  test('开发模式下默认 devServerUrl 为 http://localhost:51741', () => {
    fc.assert(
      fc.property(
        dirnameArb,
        (dirname) => {
          const isDevelopment = true;
          // 未设置 VITE_DEV_SERVER_URL
          const devServerUrl = resolveDevServerUrl(undefined);
          const action = resolveLoadAction(isDevelopment, devServerUrl, dirname);

          expect(action.method).toBe('loadURL');
          expect(action.target).toBe(DEV_SERVER_URL);
          // 验证默认端口
          expect(action.target).toContain(String(DEV_SERVER_PORT));
        },
      ),
      { numRuns: 20 },
    );
  });

  // --------------------------------------------------------------------------
  // 2.2 开发模式下 preloadPath 解析保持不变
  // --------------------------------------------------------------------------

  /**
   * 对于所有 isDevelopment === true 的输入，preloadPath 应解析为
   * path.join(__dirname, '../../electron/preload.cjs')
   *
   * 观察：未修复代码中开发模式 preloadPath = path.join(__dirname, '../../electron/preload.cjs')
   *
   * **Validates: Requirements 3.2**
   */
  test('开发模式下 preloadPath 解析为 ../../electron/preload.cjs', () => {
    fc.assert(
      fc.property(
        dirnameArb,
        (dirname) => {
          const isDevelopment = true;
          const preloadPath = resolvePreloadPath(dirname, isDevelopment);

          // 断言：开发模式下 preloadPath 应包含 electron/preload.cjs
          const expectedPath = path.join(dirname, '../../electron/preload.cjs');
          expect(path.normalize(preloadPath)).toBe(path.normalize(expectedPath));
        },
      ),
      { numRuns: 20 },
    );
  });

  /**
   * 对于所有 isDevelopment === false 的输入，preloadPath 应解析为
   * path.join(__dirname, './preload.cjs')
   *
   * 观察：未修复代码中生产模式 preloadPath = path.join(__dirname, './preload.cjs')
   *
   * **Validates: Requirements 3.2**
   */
  test('生产模式下 preloadPath 解析为 ./preload.cjs', () => {
    fc.assert(
      fc.property(
        dirnameArb,
        (dirname) => {
          const isDevelopment = false;
          const preloadPath = resolvePreloadPath(dirname, isDevelopment);

          // 断言：生产模式下 preloadPath 应为 __dirname 下的 preload.cjs
          const expectedPath = path.join(dirname, './preload.cjs');
          expect(path.normalize(preloadPath)).toBe(path.normalize(expectedPath));
        },
      ),
      { numRuns: 20 },
    );
  });

  // --------------------------------------------------------------------------
  // 2.3 CSP 策略保持不变
  // --------------------------------------------------------------------------

  /**
   * 对于所有 isDevelopment === true 的输入，CSP 策略应包含
   * connect-src 'self' ws://localhost:* http://localhost:*
   *
   * 观察：未修复代码中开发模式 CSP 包含 WebSocket 和 HTTP localhost 连接源
   *
   * **Validates: Requirements 3.4**
   */
  test('开发模式下 CSP 策略包含 localhost 连接源', () => {
    fc.assert(
      fc.property(
        fc.constant(true),
        (isDevelopment) => {
          const csp = resolveCSP(isDevelopment);

          // 断言：开发模式 CSP 包含 connect-src 指令
          expect(csp).toContain("connect-src 'self' ws://localhost:* http://localhost:*");
          // 断言：开发模式 CSP 包含 unsafe-inline script-src
          expect(csp).toContain("script-src 'self' 'unsafe-inline'");
          // 断言：开发模式 CSP 包含 style-src unsafe-inline
          expect(csp).toContain("style-src 'self' 'unsafe-inline'");
          // 断言：开发模式 CSP 包含 img-src
          expect(csp).toContain("img-src 'self' data: https:");
        },
      ),
      { numRuns: 10 },
    );
  });

  /**
   * 对于所有 isDevelopment === false 的输入，CSP 策略应为严格的生产模式策略
   *
   * 观察：未修复代码中生产模式 CSP 为
   * default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;
   *
   * **Validates: Requirements 3.4**
   */
  test('生产模式下 CSP 策略为严格策略（无 connect-src localhost）', () => {
    fc.assert(
      fc.property(
        fc.constant(false),
        (isDevelopment) => {
          const csp = resolveCSP(isDevelopment);

          // 断言：生产模式 CSP 不包含 connect-src localhost
          expect(csp).not.toContain('ws://localhost');
          expect(csp).not.toContain('http://localhost');
          // 断言：生产模式 CSP 不包含 unsafe-inline script-src
          expect(csp).toContain("script-src 'self'");
          expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
          // 断言：生产模式 CSP 包含 style-src unsafe-inline（保持不变）
          expect(csp).toContain("style-src 'self' 'unsafe-inline'");
          // 断言：生产模式 CSP 包含 img-src
          expect(csp).toContain("img-src 'self' data: https:");
        },
      ),
      { numRuns: 10 },
    );
  });

  // --------------------------------------------------------------------------
  // 2.4 验证 electron/main.ts 源码中的开发模式逻辑保持不变
  // --------------------------------------------------------------------------

  /**
   * 验证 electron/main.ts 中开发模式相关的代码模式保持不变
   * 通过读取源码确认关键代码行存在
   *
   * 观察：未修复代码中以下模式存在：
   * - isDevelopment = process.env.NODE_ENV === 'development'
   * - devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:51741'
   * - if (isDevelopment) { mainWindow.loadURL(devServerUrl) }
   * - 开发模式 preloadPath: path.join(__dirname, '../../electron/preload.cjs')
   *
   * **Validates: Requirements 3.1, 3.2**
   */
  test('electron/main.ts 中开发模式代码模式保持不变', () => {
    const mainTsPath = path.join(PROJECT_ROOT, 'electron', 'main.ts');
    expect(fs.existsSync(mainTsPath)).toBe(true);

    const content = fs.readFileSync(mainTsPath, 'utf-8');

    // 验证 isDevelopment 判断逻辑存在
    expect(content).toMatch(/isDevelopment\s*=\s*process\.env\.NODE_ENV\s*===\s*['"]development['"]/);

    // 验证 devServerUrl 默认值存在
    expect(content).toMatch(/devServerUrl.*['"]http:\/\/localhost:51741['"]/);

    // 验证开发模式下使用 loadURL
    expect(content).toMatch(/if\s*\(\s*isDevelopment\s*\)/);
    expect(content).toMatch(/loadURL\s*\(\s*devServerUrl\s*\)/);

    // 验证开发模式 preloadPath 使用 ../../electron/preload.cjs
    expect(content).toMatch(/path\.join\s*\(\s*__dirname\s*,\s*['"]\.\.\/\.\.\/electron\/preload\.cjs['"]\s*\)/);
  });

  /**
   * 验证 electron/main.ts 中 CSP 策略代码保持不变
   *
   * 观察：未修复代码中 CSP 策略通过 onHeadersReceived 设置，
   * 根据 isDevelopment 选择不同策略
   *
   * **Validates: Requirements 3.4**
   */
  test('electron/main.ts 中 CSP 策略代码保持不变', () => {
    const mainTsPath = path.join(PROJECT_ROOT, 'electron', 'main.ts');
    const content = fs.readFileSync(mainTsPath, 'utf-8');

    // 验证 CSP 设置代码存在
    expect(content).toContain('Content-Security-Policy');
    expect(content).toContain('onHeadersReceived');

    // 验证开发模式 CSP 包含 localhost 连接源
    expect(content).toContain("connect-src 'self' ws://localhost:* http://localhost:*");

    // 验证生产模式 CSP 存在
    expect(content).toContain("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:");
  });

  // --------------------------------------------------------------------------
  // 2.5 对于所有不满足 bug 条件的配置，行为保持一致
  // --------------------------------------------------------------------------

  /**
   * 对于所有不满足 bug 条件的配置（NOT isBugCondition(config)），
   * 修复后行为与修复前一致
   *
   * 生成多种非 bug 条件的配置组合，验证核心行为（loadURL/loadFile、preloadPath、CSP）
   * 在这些配置下保持不变
   *
   * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
   */
  test('非 bug 条件配置下，核心行为保持不变', () => {
    // 生成非 bug 条件的配置
    const nonBugConfigArb = fc.record({
      viteBase: fc.constantFrom('./', '/custom-base/'),
      indexPathExpr: fc.constantFrom('../dist/index.html', 'dist/index.html'),
      isPackaged: fc.boolean(),
      builderOutputDir: fc.constantFrom('release-artifacts', 'output', 'build-output'),
      viteOutDir: fc.constant('dist'),
      isDevelopment: fc.boolean(),
      dirname: dirnameArb,
    }).filter(config => !isBugCondition({
      viteBase: config.viteBase,
      indexPathExpr: config.indexPathExpr,
      isPackaged: config.isPackaged,
      builderOutputDir: config.builderOutputDir,
      viteOutDir: config.viteOutDir,
    }));

    fc.assert(
      fc.property(
        nonBugConfigArb,
        (config) => {
          // 验证 CSP 策略选择逻辑不变
          const csp = resolveCSP(config.isDevelopment);
          if (config.isDevelopment) {
            expect(csp).toBe(DEV_CSP);
          } else {
            expect(csp).toBe(PROD_CSP);
          }

          // 验证 preloadPath 解析逻辑不变
          const preloadPath = resolvePreloadPath(config.dirname, config.isDevelopment);
          if (config.isDevelopment) {
            const expected = path.join(config.dirname, '../../electron/preload.cjs');
            expect(path.normalize(preloadPath)).toBe(path.normalize(expected));
          } else {
            const expected = path.join(config.dirname, './preload.cjs');
            expect(path.normalize(preloadPath)).toBe(path.normalize(expected));
          }

          // 验证页面加载方式不变
          const devServerUrl = resolveDevServerUrl(undefined);
          const action = resolveLoadAction(config.isDevelopment, devServerUrl, config.dirname);
          if (config.isDevelopment) {
            expect(action.method).toBe('loadURL');
            expect(action.target).toBe(devServerUrl);
          } else {
            expect(action.method).toBe('loadFile');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // --------------------------------------------------------------------------
  // 2.6 Vite 构建产物目录保持不变
  // --------------------------------------------------------------------------

  /**
   * 验证 vite.config.ts 中 build.outDir 仍为 'dist'
   * 修复只应添加 base: './'，不应改变输出目录
   *
   * **Validates: Requirements 3.3**
   */
  test('vite.config.ts 中 build.outDir 保持为 dist', () => {
    const viteConfigPath = path.join(PROJECT_ROOT, 'vite.config.ts');
    expect(fs.existsSync(viteConfigPath)).toBe(true);

    const content = fs.readFileSync(viteConfigPath, 'utf-8');

    // 验证 outDir 配置为 'dist'
    expect(content).toMatch(/outDir\s*:\s*['"]dist['"]/);
    // 验证 assetsDir 配置为 'assets'
    expect(content).toMatch(/assetsDir\s*:\s*['"]assets['"]/);
  });
});
