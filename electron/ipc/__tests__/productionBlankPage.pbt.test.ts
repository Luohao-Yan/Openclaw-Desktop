/**
 * Bug 条件探索性属性测试：生产环境空白页面（资源路径 + indexPath + 目录冲突）
 *
 * 本文件验证三个导致 Electron 打包后空白页面的 bug 条件：
 * 1. Vite 构建输出的 HTML 中资源路径为绝对路径（/assets/...），在 file:// 协议下无法解析
 * 2. electron/main.ts 中 indexPath 在打包后环境下路径解析不正确
 * 3. package.json 中 build.directories.output 与 Vite build.outDir 均为 "dist" 存在冲突
 *
 * 在未修复代码上运行时，测试预期失败 — 失败即确认 bug 存在。
 *
 * **Validates: Requirements 1.1, 1.2, 1.3**
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// 常量与工具函数
// ============================================================================

/** 项目根目录 */
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

/**
 * 从 HTML 内容中提取所有资源引用路径
 * 匹配 <script src="..."> 和 <link href="..."> 中的路径
 */
function extractAssetPaths(htmlContent: string): string[] {
  const paths: string[] = [];
  // 匹配 script src 属性
  const scriptMatches = htmlContent.matchAll(/<script[^>]+src="([^"]+)"/g);
  for (const match of scriptMatches) {
    paths.push(match[1]);
  }
  // 匹配 link href 属性（仅 stylesheet）
  const linkMatches = htmlContent.matchAll(/<link[^>]+href="([^"]+)"/g);
  for (const match of linkMatches) {
    paths.push(match[1]);
  }
  return paths;
}

/**
 * 判断资源路径是否为相对路径（以 ./ 开头）
 * 在 file:// 协议下，只有相对路径才能正确解析到应用包内的资源
 */
function isRelativePath(assetPath: string): boolean {
  return assetPath.startsWith('./');
}

/**
 * 模拟 Vite 构建输出的 HTML 内容
 * 根据 base 配置生成对应的资源引用路径
 * @param base - Vite 配置中的 base 值（默认 '/'）
 * @param assetFiles - 资源文件名列表
 */
function simulateViteBuildHtml(base: string, assetFiles: string[]): string {
  // Vite 的 base 处理逻辑：
  // - base = '/' → 资源路径为 /assets/xxx
  // - base = './' → 资源路径为 ./assets/xxx
  // - base = '' → 资源路径为 assets/xxx（无前缀）
  const prefix = base.endsWith('/') ? base : base + '/';
  const scripts = assetFiles
    .filter(f => f.endsWith('.js'))
    .map(f => `<script type="module" crossorigin src="${prefix}assets/${f}"></script>`)
    .join('\n');
  const styles = assetFiles
    .filter(f => f.endsWith('.css'))
    .map(f => `<link rel="stylesheet" crossorigin href="${prefix}assets/${f}">`)
    .join('\n');
  return `<!doctype html>\n<html>\n<head>\n${scripts}\n${styles}\n</head>\n<body><div id="root"></div></body>\n</html>`;
}

/**
 * 模拟 Electron 打包后的 indexPath 解析
 * 在打包后环境中，__dirname 为 app.asar/dist-electron/electron/
 * @param dirname - 模拟的 __dirname 值
 * @param relativeExpr - 相对路径表达式（如 '../../dist/index.html'）
 */
function resolveIndexPath(dirname: string, relativeExpr: string): string {
  return path.join(dirname, relativeExpr);
}

/**
 * Bug 条件判定函数
 * 当以下任一条件满足时返回 true：
 * 1. 资源路径为绝对路径（viteBase 为 '/' 或 ''）且应用已打包
 * 2. indexPath 在打包环境下使用 ../../dist/index.html 且已打包
 * 3. electron-builder 输出目录与 Vite 输出目录冲突
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
// 测试 1：Vite 构建输出资源路径验证
// ============================================================================

describe('Property 1: Bug Condition — 生产环境空白页面（资源路径 + indexPath + 目录冲突）', () => {
  /**
   * 测试 1：验证当前 vite.config.ts 未设置 base: './' 时，
   * dist/index.html 中资源路径为绝对路径，在 file:// 协议下无法正确解析
   *
   * 在未修复代码上：vite.config.ts 未设置 base，默认为 '/'，
   * dist/index.html 包含 src="/assets/index-xxx.js" 形式的绝对路径 → 测试失败
   * 修复后：设置 base: './'，资源路径变为 src="./assets/index-xxx.js" → 测试通过
   *
   * **Validates: Requirements 1.1**
   */
  test('dist/index.html 中所有资源引用应使用相对路径（以 ./ 开头）', () => {
    // 读取当前 Vite 构建输出的 index.html
    const indexHtmlPath = path.join(PROJECT_ROOT, 'dist', 'index.html');
    expect(fs.existsSync(indexHtmlPath)).toBe(true);

    const htmlContent = fs.readFileSync(indexHtmlPath, 'utf-8');

    // 提取所有资源引用路径
    const assetPaths = extractAssetPaths(htmlContent);
    expect(assetPaths.length).toBeGreaterThan(0);

    // 断言：所有资源路径应以 ./ 开头（相对路径）
    // 当前未修复状态：路径为 /assets/index-BK1sIlRy.js（绝对路径）→ 断言失败
    for (const assetPath of assetPaths) {
      expect(assetPath).toMatch(/^\.\//);
    }
  });

  /**
   * 使用 fast-check 生成随机资源文件名，验证在当前 Vite base 配置下
   * 模拟构建输出的资源路径是否为相对路径
   *
   * 从 Bug 条件：input.viteBase == '/' OR input.viteBase == '' 且 input.isPackaged == true
   *
   * 在未修复代码上：viteBase 默认为 '/'，生成的路径为 /assets/xxx → 测试失败
   *
   * **Validates: Requirements 1.1**
   */
  test('任意资源文件名下，当前 Vite base 配置生成的路径应为相对路径', () => {
    // 读取当前 vite.config.ts 的实际 base 配置
    // 当前未修复状态：vite.config.ts 中未设置 base，默认为 '/'
    const viteConfigPath = path.join(PROJECT_ROOT, 'vite.config.ts');
    const viteConfigContent = fs.readFileSync(viteConfigPath, 'utf-8');

    // 检测 base 配置：如果文件中包含 base: './' 则为相对路径配置
    const hasRelativeBase = /base\s*:\s*['"]\.\/['"]/.test(viteConfigContent);
    const currentBase = hasRelativeBase ? './' : '/';

    fc.assert(
      fc.property(
        // 生成随机资源文件名（模拟 Vite 构建输出的 hash 文件名）
        fc.tuple(
          fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{2,10}-[a-zA-Z0-9]{6,10}$/),
          fc.constantFrom('.js', '.css')
        ),
        ([fileName, ext]) => {
          const assetFile = fileName + ext;
          // 使用当前 base 配置模拟构建输出
          const html = simulateViteBuildHtml(currentBase, [assetFile]);
          const paths = extractAssetPaths(html);

          // 断言：所有资源路径应以 ./ 开头
          for (const p of paths) {
            expect(isRelativePath(p)).toBe(true);
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  // ============================================================================
  // 测试 2：indexPath 打包后路径解析验证
  // ============================================================================

  /**
   * 测试 2：验证当前 electron/main.ts 中
   * path.join(__dirname, '../../dist/index.html') 在打包后环境下路径解析是否正确
   *
   * 从 Bug 条件：input.indexPathExpr 使用相对于 __dirname 的 '../../dist/index.html'
   * 且 input.isPackaged == true
   *
   * 在未修复代码上：main.ts 使用 '../../dist/index.html'，
   * 在打包后 __dirname 为 .app/Contents/Resources/app/dist-electron/electron/，
   * 回溯两级到 app/，再进入 dist/ → 路径为 app/dist/index.html
   * 但更稳健的方式是使用 app.getAppPath() 或更短的相对路径
   *
   * 此测试验证 main.ts 中不应使用 '../../dist/index.html' 这种脆弱的路径表达式
   *
   * **Validates: Requirements 1.2**
   */
  test('electron/main.ts 中生产环境 indexPath 不应使用 ../../dist/index.html', () => {
    // 读取当前 electron/main.ts 的内容
    const mainTsPath = path.join(PROJECT_ROOT, 'electron', 'main.ts');
    expect(fs.existsSync(mainTsPath)).toBe(true);

    const mainTsContent = fs.readFileSync(mainTsPath, 'utf-8');

    // 检测是否使用了脆弱的 ../../dist/index.html 路径
    // 当前未修复状态：包含此路径 → 断言失败
    const hasFragileIndexPath = /path\.join\s*\(\s*__dirname\s*,\s*['"]\.\.\/\.\.\/dist\/index\.html['"]\s*\)/.test(mainTsContent);

    // 断言：不应使用 ../../dist/index.html 这种脆弱路径
    expect(hasFragileIndexPath).toBe(false);
  });

  /**
   * 使用 fast-check 生成随机的打包后 __dirname 路径，
   * 验证使用 '../../dist/index.html' 解析的路径是否指向正确位置
   *
   * 在打包后环境中，__dirname 可能为：
   * - /Applications/App.app/Contents/Resources/app/dist-electron/electron/
   * - C:\Users\xxx\AppData\Local\Programs\App\resources\app\dist-electron\electron\
   *
   * 期望：indexPath 应解析到 app 根目录下的 dist/index.html
   * 使用 ../../ 回溯两级是脆弱的，应使用更稳健的方式
   *
   * **Validates: Requirements 1.2**
   */
  test('任意打包后 __dirname 下，../../dist/index.html 路径解析应指向 app 根目录', () => {
    fc.assert(
      fc.property(
        // 生成随机的应用安装路径前缀
        fc.constantFrom(
          '/Applications/OpenClaw Desktop.app/Contents/Resources/app',
          '/Users/test/Applications/OpenClaw.app/Contents/Resources/app',
          'C:\\Users\\test\\AppData\\Local\\Programs\\OpenClaw\\resources\\app',
          '/opt/OpenClaw/resources/app'
        ),
        (appRoot: string) => {
          // 模拟打包后的 __dirname（dist-electron/electron/ 目录）
          const simulatedDirname = path.join(appRoot, 'dist-electron', 'electron');

          // 使用当前代码中的路径表达式解析 indexPath
          const currentIndexPath = resolveIndexPath(simulatedDirname, '../../dist/index.html');

          // 使用更稳健的路径表达式（推荐方案）
          const robustIndexPath = path.join(appRoot, 'dist', 'index.html');

          // 断言：当前路径表达式解析结果应与稳健方案一致
          // 注意：在 path.join 的语义下 ../../ 回溯两级确实能回到 app 根目录
          // 但关键问题是 main.ts 中不应硬编码这种脆弱的相对路径
          // 此测试验证 main.ts 源码中不使用此模式（见上方测试）
          // 这里额外验证：即使路径解析正确，也应使用更稳健的方式
          const normalizedCurrent = path.normalize(currentIndexPath);
          const normalizedRobust = path.normalize(robustIndexPath);
          expect(normalizedCurrent).toBe(normalizedRobust);
        },
      ),
      { numRuns: 10 },
    );
  });

  // ============================================================================
  // 测试 3：构建输出目录冲突验证
  // ============================================================================

  /**
   * 测试 3：验证 package.json 中 build.directories.output 与 Vite build.outDir
   * 均为 "dist" 存在冲突
   *
   * 从 Bug 条件：input.builderOutputDir == input.viteOutDir
   *
   * 在未修复代码上：package.json 中 build.directories.output 为 "dist"，
   * vite.config.ts 中 build.outDir 也为 "dist" → 目录冲突 → 测试失败
   * 修复后：build.directories.output 改为 "release-artifacts" → 测试通过
   *
   * **Validates: Requirements 1.3**
   */
  test('package.json build.directories.output 不应与 Vite build.outDir 冲突', () => {
    // 读取 package.json 中的 electron-builder 输出目录配置
    const pkgPath = path.join(PROJECT_ROOT, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const builderOutputDir = pkg.build?.directories?.output;

    // 读取 vite.config.ts 中的 build.outDir 配置
    const viteConfigPath = path.join(PROJECT_ROOT, 'vite.config.ts');
    const viteConfigContent = fs.readFileSync(viteConfigPath, 'utf-8');

    // 提取 Vite outDir 配置（默认为 'dist'）
    const outDirMatch = viteConfigContent.match(/outDir\s*:\s*['"]([^'"]+)['"]/);
    const viteOutDir = outDirMatch ? outDirMatch[1] : 'dist';

    // 断言：两个输出目录不应相同
    // 当前未修复状态：两者都是 "dist" → 断言失败
    expect(builderOutputDir).not.toBe(viteOutDir);
  });

  /**
   * 使用 fast-check 生成随机的目录名组合，
   * 验证 isBugCondition 在当前配置下返回 true（证明 bug 存在）
   *
   * 此测试读取实际配置值，结合随机生成的打包状态，
   * 验证当前配置确实触发了 bug 条件
   *
   * **Validates: Requirements 1.1, 1.2, 1.3**
   */
  test('当前配置在打包环境下应不触发 bug 条件', () => {
    // 读取当前实际配置
    const pkgPath = path.join(PROJECT_ROOT, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const builderOutputDir = pkg.build?.directories?.output || 'dist';

    const viteConfigPath = path.join(PROJECT_ROOT, 'vite.config.ts');
    const viteConfigContent = fs.readFileSync(viteConfigPath, 'utf-8');
    const hasRelativeBase = /base\s*:\s*['"]\.\/['"]/.test(viteConfigContent);
    const currentBase = hasRelativeBase ? './' : '/';

    const outDirMatch = viteConfigContent.match(/outDir\s*:\s*['"]([^'"]+)['"]/);
    const viteOutDir = outDirMatch ? outDirMatch[1] : 'dist';

    const mainTsPath = path.join(PROJECT_ROOT, 'electron', 'main.ts');
    const mainTsContent = fs.readFileSync(mainTsPath, 'utf-8');
    const hasFragileIndexPath = /path\.join\s*\(\s*__dirname\s*,\s*['"]\.\.\/\.\.\/dist\/index\.html['"]\s*\)/.test(mainTsContent);
    const indexPathExpr = hasFragileIndexPath ? '../../dist/index.html' : '../dist/index.html';

    fc.assert(
      fc.property(
        // 生成打包状态（true = 已打包，即生产环境）
        fc.constant(true),
        (isPackaged: boolean) => {
          const bugCondition = isBugCondition({
            viteBase: currentBase,
            indexPathExpr,
            isPackaged,
            builderOutputDir,
            viteOutDir,
          });

          // 断言：当前配置在打包环境下不应触发 bug 条件
          // 当前未修复状态：viteBase='/', indexPathExpr='../../dist/index.html',
          // builderOutputDir='dist', viteOutDir='dist' → isBugCondition 返回 true → 断言失败
          expect(bugCondition).toBe(false);
        },
      ),
      { numRuns: 10 },
    );
  });
});
