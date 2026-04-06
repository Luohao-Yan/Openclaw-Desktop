/**
 * 属性测试：InstanceRegistry 实例注册表纯逻辑
 * Feature: remote-management-enhancement
 *
 * 覆盖设计文档中的以下正确性属性：
 * - Property 7: 实例注册表 CRUD 一致性
 * - Property 8: Token 加密往返一致性
 *
 * 纯逻辑函数已提取到 instanceRegistryLogic.ts，
 * 本测试仅验证 InstanceRegistryCRUD 和 encryptDecryptRoundTrip。
 * 使用 fast-check 库，每个属性测试至少运行 100 次迭代。
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  InstanceRegistryCRUD,
  generateInstanceId,
  encryptDecryptRoundTrip,
} from '../instanceRegistryLogic';
import type { RemoteInstanceConfig } from '../../../types/remote';

// ── 生成器（Arbitraries）──────────────────────────────────────────────────

/**
 * 生成有效的实例配置（不含 id 和 createdAt）
 */
const instanceConfigArb = (): fc.Arbitrary<Omit<RemoteInstanceConfig, 'id' | 'createdAt'>> =>
  fc.record({
    alias: fc.string({ minLength: 1, maxLength: 30 }),
    host: fc.stringMatching(/^[a-z0-9][a-z0-9.-]{0,28}[a-z0-9]$/),
    port: fc.integer({ min: 1, max: 65535 }),
    protocol: fc.constantFrom('http' as const, 'https' as const),
    token: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  });

/**
 * 生成有效的 ISO 日期字符串
 */
const isoDateArb = (): fc.Arbitrary<string> =>
  fc.integer({ min: 946684800000, max: 4102444800000 }).map((ts) => new Date(ts).toISOString());

/**
 * 生成完整的实例配置（含 id 和 createdAt）
 */
const fullInstanceConfigArb = (): fc.Arbitrary<RemoteInstanceConfig> =>
  fc.record({
    id: fc.uuid(),
    alias: fc.string({ minLength: 1, maxLength: 30 }),
    host: fc.stringMatching(/^[a-z0-9][a-z0-9.-]{0,28}[a-z0-9]$/),
    port: fc.integer({ min: 1, max: 65535 }),
    protocol: fc.constantFrom('http' as const, 'https' as const),
    token: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
    createdAt: isoDateArb(),
  });

/**
 * 生成非空 token 字符串（用于加密往返测试）
 */
const nonEmptyTokenArb = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 200 });

// ============================================================
// Property 7: 实例注册表 CRUD 一致性
// Feature: remote-management-enhancement
// ============================================================

describe('Feature: remote-management-enhancement, Property 7: 实例注册表 CRUD 一致性', () => {
  /**
   * **Validates: Requirements 9.1, 9.4, 9.6**
   */

  test('添加后 getAll() 包含该实例', () => {
    fc.assert(
      fc.property(
        fc.array(fullInstanceConfigArb(), { minLength: 0, maxLength: 5 }),
        instanceConfigArb(),
        (existingInstances, newConfig) => {
          const crud = new InstanceRegistryCRUD(existingInstances);
          const { instances, newId } = crud.add(newConfig);

          // getAll() 应包含新添加的实例
          const all = crud.getAll();
          const found = all.find((i) => i.id === newId);
          expect(found).toBeDefined();
          expect(found!.alias).toBe(newConfig.alias);
          expect(found!.host).toBe(newConfig.host);
          expect(found!.port).toBe(newConfig.port);
          expect(found!.protocol).toBe(newConfig.protocol);

          // 返回的 instances 与 getAll() 一致
          expect(instances).toEqual(all);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('删除后 getAll() 不包含该实例', () => {
    fc.assert(
      fc.property(
        fc.array(fullInstanceConfigArb(), { minLength: 1, maxLength: 5 }),
        (existingInstances) => {
          const crud = new InstanceRegistryCRUD(existingInstances);

          // 随机选择一个实例删除
          const targetIndex = Math.floor(Math.random() * existingInstances.length);
          const targetId = existingInstances[targetIndex].id;

          const updated = crud.remove(targetId);
          const all = crud.getAll();

          // getAll() 不应包含已删除的实例
          expect(all.find((i) => i.id === targetId)).toBeUndefined();
          expect(updated).toEqual(all);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('更新后 getAll() 反映最新值', () => {
    fc.assert(
      fc.property(
        fc.array(fullInstanceConfigArb(), { minLength: 1, maxLength: 5 }),
        fc.string({ minLength: 1, maxLength: 30 }),
        fc.integer({ min: 1, max: 65535 }),
        (existingInstances, newAlias, newPort) => {
          const crud = new InstanceRegistryCRUD(existingInstances);

          // 随机选择一个实例更新
          const targetIndex = Math.floor(Math.random() * existingInstances.length);
          const targetId = existingInstances[targetIndex].id;

          const patch = { alias: newAlias, port: newPort };
          crud.update(targetId, patch);

          const found = crud.findById(targetId);
          expect(found).toBeDefined();
          expect(found!.alias).toBe(newAlias);
          expect(found!.port).toBe(newPort);

          // id 和 createdAt 不应被更新覆盖
          expect(found!.id).toBe(targetId);
          expect(found!.createdAt).toBe(existingInstances[targetIndex].createdAt);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('总实例数 = 添加次数 - 删除次数', () => {
    fc.assert(
      fc.property(
        fc.array(instanceConfigArb(), { minLength: 1, maxLength: 8 }),
        fc.integer({ min: 0, max: 4 }),
        (configsToAdd, removeCount) => {
          const crud = new InstanceRegistryCRUD([]);

          // 添加所有实例
          const addedIds: string[] = [];
          for (const config of configsToAdd) {
            const { newId } = crud.add(config);
            addedIds.push(newId);
          }

          // 删除前 removeCount 个（不超过已添加数量）
          const actualRemoveCount = Math.min(removeCount, addedIds.length);
          for (let i = 0; i < actualRemoveCount; i++) {
            crud.remove(addedIds[i]);
          }

          // 验证总数 = 添加 - 删除
          expect(crud.getCount()).toBe(configsToAdd.length - actualRemoveCount);
          expect(crud.getAll().length).toBe(configsToAdd.length - actualRemoveCount);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('findById 对已添加实例返回正确结果，对已删除实例返回 undefined', () => {
    fc.assert(
      fc.property(
        instanceConfigArb(),
        (config) => {
          const crud = new InstanceRegistryCRUD([]);

          // 添加实例
          const { newId } = crud.add(config);
          const found = crud.findById(newId);
          expect(found).toBeDefined();
          expect(found!.id).toBe(newId);

          // 删除实例
          crud.remove(newId);
          expect(crud.findById(newId)).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  test('删除不存在的 ID 不影响现有实例', () => {
    fc.assert(
      fc.property(
        fc.array(fullInstanceConfigArb(), { minLength: 1, maxLength: 5 }),
        fc.uuid(),
        (existingInstances, nonExistentId) => {
          // 确保 nonExistentId 不在现有实例中
          const filteredInstances = existingInstances.filter((i) => i.id !== nonExistentId);
          if (filteredInstances.length === 0) return; // 跳过退化情况

          const crud = new InstanceRegistryCRUD(filteredInstances);
          const beforeCount = crud.getCount();

          crud.remove(nonExistentId);

          // 数量不变
          expect(crud.getCount()).toBe(beforeCount);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('update 不改变 id 和 createdAt', () => {
    fc.assert(
      fc.property(
        fullInstanceConfigArb(),
        fc.uuid(),
        isoDateArb(),
        (instance, fakeId, fakeCreatedAt) => {
          const crud = new InstanceRegistryCRUD([instance]);

          // 尝试通过 patch 覆盖 id 和 createdAt
          crud.update(instance.id, {
            id: fakeId,
            createdAt: fakeCreatedAt,
            alias: 'updated-alias',
          } as Partial<RemoteInstanceConfig>);

          const found = crud.findById(instance.id);
          expect(found).toBeDefined();
          // id 和 createdAt 应保持原值
          expect(found!.id).toBe(instance.id);
          expect(found!.createdAt).toBe(instance.createdAt);
          // alias 应被更新
          expect(found!.alias).toBe('updated-alias');
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 8: Token 加密往返一致性
// Feature: remote-management-enhancement
// ============================================================

describe('Feature: remote-management-enhancement, Property 8: Token 加密往返一致性', () => {
  /**
   * **Validates: Requirements 9.7**
   */

  test('对任意非空 token，加密后解密得到原始 token', () => {
    fc.assert(
      fc.property(nonEmptyTokenArb(), (token) => {
        // 使用 mock 加密/解密函数（模拟 safeStorage 行为）
        const encrypt = (s: string): Buffer => Buffer.from(s, 'utf-8');
        const decrypt = (b: Buffer): string => b.toString('utf-8');

        const result = encryptDecryptRoundTrip(encrypt, decrypt, token);
        expect(result).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  test('使用 Base64 编码的 mock 加密/解密也满足往返一致性', () => {
    fc.assert(
      fc.property(nonEmptyTokenArb(), (token) => {
        // 模拟更复杂的加密：先反转再 Base64 编码
        const encrypt = (s: string): Buffer => {
          const reversed = s.split('').reverse().join('');
          return Buffer.from(reversed, 'utf-8');
        };
        const decrypt = (b: Buffer): string => {
          const reversed = b.toString('utf-8');
          return reversed.split('').reverse().join('');
        };

        const result = encryptDecryptRoundTrip(encrypt, decrypt, token);
        expect(result).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  test('加密/解密不匹配时返回 false', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 2, maxLength: 200 }),
        (token) => {
          // 故意使用不匹配的加密/解密函数
          const encrypt = (s: string): Buffer => Buffer.from(s, 'utf-8');
          const decrypt = (_b: Buffer): string => 'wrong-value';

          const result = encryptDecryptRoundTrip(encrypt, decrypt, token);
          expect(result).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// 辅助纯函数测试：generateInstanceId
// ============================================================

describe('generateInstanceId 唯一 ID 生成', () => {
  test('生成的 ID 为非空字符串', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const id = generateInstanceId();
        expect(typeof id).toBe('string');
        expect(id.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  test('连续生成的 ID 互不相同', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 20 }),
        (count) => {
          const ids = new Set<string>();
          for (let i = 0; i < count; i++) {
            ids.add(generateInstanceId());
          }
          // 所有 ID 应互不相同
          expect(ids.size).toBe(count);
        },
      ),
      { numRuns: 100 },
    );
  });
});
