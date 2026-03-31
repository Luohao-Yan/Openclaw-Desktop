/**
 * 属性测试：OpenClaw 版本管理纯逻辑模块
 * Feature: openclaw-version-management
 *
 * 使用 fast-check 对 openclawVersionLogic.ts 中的纯函数进行属性测试，
 * 验证版本排序、缓存判断、新版本检测、安装命令构建、历史记录管理和 IPC 响应格式的正确性。
 */

import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import {
  sortVersionsDescending,
  isCacheValid,
  hasNewerVersion,
  compareSemver,
  buildInstallCommand,
  addHistoryRecord,
  buildSuccessResponse,
  buildErrorResponse,
  type VersionHistoryRecord,
} from '../openclawVersionLogic.js';

// ── 生成器（Arbitraries）──────────────────────────────────────────

/**
 * 生成有效的语义化版本号字符串（major.minor.patch）
 * 使用 fc.nat({max: 99}) 限制版本号范围，避免极端值
 */
const semverArb = (): fc.Arbitrary<string> =>
  fc.tuple(
    fc.nat({ max: 99 }),
    fc.nat({ max: 99 }),
    fc.nat({ max: 99 }),
  ).map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

/**
 * 生成非空的语义化版本号列表
 */
const semverListArb = (opts?: { minLength?: number; maxLength?: number }): fc.Arbitrary<string[]> =>
  fc.array(semverArb(), {
    minLength: opts?.minLength ?? 1,
    maxLength: opts?.maxLength ?? 30,
  });

/**
 * 生成平台类型（NodeJS.Platform 中的常见值）
 */
const platformArb = (): fc.Arbitrary<NodeJS.Platform> =>
  fc.constantFrom('darwin' as NodeJS.Platform, 'linux' as NodeJS.Platform, 'win32' as NodeJS.Platform);

/**
 * 生成 VersionHistoryRecord
 */
const historyRecordArb = (): fc.Arbitrary<VersionHistoryRecord> =>
  fc.record({
    timestamp: fc.integer({ min: 946684800000, max: 1924905600000 }).map((ms) => new Date(ms).toISOString()),
    fromVersion: semverArb(),
    toVersion: semverArb(),
    type: fc.constantFrom('upgrade' as const, 'switch' as const),
  });

/**
 * 生成历史记录列表
 */
const historyListArb = (opts?: { minLength?: number; maxLength?: number }): fc.Arbitrary<VersionHistoryRecord[]> =>
  fc.array(historyRecordArb(), {
    minLength: opts?.minLength ?? 0,
    maxLength: opts?.maxLength ?? 25,
  });

// ============================================================
// Property 1: 版本列表降序排列不变量
// Feature: openclaw-version-management, Property 1: 版本列表降序排列不变量
// ============================================================

describe('Feature: openclaw-version-management, Property 1: 版本列表降序排列不变量', () => {
  /**
   * Validates: Requirements 2.2
   *
   * 对任意有效语义化版本号列表，sortVersionsDescending 排序后的结果中，
   * 每个元素的版本号都应大于或等于其后续元素的版本号。
   */
  test('排序后每个元素版本号 >= 后续元素', () => {
    fc.assert(
      fc.property(
        fc.array(semverArb(), { minLength: 0, maxLength: 30 }),
        (versions) => {
          const sorted = sortVersionsDescending(versions);

          // 排序后长度不变
          expect(sorted).toHaveLength(versions.length);

          // 验证降序：每个元素 >= 后续元素
          for (let i = 0; i < sorted.length - 1; i++) {
            expect(compareSemver(sorted[i], sorted[i + 1])).toBeGreaterThanOrEqual(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 2: 缓存有效性判断
// Feature: openclaw-version-management, Property 2: 缓存有效性判断
// ============================================================

describe('Feature: openclaw-version-management, Property 2: 缓存有效性判断', () => {
  /**
   * Validates: Requirements 2.3
   *
   * 对任意缓存时间戳 cachedAt 和 TTL 值 ttlMs，
   * 当 now - cachedAt < ttlMs 时 isCacheValid 应返回 true，
   * 当 now - cachedAt >= ttlMs 时应返回 false。
   */
  test('时间差 < TTL 返回 true，>= TTL 返回 false', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 1_000_000_000 }),  // cachedAt
        fc.integer({ min: 1, max: 1_000_000 }),  // ttlMs（正数）
        fc.nat({ max: 1_000_000_000 }),  // offset（用于构造 now）
        (cachedAt, ttlMs, offset) => {
          // 情况 1：now - cachedAt < ttlMs → 有效
          const nowValid = cachedAt + Math.floor(ttlMs / 2); // 确保差值 < ttlMs
          if (ttlMs > 1) { // ttlMs/2 < ttlMs 仅在 ttlMs > 1 时成立
            expect(isCacheValid(cachedAt, ttlMs, nowValid)).toBe(true);
          }

          // 情况 2：now - cachedAt >= ttlMs → 无效
          const nowExpired = cachedAt + ttlMs + offset;
          expect(isCacheValid(cachedAt, ttlMs, nowExpired)).toBe(false);

          // 情况 3：now === cachedAt + ttlMs（刚好过期）→ 无效
          const nowExact = cachedAt + ttlMs;
          expect(isCacheValid(cachedAt, ttlMs, nowExact)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ============================================================
// Property 3: 新版本检测正确性
// Feature: openclaw-version-management, Property 3: 新版本检测正确性
// ============================================================

describe('Feature: openclaw-version-management, Property 3: 新版本检测正确性', () => {
  /**
   * Validates: Requirements 3.1
   *
   * 对任意当前版本号 current 和可用版本列表 available，
   * hasNewerVersion 返回 true 当且仅当 available 中存在至少一个
   * 语义化版本号严格大于 current。
   * 使用 compareSemver 独立验证结果。
   */
  test('返回 true 当且仅当存在严格大于 current 的版本', () => {
    fc.assert(
      fc.property(
        semverArb(),
        fc.array(semverArb(), { minLength: 0, maxLength: 20 }),
        (current, available) => {
          const result = hasNewerVersion(current, available);

          // 使用 compareSemver 独立计算期望值
          const expected = available.some((v) => compareSemver(v, current) > 0);

          expect(result).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 4: 安装命令构建正确性
// Feature: openclaw-version-management, Property 4: 安装命令构建正确性
// ============================================================

describe('Feature: openclaw-version-management, Property 4: 安装命令构建正确性', () => {
  /**
   * Validates: Requirements 3.3, 7.1, 7.2, 7.3
   *
   * 对任意平台类型和有效版本号字符串，buildInstallCommand 生成的命令字符串中
   * 必须包含 OPENCLAW_VERSION 环境变量设置，
   * 且 Windows 平台使用 powershell / install.ps1，
   * 非 Windows 平台使用 bash / install.sh。
   */
  test('命令包含 OPENCLAW_VERSION 环境变量，Windows 用 PowerShell，非 Windows 用 bash', () => {
    fc.assert(
      fc.property(
        platformArb(),
        semverArb(),
        (platform, version) => {
          const { command, shell } = buildInstallCommand(platform, version);

          // 命令中必须包含 OPENCLAW_VERSION 和目标版本号
          expect(command).toContain('OPENCLAW_VERSION');
          expect(command).toContain(version);

          if (platform === 'win32') {
            // Windows：使用 PowerShell 和 install.ps1
            expect(shell).toBe('powershell');
            expect(command).toContain('install.ps1');
          } else {
            // macOS / Linux：使用 bash 和 install.sh
            expect(shell).toBe('bash');
            expect(command).toContain('install.sh');
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 5: 历史记录管理不变量
// Feature: openclaw-version-management, Property 5: 历史记录管理不变量
// ============================================================

describe('Feature: openclaw-version-management, Property 5: 历史记录管理不变量', () => {
  /**
   * Validates: Requirements 5.1, 5.2
   *
   * 对任意现有历史记录列表和新记录，addHistoryRecord 返回的结果应满足：
   * (a) 包含新添加的记录
   * (b) 长度不超过 maxRecords
   * (c) 当原列表长度 < maxRecords 时新列表长度 = 原长度 + 1
   */
  test('包含新记录、长度 <= maxRecords、原长度 < max 时新长度 = 原 + 1', () => {
    fc.assert(
      fc.property(
        historyListArb({ minLength: 0, maxLength: 25 }),
        historyRecordArb(),
        fc.integer({ min: 1, max: 30 }),
        (history, newRecord, maxRecords) => {
          const result = addHistoryRecord(history, newRecord, maxRecords);

          // (a) 结果中包含新添加的记录
          const containsNewRecord = result.some(
            (r) =>
              r.timestamp === newRecord.timestamp &&
              r.fromVersion === newRecord.fromVersion &&
              r.toVersion === newRecord.toVersion &&
              r.type === newRecord.type,
          );
          expect(containsNewRecord).toBe(true);

          // (b) 长度不超过 maxRecords
          expect(result.length).toBeLessThanOrEqual(maxRecords);

          // (c) 当原列表长度 < maxRecords 时，新列表长度 = 原长度 + 1
          if (history.length < maxRecords) {
            expect(result.length).toBe(history.length + 1);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 6: IPC 响应格式不变量
// Feature: openclaw-version-management, Property 6: IPC 响应格式不变量
// ============================================================

describe('Feature: openclaw-version-management, Property 6: IPC 响应格式不变量', () => {
  /**
   * Validates: Requirements 8.6
   *
   * 对任意数据对象，buildSuccessResponse 返回的结果必须包含 success: true 字段；
   * 对任意错误字符串，buildErrorResponse 返回的结果必须包含 success: false 和 error 字段。
   */
  test('buildSuccessResponse 包含 success: true，buildErrorResponse 包含 success: false 和 error', () => {
    fc.assert(
      fc.property(
        // 生成任意 Record<string, unknown> 数据对象
        fc.dictionary(
          fc.string({ minLength: 1, maxLength: 10 }).filter((s) => s !== 'success'),
          fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)),
        ),
        fc.string({ minLength: 1, maxLength: 100 }),
        (data, errorMsg) => {
          // 验证 buildSuccessResponse
          const successResp = buildSuccessResponse(data);
          expect(successResp.success).toBe(true);
          // 原始数据的所有键值应保留在响应中
          for (const [key, value] of Object.entries(data)) {
            expect(successResp).toHaveProperty(key, value);
          }

          // 验证 buildErrorResponse
          const errorResp = buildErrorResponse(errorMsg);
          expect(errorResp.success).toBe(false);
          expect(errorResp).toHaveProperty('error', errorMsg);
        },
      ),
      { numRuns: 100 },
    );
  });
});
