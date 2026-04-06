/**
 * 属性测试：OpenClaw 版本同步（3.24 → 4.5）Manifest 验证
 * Feature: openclaw-version-sync
 *
 * 使用 fast-check 对 manifest JSON 文件和版本匹配逻辑进行属性测试，
 * 验证 section 继承完整性、版本回退行为、manifest 结构完整性和 section ID 唯一性。
 */

import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURRENT_MANIFEST_VERSION, SUPPORTED_MANIFEST_VERSIONS } from '../../config/manifest-version.js';

// ── 辅助：加载 manifest JSON 文件 ──────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const manifestDir = path.resolve(__dirname, '../../config/openclaw-manifests');

/** 加载并解析 manifest JSON */
const loadManifest = (version: string) =>
  JSON.parse(readFileSync(path.join(manifestDir, `${version}.json`), 'utf-8'));

const manifest324 = loadManifest('3.24');
const manifest45 = loadManifest('4.5');

// ── 辅助：内联 pickManifestVersion 逻辑 ────────────────────────────

/** 已知的 manifest 版本前缀列表（与 coreConfig.ts 中 manifestFileUrls 的 key 一致） */
const KNOWN_PREFIXES = ['3.8', '3.13', '3.24', '4.5'];

/**
 * 内联实现 pickManifestVersion 逻辑：
 * 遍历已知前缀，若版本字符串以某前缀开头则返回该前缀，否则回退到 CURRENT_MANIFEST_VERSION。
 */
const pickManifestVersion = (version: string): string => {
  for (const key of KNOWN_PREFIXES) {
    if (version.startsWith(key)) {
      return key;
    }
  }
  return CURRENT_MANIFEST_VERSION;
};

// ── 辅助：提取 manifest 数据 ───────────────────────────────────────

/** 3.24 manifest 中所有 section id */
const sectionIds324: string[] = manifest324.sections.map((s: { id: string }) => s.id);

/** 4.5 manifest 中所有 section id */
const sectionIds45: string[] = manifest45.sections.map((s: { id: string }) => s.id);

/** 4.5 manifest 中所有 section 对象 */
const sections45: Array<{
  id: string;
  title: string;
  description: string;
  fields: Array<{ id: string; label: string; type: string }>;
  commands: Array<{ id: string; label: string; command: string; subcommands: string[] }>;
}> = manifest45.sections;

// ============================================================
// Property 1: Section 继承完整性
// Feature: openclaw-version-sync, Property 1: Section 继承完整性
// ============================================================

describe('Feature: openclaw-version-sync, Property 1: Section 继承完整性', () => {
  /**
   * Validates: Requirements 1.3
   *
   * 对任意 3.24 manifest 中的 section id，该 id 也必须存在于 4.5 manifest 中。
   * 即 4.5 manifest 完整继承了 3.24 的所有 section。
   */
  test('3.24 中的每个 section id 在 4.5 中都存在', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...sectionIds324),
        (sectionId) => {
          expect(sectionIds45).toContain(sectionId);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 2: 版本回退到 CURRENT_MANIFEST_VERSION
// Feature: openclaw-version-sync, Property 2: 版本回退到 CURRENT_MANIFEST_VERSION
// ============================================================

describe('Feature: openclaw-version-sync, Property 2: 版本回退到 CURRENT_MANIFEST_VERSION', () => {
  /**
   * Validates: Requirements 2.3
   *
   * 对任意版本字符串，如果它不以任何已知 manifest 版本号为前缀，
   * 则 pickManifestVersion() 应返回 CURRENT_MANIFEST_VERSION（即 '4.5'）。
   */
  test('不匹配已知前缀的版本字符串回退到 CURRENT_MANIFEST_VERSION', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !KNOWN_PREFIXES.some((prefix) => s.startsWith(prefix))),
        (unknownVersion) => {
          const result = pickManifestVersion(unknownVersion);
          expect(result).toBe(CURRENT_MANIFEST_VERSION);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 3: Manifest 结构完整性
// Feature: openclaw-version-sync, Property 3: Manifest 结构完整性
// ============================================================

describe('Feature: openclaw-version-sync, Property 3: Manifest 结构完整性', () => {
  /**
   * Validates: Requirements 14.2, 14.3, 14.4
   *
   * 对任意 4.5 manifest 中的 section：
   * - section 必须包含 id、title、description、fields、commands 五个必需属性
   * - 每个 field 必须包含 id、label、type 三个必需属性
   * - 每个 command 必须包含 id、label、command、subcommands 四个必需属性
   */
  test('每个 section 及其 field/command 都包含必需属性', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...sections45),
        (section) => {
          // 验证 section 必需属性
          expect(section).toHaveProperty('id');
          expect(section).toHaveProperty('title');
          expect(section).toHaveProperty('description');
          expect(section).toHaveProperty('fields');
          expect(section).toHaveProperty('commands');

          // 验证每个 field 的必需属性
          for (const field of section.fields) {
            expect(field).toHaveProperty('id');
            expect(field).toHaveProperty('label');
            expect(field).toHaveProperty('type');
          }

          // 验证每个 command 的必需属性
          for (const command of section.commands) {
            expect(command).toHaveProperty('id');
            expect(command).toHaveProperty('label');
            expect(command).toHaveProperty('command');
            expect(command).toHaveProperty('subcommands');
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 4: Section ID 唯一性
// Feature: openclaw-version-sync, Property 4: Section ID 唯一性
// ============================================================

describe('Feature: openclaw-version-sync, Property 4: Section ID 唯一性', () => {
  /**
   * Validates: Requirements 14.5
   *
   * 4.5 manifest 中所有 section id 互不重复。
   * Set 大小应等于数组长度。
   */
  test('所有 section id 互不重复', () => {
    fc.assert(
      fc.property(
        fc.constant(sectionIds45),
        (ids) => {
          const uniqueIds = new Set(ids);
          expect(uniqueIds.size).toBe(ids.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});
