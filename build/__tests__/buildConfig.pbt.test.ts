/**
 * buildConfig.pbt.test.ts
 *
 * 构建配置排除非必需文件 - 属性测试
 * 使用 fast-check 验证所有 electron-builder 配置文件的 files 数组
 * 不包含 TypeScript 源码模式，包含 dist-electron 输出目录，
 * 且包含排除非必需文件类型的否定模式
 */

import { describe, test, expect, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

// ── 类型定义 ──────────────────────────────────────────────────────

/** 配置文件来源描述 */
interface BuildConfigSource {
  /** 配置文件的显示名称 */
  name: string;
  /** 配置文件的相对路径（相对于项目根目录） */
  relativePath: string;
  /** 解析后的 files 数组 */
  files: string[];
}

// ── 辅助函数 ──────────────────────────────────────────────────────

// 从 JSON 文件中读取并解析 files 数组
// filePath: JSON 文件的绝对路径
// buildFieldKey: 如果需要从嵌套字段中提取（如 package.json 的 "build" 字段）
function readFilesArray(filePath: string, buildFieldKey?: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const json = JSON.parse(content);
  const config = buildFieldKey ? json[buildFieldKey] : json;
  if (!config || !Array.isArray(config.files)) {
    throw new Error(`配置文件 ${filePath} 中未找到有效的 files 数组`);
  }
  return config.files as string[];
}

// ── 测试数据准备 ──────────────────────────────────────────────────

/** 所有构建配置来源 */
let allConfigs: BuildConfigSource[];

/** 项目根目录 */
const projectRoot = path.resolve(__dirname, '..', '..');

beforeAll(() => {
  // 读取所有 4 个配置文件的 files 数组
  allConfigs = [
    {
      name: 'package.json (build)',
      relativePath: 'package.json',
      files: readFilesArray(path.join(projectRoot, 'package.json'), 'build'),
    },
    {
      name: 'electron-builder.sequoia.json',
      relativePath: 'build/electron-builder.sequoia.json',
      files: readFilesArray(path.join(projectRoot, 'build', 'electron-builder.sequoia.json')),
    },
    {
      name: 'electron-builder.tahoe.json',
      relativePath: 'build/electron-builder.tahoe.json',
      files: readFilesArray(path.join(projectRoot, 'build', 'electron-builder.tahoe.json')),
    },
    {
      name: 'electron-builder.win.json',
      relativePath: 'build/electron-builder.win.json',
      files: readFilesArray(path.join(projectRoot, 'build', 'electron-builder.win.json')),
    },
  ];
});

// ── 生成器（Arbitraries）──────────────────────────────────────────

// 配置文件索引生成器：使用 constantFrom 随机选择一个配置文件进行验证
const configIndexArb = (): fc.Arbitrary<number> => fc.constantFrom(0, 1, 2, 3);

// TypeScript 源码模式列表 - 这些模式不应出现在 files 数组中
const tsSourcePatterns = [
  'electron/**/*',
  'electron/**/*.ts',
  'electron/**/*.tsx',
  'electron/**',
];

// 需要排除的非必需文件类型否定模式（以 ! 开头）
const requiredExclusionPatterns = [
  '!**/*.map',
  '!**/*.ts',
  '!**/*.md',
];

// node_modules 中需要排除的目录模式
const nodeModulesExclusions = [
  '!**/node_modules/**/*.d.ts',
  '!**/node_modules/**/test/**',
  '!**/node_modules/**/tests/**',
  '!**/node_modules/**/__tests__/**',
  '!**/node_modules/**/docs/**',
  '!**/node_modules/**/example/**',
  '!**/node_modules/**/examples/**',
];

// dist-electron 输出目录的期望模式
const DIST_ELECTRON_PATTERN = 'dist-electron/**/*';

// ── Property 3: 构建配置排除非必需文件 ────────────────────────────

// Feature: app-production-optimization, Property 3: 构建配置排除非必需文件
describe('Property 3: 构建配置排除非必需文件', () => {
  // Validates: Requirements 2.1, 2.2, 2.6
  // 对于任意配置文件，files 数组不应包含 TypeScript 源码目录的 glob 模式
  // 源码已编译到 dist-electron，无需将原始 .ts 文件打入包中
  test('任意配置文件的 files 数组不应包含 TypeScript 源码目录模式', () => {
    fc.assert(
      fc.property(configIndexArb(), (idx) => {
        const config = allConfigs[idx];

        // files 数组中不应包含任何 TypeScript 源码目录模式
        for (const tsPattern of tsSourcePatterns) {
          expect(
            config.files,
            `配置 "${config.name}" 不应包含 TypeScript 源码模式 "${tsPattern}"`,
          ).not.toContain(tsPattern);
        }
      }),
      { numRuns: 100 },
    );
  });

  // Validates: Requirements 2.1
  // 对于任意配置文件，files 数组应包含 dist-electron 输出目录模式
  // 确保编译后的 Electron 主进程代码被打入包中
  test('任意配置文件的 files 数组应包含 dist-electron 输出目录', () => {
    fc.assert(
      fc.property(configIndexArb(), (idx) => {
        const config = allConfigs[idx];

        expect(
          config.files,
          `配置 "${config.name}" 应包含 "${DIST_ELECTRON_PATTERN}"`,
        ).toContain(DIST_ELECTRON_PATTERN);
      }),
      { numRuns: 100 },
    );
  });

  // Validates: Requirements 2.2, 2.6
  // 对于任意配置文件，files 数组应包含排除 .map、.ts、.md 等非必需文件类型的否定模式
  // 这些模式确保打包产物不包含源码映射、TypeScript 源码和文档文件
  test('任意配置文件的 files 数组应包含排除非必需文件类型的否定模式', () => {
    fc.assert(
      fc.property(configIndexArb(), (idx) => {
        const config = allConfigs[idx];

        for (const pattern of requiredExclusionPatterns) {
          expect(
            config.files,
            `配置 "${config.name}" 应包含排除模式 "${pattern}"`,
          ).toContain(pattern);
        }
      }),
      { numRuns: 100 },
    );
  });

  // Validates: Requirements 2.2, 2.6
  // 对于任意配置文件，files 数组应包含排除 node_modules 中测试文件和文档的否定模式
  // 确保开发时依赖的测试框架、类型定义等不被打入包中
  test('任意配置文件的 files 数组应包含排除 node_modules 非必需内容的否定模式', () => {
    fc.assert(
      fc.property(configIndexArb(), (idx) => {
        const config = allConfigs[idx];

        for (const pattern of nodeModulesExclusions) {
          expect(
            config.files,
            `配置 "${config.name}" 应包含 node_modules 排除模式 "${pattern}"`,
          ).toContain(pattern);
        }
      }),
      { numRuns: 100 },
    );
  });
});
