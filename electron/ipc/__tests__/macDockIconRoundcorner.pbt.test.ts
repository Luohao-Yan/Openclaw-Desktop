/**
 * Bug 条件探索性属性测试：macOS Dock 图标圆角修复
 *
 * 本文件验证当前 app-icon.svg 中背景矩形占画布比例是否超过 macOS 安全阈值（80%），
 * 以及 build/electron-builder.tahoe.json 引用的 icns 文件是否存在。
 *
 * 在未修复代码上运行时，测试预期失败 — 失败即确认 bug 存在。
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// 工具函数
// ============================================================================

/** 画布尺寸（app-icon.svg 的 viewBox 为 512x512） */
const CANVAS_SIZE = 512;

/** macOS 安全阈值：图标内容区域占画布比例不应超过 80% */
const MAX_CONTENT_RATIO = 0.80;

/** 项目根目录 */
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

/**
 * 解析 SVG 文件中 <rect> 元素的属性
 * 提取第一个 <rect> 的 x, y, width, height 值
 */
function parseRectFromSvg(svgContent: string): { x: number; y: number; width: number; height: number } | null {
  // 匹配 <rect ... /> 元素，提取 x, y, width, height 属性
  const rectMatch = svgContent.match(/<rect\s[^>]*>/);
  if (!rectMatch) return null;

  const rectStr = rectMatch[0];

  const xMatch = rectStr.match(/\bx="([^"]+)"/);
  const yMatch = rectStr.match(/\by="([^"]+)"/);
  const widthMatch = rectStr.match(/\bwidth="([^"]+)"/);
  const heightMatch = rectStr.match(/\bheight="([^"]+)"/);

  if (!xMatch || !yMatch || !widthMatch || !heightMatch) return null;

  return {
    x: parseFloat(xMatch[1]),
    y: parseFloat(yMatch[1]),
    width: parseFloat(widthMatch[1]),
    height: parseFloat(heightMatch[1]),
  };
}

/**
 * 计算内容区域占画布的比例
 * 使用 max(width, height) / canvasSize
 */
function computeContentRatio(width: number, height: number, canvasSize: number): number {
  return Math.max(width, height) / canvasSize;
}

/**
 * Bug 条件判定函数
 * 当 contentRatio > 0.80 或引用的 icns 文件不存在时返回 true
 */
function isBugCondition(contentRatio: number, icnsPath: string): boolean {
  return contentRatio > MAX_CONTENT_RATIO || !fs.existsSync(icnsPath);
}

// ============================================================================
// Property 1: Bug Condition — 图标内容区域比例超过 macOS 安全阈值
// ============================================================================

describe('Property 1: Bug Condition — 图标内容区域比例超过 macOS 安全阈值', () => {
  /**
   * 验证当前 app-icon.svg 的背景矩形占画布比例 ≤ 0.80
   *
   * 在未修复代码上：背景矩形 432x432，占画布 84.4%，超过 80% 阈值 → 测试失败
   * 修复后：背景矩形缩小至 ≤ 80% → 测试通过
   *
   * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**
   */
  test('app-icon.svg 背景矩形占画布比例应 ≤ 0.80', () => {
    // 读取当前 app-icon.svg 文件
    const svgPath = path.join(PROJECT_ROOT, 'resources', 'app-icon.svg');
    expect(fs.existsSync(svgPath)).toBe(true);

    const svgContent = fs.readFileSync(svgPath, 'utf-8');

    // 解析背景矩形属性
    const rect = parseRectFromSvg(svgContent);
    expect(rect).not.toBeNull();

    // 计算内容区域占画布比例
    const contentRatio = computeContentRatio(rect!.width, rect!.height, CANVAS_SIZE);

    // 断言：修正后的 SVG 中背景矩形占画布比例 ≤ 0.80
    // 当前值：432/512 ≈ 0.844，超过阈值 → 未修复时此断言失败
    expect(contentRatio).toBeLessThanOrEqual(MAX_CONTENT_RATIO);
  });

  /**
   * 验证 build/electron-builder.tahoe.json 引用的 icns 文件存在
   *
   * 在未修复代码上：icon_tahoe.icns 不存在 → 测试失败
   * 修复后：配置引用已有的 icns 文件 → 测试通过
   *
   * **Validates: Requirements 1.5**
   */
  test('electron-builder.tahoe.json 引用的 icns 文件应存在', () => {
    // 读取 tahoe 构建配置
    const configPath = path.join(PROJECT_ROOT, 'build', 'electron-builder.tahoe.json');
    expect(fs.existsSync(configPath)).toBe(true);

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    // 提取 mac.icon 引用路径
    const iconRef = config.mac?.icon || config.icon;
    expect(iconRef).toBeDefined();

    // 验证引用的 icns 文件存在
    const icnsFullPath = path.join(PROJECT_ROOT, iconRef);
    expect(fs.existsSync(icnsFullPath)).toBe(true);
  });

  /**
   * 使用 fast-check 生成随机缩放参数（scale ∈ [0.5, 0.8]），
   * 验证在该范围内内容区域不超过画布 80%。
   *
   * 此测试将当前 SVG 的背景矩形尺寸作为基准，模拟不同缩放参数下的内容比例。
   * 在未修复代码上：当前 scale 导致 contentRatio > 0.80 → 测试失败
   *
   * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
   */
  test('任意缩放参数 scale ∈ [0.5, 0.8] 下内容区域不超过画布 80%', () => {
    // 读取当前 app-icon.svg 的背景矩形
    const svgPath = path.join(PROJECT_ROOT, 'resources', 'app-icon.svg');
    const svgContent = fs.readFileSync(svgPath, 'utf-8');
    const rect = parseRectFromSvg(svgContent);
    expect(rect).not.toBeNull();

    // 当前背景矩形的实际尺寸
    const currentWidth = rect!.width;
    const currentHeight = rect!.height;
    const currentRatio = computeContentRatio(currentWidth, currentHeight, CANVAS_SIZE);

    fc.assert(
      fc.property(
        // 生成 scale ∈ [0.5, 0.8] 的随机缩放参数
        fc.double({ min: 0.5, max: 0.8, noNaN: true }),
        (scale: number) => {
          // 以当前背景矩形为基准，应用缩放参数计算新的内容尺寸
          // 缩放后的内容尺寸 = 画布尺寸 * scale
          const scaledSize = CANVAS_SIZE * scale;
          const scaledRatio = computeContentRatio(scaledSize, scaledSize, CANVAS_SIZE);

          // 断言：缩放后的内容比例应 ≤ 0.80
          expect(scaledRatio).toBeLessThanOrEqual(MAX_CONTENT_RATIO);

          // 同时断言：当前实际的 SVG 内容比例也应 ≤ 0.80
          // 这确保不仅理论缩放值合规，当前文件也合规
          expect(currentRatio).toBeLessThanOrEqual(MAX_CONTENT_RATIO);
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * 综合 Bug 条件验证：isBugCondition 应返回 false
   *
   * 在未修复代码上：contentRatio > 0.80 且 icon_tahoe.icns 不存在 → isBugCondition 返回 true → 测试失败
   *
   * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**
   */
  test('isBugCondition 应返回 false（当前资源不应触发 bug 条件）', () => {
    // 读取 SVG 并计算内容比例
    const svgPath = path.join(PROJECT_ROOT, 'resources', 'app-icon.svg');
    const svgContent = fs.readFileSync(svgPath, 'utf-8');
    const rect = parseRectFromSvg(svgContent);
    expect(rect).not.toBeNull();

    const contentRatio = computeContentRatio(rect!.width, rect!.height, CANVAS_SIZE);

    // 读取 tahoe 配置引用的 icns 路径
    const configPath = path.join(PROJECT_ROOT, 'build', 'electron-builder.tahoe.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const icnsRef = config.mac?.icon || config.icon;
    const icnsFullPath = path.join(PROJECT_ROOT, icnsRef);

    // 断言：bug 条件应为 false（即资源文件符合规范）
    expect(isBugCondition(contentRatio, icnsFullPath)).toBe(false);
  });
});

// ============================================================================
// Property 2: Preservation — 非 macOS 图标资源和构建配置不受影响
// ============================================================================

/**
 * 保持性资源定义
 * 这些资源不涉及 macOS 图标内边距 bug，修复前后行为应一致
 */
interface PreservationResource {
  /** 资源描述 */
  label: string;
  /** 资源类型：file（文件存在性检查）或 config-ref（配置引用检查） */
  type: 'file' | 'config-ref';
  /** 文件路径（相对于项目根目录） */
  filePath: string;
  /** 配置文件路径（仅 config-ref 类型） */
  configPath?: string;
  /** 配置中引用图标的 JSON 路径描述（仅 config-ref 类型） */
  configKey?: string;
  /** 期望的引用值（仅 config-ref 类型） */
  expectedRef?: string;
}

/** 保持性资源列表：所有不受 bug 修复影响的资源 */
const PRESERVATION_RESOURCES: PreservationResource[] = [
  // Windows 图标文件
  {
    label: 'Windows 图标文件 (icon_win.ico)',
    type: 'file',
    filePath: 'resources/win/icon_win.ico',
  },
  // Sequoia 构建配置引用的 icns 文件
  {
    label: 'Sequoia 配置 mac.icon 引用的 icns 文件',
    type: 'config-ref',
    filePath: 'resources/icns/icon_1024.icns',
    configPath: 'build/electron-builder.sequoia.json',
    configKey: 'mac.icon',
    expectedRef: 'resources/icns/icon_1024.icns',
  },
  // package.json 默认 macOS 构建配置引用
  {
    label: 'package.json build.mac.icon 引用的 icns 文件',
    type: 'config-ref',
    filePath: 'resources/icns/icon_1024.icns',
    configPath: 'package.json',
    configKey: 'build.mac.icon',
    expectedRef: 'resources/icns/icon_1024.icns',
  },
  // 各尺寸 PNG 文件
  {
    label: 'PNG 图标 (icon.png)',
    type: 'file',
    filePath: 'resources/icon.png',
  },
  {
    label: 'PNG 图标 (icon_128.png)',
    type: 'file',
    filePath: 'resources/icon_128.png',
  },
  {
    label: 'PNG 图标 (icon_256.png)',
    type: 'file',
    filePath: 'resources/icon_256.png',
  },
  {
    label: 'PNG 图标 (icon_512.png)',
    type: 'file',
    filePath: 'resources/icon_512.png',
  },
];

/**
 * 从配置文件中读取嵌套属性值
 * 支持 "mac.icon" 或 "build.mac.icon" 格式的路径
 */
function getNestedValue(obj: Record<string, unknown>, keyPath: string): unknown {
  const keys = keyPath.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/**
 * 记录 Windows 图标文件的内容哈希值（基线观察）
 * 使用简单的字节长度作为内容指纹，确保文件未被意外修改
 */
function getFileSize(filePath: string): number {
  return fs.statSync(filePath).size;
}

describe('Property 2: Preservation — 非 macOS 图标资源和构建配置不受影响', () => {
  /**
   * 使用 fast-check 从保持性资源列表中随机选取资源，
   * 验证文件存在性和配置引用正确性。
   *
   * 对于所有非 bug 条件的资源（¬C(X)），验证修复前后行为一致。
   *
   * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
   */
  test('随机选取保持性资源，验证文件存在性', () => {
    // 使用 fast-check 从资源列表中随机选取索引
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: PRESERVATION_RESOURCES.length - 1 }),
        (index: number) => {
          const resource = PRESERVATION_RESOURCES[index];
          const fullPath = path.join(PROJECT_ROOT, resource.filePath);

          // 验证文件存在
          expect(fs.existsSync(fullPath)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * 验证配置引用类型的资源：配置文件中的引用路径正确且引用的文件存在
   *
   * 使用 fast-check 从配置引用资源中随机选取，验证：
   * 1. 配置文件存在
   * 2. 配置中的引用路径与期望值一致
   * 3. 引用的文件存在
   *
   * **Validates: Requirements 3.2, 3.3**
   */
  test('随机选取配置引用资源，验证引用路径和文件存在性', () => {
    // 筛选出配置引用类型的资源
    const configResources = PRESERVATION_RESOURCES.filter(r => r.type === 'config-ref');

    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: configResources.length - 1 }),
        (index: number) => {
          const resource = configResources[index];

          // 验证配置文件存在
          const configFullPath = path.join(PROJECT_ROOT, resource.configPath!);
          expect(fs.existsSync(configFullPath)).toBe(true);

          // 读取配置文件
          const configContent = JSON.parse(fs.readFileSync(configFullPath, 'utf-8'));

          // 验证配置中的引用路径与期望值一致
          const actualRef = getNestedValue(configContent, resource.configKey!);
          expect(actualRef).toBe(resource.expectedRef);

          // 验证引用的文件存在
          const referencedFilePath = path.join(PROJECT_ROOT, resource.filePath);
          expect(fs.existsSync(referencedFilePath)).toBe(true);
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * Windows 图标文件路径和内容不变
   *
   * 验证 resources/win/icon_win.ico 文件存在且文件大小不为零，
   * 确保修复 macOS 图标不会意外影响 Windows 图标。
   *
   * **Validates: Requirements 3.1**
   */
  test('Windows 图标文件存在且内容非空', () => {
    const icoPath = path.join(PROJECT_ROOT, 'resources', 'win', 'icon_win.ico');

    // 验证文件存在
    expect(fs.existsSync(icoPath)).toBe(true);

    // 验证文件大小大于 0（内容非空）
    const fileSize = getFileSize(icoPath);
    expect(fileSize).toBeGreaterThan(0);
  });

  /**
   * Sequoia 配置引用的 icns 文件路径不变且文件存在
   *
   * 验证 build/electron-builder.sequoia.json 中 mac.icon 引用
   * resources/icns/icon_1024.icns 且该文件存在。
   *
   * **Validates: Requirements 3.2**
   */
  test('Sequoia 配置引用的 icns 文件路径正确且文件存在', () => {
    const configPath = path.join(PROJECT_ROOT, 'build', 'electron-builder.sequoia.json');
    expect(fs.existsSync(configPath)).toBe(true);

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    // 验证 mac.icon 引用路径
    expect(config.mac?.icon).toBe('resources/icns/icon_1024.icns');

    // 验证顶层 icon 引用路径
    expect(config.icon).toBe('resources/icns/icon_1024.icns');

    // 验证引用的 icns 文件存在
    const icnsPath = path.join(PROJECT_ROOT, config.mac.icon);
    expect(fs.existsSync(icnsPath)).toBe(true);
  });

  /**
   * package.json 默认 macOS 构建配置引用不变
   *
   * 验证 package.json 中 build.mac.icon 引用
   * resources/icns/icon_1024.icns 且该文件存在。
   *
   * **Validates: Requirements 3.3**
   */
  test('package.json 默认 macOS 构建配置引用正确且文件存在', () => {
    const pkgPath = path.join(PROJECT_ROOT, 'package.json');
    expect(fs.existsSync(pkgPath)).toBe(true);

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

    // 验证 build.mac.icon 引用路径
    expect(pkg.build?.mac?.icon).toBe('resources/icns/icon_1024.icns');

    // 验证引用的 icns 文件存在
    const icnsPath = path.join(PROJECT_ROOT, pkg.build.mac.icon);
    expect(fs.existsSync(icnsPath)).toBe(true);
  });

  /**
   * 各尺寸 PNG 文件存在性验证
   *
   * 使用 fast-check 从 PNG 文件列表中随机选取，验证文件存在且非空。
   * 确保修复 macOS 图标不会意外删除或损坏 PNG 文件。
   *
   * **Validates: Requirements 3.4, 3.5**
   */
  test('各尺寸 PNG 文件存在且内容非空', () => {
    const pngFiles = [
      'resources/icon.png',
      'resources/icon_128.png',
      'resources/icon_256.png',
      'resources/icon_512.png',
    ];

    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: pngFiles.length - 1 }),
        (index: number) => {
          const pngPath = path.join(PROJECT_ROOT, pngFiles[index]);

          // 验证文件存在
          expect(fs.existsSync(pngPath)).toBe(true);

          // 验证文件大小大于 0
          const fileSize = getFileSize(pngPath);
          expect(fileSize).toBeGreaterThan(0);
        },
      ),
      { numRuns: 50 },
    );
  });
});
