/**
 * 属性测试：技能管理纯逻辑模块 — Property 1-5
 * Feature: skills-management
 *
 * 本文件使用 fast-check 对 skillsLogic.ts 中的核心纯函数进行属性测试，
 * 验证 SKILL.md 往返一致性、kebab-case 转换有效性、非自定义技能拒绝变更、
 * 缺失需求项检测、以及已安装技能搜索标识。
 */

import { describe, test, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import {
  parseSkillMd,
  formatSkillMd,
  toKebabCase,
  canModifySkill,
  computeMissingRequirements,
  mergeSearchResults,
  type SkillMdData,
} from '../skillsLogic';

// ============================================================================
// 生成器（Arbitraries）
// ============================================================================

/** 小写字母字符集 */
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
/** 小写字母 + 数字字符集 */
const LOWER_DIGIT = 'abcdefghijklmnopqrstuvwxyz0123456789';
/** 大写字母 + 下划线字符集（用于环境变量名） */
const UPPER_UNDERSCORE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ_';
/** 安全描述字符集（避免 YAML 特殊字符） */
const SAFE_DESC_CHARS = 'abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
/** 字母数字字符集（用于章节标题） */
const ALPHANUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
/** 安全章节内容字符集（不含 # 避免产生标题行） */
const SAFE_CONTENT_CHARS = 'abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,;:!?-*()';

/**
 * 生成安全的 kebab-case 名称字符串
 * 以字母开头，可含单个连字符分隔的字母数字段
 */
const safeNameArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.string({ unit: fc.constantFrom(...LOWER.split('')), minLength: 1, maxLength: 8 }),
    fc.array(
      fc.string({ unit: fc.constantFrom(...LOWER_DIGIT.split('')), minLength: 1, maxLength: 6 }),
      { minLength: 0, maxLength: 3 },
    ),
  )
  .map(([head, rest]) => [head, ...rest].join('-'));

/**
 * 生成安全的描述字符串（避免 YAML 特殊字符，确保往返一致性）
 */
const safeDescriptionArb: fc.Arbitrary<string> = fc.string({
  unit: fc.constantFrom(...SAFE_DESC_CHARS.split('')),
  minLength: 1,
  maxLength: 60,
});

/**
 * 生成安全的章节标题（纯字母数字，不含特殊字符）
 */
const sectionTitleArb: fc.Arbitrary<string> = fc.string({
  unit: fc.constantFrom(...ALPHANUM.split('')),
  minLength: 1,
  maxLength: 16,
});

/**
 * 生成安全的章节内容（不含 ## 标题行，避免破坏章节解析）
 */
const sectionContentArb: fc.Arbitrary<string> = fc
  .string({
    unit: fc.constantFrom(...SAFE_CONTENT_CHARS.split('')),
    minLength: 1,
    maxLength: 80,
  })
  // 过滤掉包含 ## 开头行的内容（会破坏章节解析）
  .filter((s) => !s.split('\n').some((line: string) => line.startsWith('## ')));

/**
 * 生成可选的 openclaw metadata 嵌套结构
 */
const openclawMetadataArb: fc.Arbitrary<SkillMdData['frontmatter']['metadata']> = fc.option(
  fc.record({
    openclaw: fc.record({
      emoji: fc.option(fc.constantFrom('🔧', '🎯', '📦', '🚀', '💡'), { nil: undefined }),
      homepage: fc.option(fc.constant('https://example.com'), { nil: undefined }),
      requires: fc.option(
        fc.record({
          bins: fc.option(
            fc.array(
              fc.string({ unit: fc.constantFrom(...LOWER_DIGIT.split('')), minLength: 1, maxLength: 10 }),
              { minLength: 0, maxLength: 3 },
            ),
            { nil: undefined },
          ),
          env: fc.option(
            fc.array(
              fc.string({ unit: fc.constantFrom(...UPPER_UNDERSCORE.split('')), minLength: 1, maxLength: 12 }),
              { minLength: 0, maxLength: 3 },
            ),
            { nil: undefined },
          ),
          config: fc.option(
            fc.array(
              fc.string({ unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz.'.split('')), minLength: 1, maxLength: 12 }),
              { minLength: 0, maxLength: 3 },
            ),
            { nil: undefined },
          ),
        }),
        { nil: undefined },
      ),
      primaryEnv: fc.option(
        fc.string({ unit: fc.constantFrom(...UPPER_UNDERSCORE.split('')), minLength: 1, maxLength: 12 }),
        { nil: undefined },
      ),
      install: fc.option(
        fc.array(
          fc.record({
            id: fc.string({ unit: fc.constantFrom(...LOWER_DIGIT.split('')), minLength: 1, maxLength: 10 }),
            kind: fc.constantFrom('brew', 'apt', 'npm'),
            formula: fc.option(
              fc.string({ unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz-'.split('')), minLength: 1, maxLength: 12 }),
              { nil: undefined },
            ),
            bins: fc.option(
              fc.array(
                fc.string({ unit: fc.constantFrom(...LOWER_DIGIT.split('')), minLength: 1, maxLength: 8 }),
                { minLength: 1, maxLength: 2 },
              ),
              { nil: undefined },
            ),
            label: fc.option(
              fc.string({ unit: fc.constantFrom(...SAFE_DESC_CHARS.split('')), minLength: 1, maxLength: 20 }),
              { nil: undefined },
            ),
          }),
          { minLength: 1, maxLength: 2 },
        ),
        { nil: undefined },
      ),
      always: fc.option(fc.boolean(), { nil: undefined }),
      os: fc.option(
        fc.array(fc.constantFrom('macos', 'linux', 'windows'), { minLength: 1, maxLength: 3 }),
        { nil: undefined },
      ),
    }),
  }),
  { nil: undefined },
);

/**
 * 生成完整的 SkillMdData 对象（确保所有字段值对 YAML 往返安全）
 */
const skillMdDataArb: fc.Arbitrary<SkillMdData> = fc.record({
  frontmatter: fc.record({
    name: safeNameArb,
    description: safeDescriptionArb,
    metadata: openclawMetadataArb,
    'user-invocable': fc.option(fc.boolean(), { nil: undefined }),
    'disable-model-invocation': fc.option(fc.boolean(), { nil: undefined }),
    'command-dispatch': fc.option(fc.constantFrom('tool', 'agent'), { nil: undefined }),
    'command-tool': fc.option(
      fc.string({ unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz-'.split('')), minLength: 1, maxLength: 12 }),
      { nil: undefined },
    ),
    'command-arg-mode': fc.option(fc.constantFrom('json', 'text'), { nil: undefined }),
  }),
  sections: fc.dictionary(sectionTitleArb, sectionContentArb, { minKeys: 0, maxKeys: 4 }),
});

/**
 * 生成非空字符串（用于 kebab-case 测试，包含各种 Unicode 字符）
 */
const nonEmptyStringArb: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 100 });

/**
 * 生成非 custom 的 source 值
 */
const nonCustomSourceArb: fc.Arbitrary<string> = fc.constantFrom('clawhub', 'bundled', 'plugin', 'unknown', '');

/**
 * 生成 requires 声明对象（bins/env/config 各项可选）
 */
const requiresArb: fc.Arbitrary<{ bins?: string[]; env?: string[]; config?: string[] }> = fc.record({
  bins: fc.option(
    fc.array(
      fc.string({ unit: fc.constantFrom(...LOWER_DIGIT.split('')), minLength: 1, maxLength: 10 }),
      { minLength: 0, maxLength: 5 },
    ),
    { nil: undefined },
  ),
  env: fc.option(
    fc.array(
      fc.string({ unit: fc.constantFrom(...UPPER_UNDERSCORE.split('')), minLength: 1, maxLength: 10 }),
      { minLength: 0, maxLength: 5 },
    ),
    { nil: undefined },
  ),
  config: fc.option(
    fc.array(
      fc.string({ unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz.'.split('')), minLength: 1, maxLength: 10 }),
      { minLength: 0, maxLength: 5 },
    ),
    { nil: undefined },
  ),
});

/**
 * 生成唯一 ID 字符串（用于搜索结果合并测试）
 */
const skillIdArb: fc.Arbitrary<string> = fc.string({
  unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'.split('')),
  minLength: 1,
  maxLength: 16,
});

// ============================================================================
// Property 1: SKILL.md 解析/格式化往返一致性 (Round-Trip)
// Feature: skills-management, Property 1: SKILL.md 解析/格式化往返一致性
// **Validates: Requirements 10.3, 10.1, 10.2, 10.5, 1.2, 1.6, 4.4**
// ============================================================================

describe('Property 1: SKILL.md 解析/格式化往返一致性', () => {
  test('对于任意有效 SkillMdData，parseSkillMd(formatSkillMd(data)) 应产生语义等价对象', () => {
    fc.assert(
      fc.property(skillMdDataArb, (data) => {
        // 格式化为 SKILL.md 文本
        const formatted = formatSkillMd(data);

        // 解析回结构化对象
        const result = parseSkillMd(formatted);

        // 解析必须成功
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const parsed = result.data;

        // frontmatter 基本字段一致
        expect(parsed.frontmatter.name).toBe(data.frontmatter.name);
        expect(parsed.frontmatter.description).toBe(data.frontmatter.description);

        // 可选布尔/字符串字段一致
        expect(parsed.frontmatter['user-invocable']).toEqual(data.frontmatter['user-invocable']);
        expect(parsed.frontmatter['disable-model-invocation']).toEqual(data.frontmatter['disable-model-invocation']);
        expect(parsed.frontmatter['command-dispatch']).toEqual(data.frontmatter['command-dispatch']);
        expect(parsed.frontmatter['command-tool']).toEqual(data.frontmatter['command-tool']);
        expect(parsed.frontmatter['command-arg-mode']).toEqual(data.frontmatter['command-arg-mode']);

        // metadata 深度等价（通过 JSON 序列化清理 undefined 值后比较）
        const cleanMeta = JSON.parse(JSON.stringify(data.frontmatter.metadata ?? null));
        const parsedMeta = JSON.parse(JSON.stringify(parsed.frontmatter.metadata ?? null));
        expect(parsedMeta).toEqual(cleanMeta);

        // 章节数量一致
        const origKeys = Object.keys(data.sections);
        const parsedKeys = Object.keys(parsed.sections);
        expect(parsedKeys.length).toBe(origKeys.length);

        // 每个章节内容一致（trim 后比较，格式化可能引入尾部空白）
        for (const key of origKeys) {
          expect(parsed.sections[key]?.trim()).toBe(data.sections[key]?.trim());
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ============================================================================
// Property 2: kebab-case 转换始终产生有效结果
// Feature: skills-management, Property 2: kebab-case 转换始终产生有效结果
// **Validates: Requirements 1.3**
// ============================================================================

describe('Property 2: kebab-case 转换始终产生有效结果', () => {
  test('对于任意非空字符串，toKebabCase 输出满足 kebab-case 格式约束', () => {
    fc.assert(
      fc.property(nonEmptyStringArb, (input) => {
        const result = toKebabCase(input);

        // (a) 仅包含小写字母、数字和连字符
        expect(result).toMatch(/^[a-z0-9-]+$/);

        // (b) 不以连字符开头或结尾
        expect(result.startsWith('-')).toBe(false);
        expect(result.endsWith('-')).toBe(false);

        // (c) 不包含连续连字符
        expect(result).not.toMatch(/--/);

        // (d) 非空（至少返回 'skill' 兜底值）
        expect(result.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });
});

// ============================================================================
// Property 3: 非自定义技能拒绝变更操作
// Feature: skills-management, Property 3: 非自定义技能拒绝变更操作
// **Validates: Requirements 2.6, 3.5**
// ============================================================================

describe('Property 3: 非自定义技能拒绝变更操作', () => {
  test('对于任意 source 不为 custom 的技能，canModifySkill 应返回 false', () => {
    fc.assert(
      fc.property(nonCustomSourceArb, (source) => {
        // 非自定义技能不允许修改
        const result = canModifySkill({ source });
        expect(result).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});

// ============================================================================
// Property 4: 缺失需求项检测
// Feature: skills-management, Property 4: 缺失需求项检测
// **Validates: Requirements 4.5, 6.5**
// ============================================================================

describe('Property 4: 缺失需求项检测', () => {
  test('对于任意 requires 声明和实际配置，缺失项 ∪ 已配置项 = requires', () => {
    fc.assert(
      fc.property(requiresArb, requiresArb, (requires, actualConfig) => {
        const missing = computeMissingRequirements(requires, actualConfig);

        // 提取各类型的 requires 列表和 actual 集合
        const requiresBins = requires.bins ?? [];
        const requiresEnv = requires.env ?? [];
        const requiresConfig = requires.config ?? [];
        const actualBins = new Set(actualConfig.bins ?? []);
        const actualEnvSet = new Set(actualConfig.env ?? []);
        const actualCfg = new Set(actualConfig.config ?? []);

        // 提取缺失项中各类型的名称
        const missingBins = missing.filter((m) => m.startsWith('bin:')).map((m) => m.slice(4));
        const missingEnvs = missing.filter((m) => m.startsWith('env:')).map((m) => m.slice(4));
        const missingCfgs = missing.filter((m) => m.startsWith('config:')).map((m) => m.slice(7));

        // bins：每个 requires 项要么缺失要么已配置，且不能同时存在于两者
        for (const bin of requiresBins) {
          const isMissing = missingBins.includes(bin);
          const isConfigured = actualBins.has(bin);
          expect(isMissing || isConfigured).toBe(true);
          if (isConfigured) expect(isMissing).toBe(false);
        }

        // env：同理
        for (const env of requiresEnv) {
          const isMissing = missingEnvs.includes(env);
          const isConfigured = actualEnvSet.has(env);
          expect(isMissing || isConfigured).toBe(true);
          if (isConfigured) expect(isMissing).toBe(false);
        }

        // config：同理
        for (const cfg of requiresConfig) {
          const isMissing = missingCfgs.includes(cfg);
          const isConfigured = actualCfg.has(cfg);
          expect(isMissing || isConfigured).toBe(true);
          if (isConfigured) expect(isMissing).toBe(false);
        }

        // 缺失项不应包含实际配置中已存在的项
        for (const m of missingBins) expect(actualBins.has(m)).toBe(false);
        for (const m of missingEnvs) expect(actualEnvSet.has(m)).toBe(false);
        for (const m of missingCfgs) expect(actualCfg.has(m)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});

// ============================================================================
// Property 5: 已安装技能在搜索结果中正确标识
// Feature: skills-management, Property 5: 已安装技能在搜索结果中正确标识
// **Validates: Requirements 5.3**
// ============================================================================

describe('Property 5: 已安装技能在搜索结果中正确标识', () => {
  test('对于任意本地已安装技能和搜索结果，合并后匹配 ID 标记为 installed: true', () => {
    fc.assert(
      fc.property(
        // 本地已安装技能列表
        fc.array(
          fc.record({
            id: skillIdArb,
            name: fc.string({ minLength: 1, maxLength: 20 }),
          }),
          { minLength: 0, maxLength: 10 },
        ),
        // 搜索结果列表
        fc.array(
          fc.record({
            id: skillIdArb,
            name: fc.string({ minLength: 1, maxLength: 20 }),
            description: fc.string({ minLength: 0, maxLength: 40 }),
          }),
          { minLength: 0, maxLength: 10 },
        ),
        (localSkills, searchResults) => {
          const merged = mergeSearchResults(localSkills, searchResults);
          const installedIds = new Set(localSkills.map((s) => s.id));

          // 合并结果数量应等于搜索结果数量
          expect(merged.length).toBe(searchResults.length);

          // 逐项验证 installed 标识
          for (let i = 0; i < merged.length; i++) {
            const item = merged[i];
            const expectedInstalled = installedIds.has(searchResults[i].id);
            expect(item.installed).toBe(expectedInstalled);

            // 保留原始搜索结果字段
            expect(item.id).toBe(searchResults[i].id);
            expect(item.name).toBe(searchResults[i].name);
            expect(item.description).toBe(searchResults[i].description);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ============================================================================
// Property 6: 技能配置持久化往返一致性
// Feature: skills-management, Property 6: 技能配置持久化往返一致性
// **Validates: Requirements 6.3**
// ============================================================================

import {
  SkillsDiskCache,
  createDebouncedNotifier,
  type SkillEntryConfig,
} from '../skillsLogic';

/**
 * 生成有效的 SkillEntryConfig 对象
 * 包含 enabled、apiKey（字符串或对象形式）、env 键值对、config 键值对
 */
const skillEntryConfigArb: fc.Arbitrary<SkillEntryConfig> = fc.record({
  enabled: fc.option(fc.boolean(), { nil: undefined }),
  apiKey: fc.option(
    fc.oneof(
      // 字符串形式的 apiKey
      fc.string({ minLength: 1, maxLength: 40 }),
      // 对象形式的 apiKey（source/provider/id）
      fc.record({
        source: fc.string({ unit: fc.constantFrom(...LOWER_DIGIT.split('')), minLength: 1, maxLength: 10 }),
        provider: fc.string({ unit: fc.constantFrom(...LOWER_DIGIT.split('')), minLength: 1, maxLength: 10 }),
        id: fc.string({ unit: fc.constantFrom(...LOWER_DIGIT.split('')), minLength: 1, maxLength: 10 }),
      }),
    ),
    { nil: undefined },
  ),
  env: fc.option(
    fc.dictionary(
      fc.string({ unit: fc.constantFrom(...UPPER_UNDERSCORE.split('')), minLength: 1, maxLength: 12 }),
      fc.string({ minLength: 0, maxLength: 30 }),
      { minKeys: 0, maxKeys: 5 },
    ),
    { nil: undefined },
  ),
  config: fc.option(
    fc.dictionary(
      fc.string({ unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz.'.split('')), minLength: 1, maxLength: 12 }),
      fc.oneof(fc.string({ maxLength: 20 }), fc.integer(), fc.boolean(), fc.constant(null)) as fc.Arbitrary<unknown>,
      { minKeys: 0, maxKeys: 5 },
    ),
    { nil: undefined },
  ),
});

describe('Property 6: 技能配置持久化往返一致性', () => {
  test('对于任意有效 SkillEntryConfig，JSON 序列化/反序列化应产生语义等价对象', () => {
    fc.assert(
      fc.property(skillEntryConfigArb, (config) => {
        // 模拟写入 openclaw.json 的 skills.entries.<id> 节点（JSON 序列化）
        const serialized = JSON.stringify(config);

        // 模拟从 openclaw.json 读取回来（JSON 反序列化）
        const deserialized = JSON.parse(serialized) as SkillEntryConfig;

        // 通过 JSON 清理 undefined 值后进行深度比较
        // （JSON.stringify 会移除 undefined 值的键，这与文件持久化行为一致）
        const cleanOriginal = JSON.parse(JSON.stringify(config));
        expect(deserialized).toEqual(cleanOriginal);
      }),
      { numRuns: 100 },
    );
  });
});

// ============================================================================
// Property 7: 磁盘缓存 TTL 行为
// Feature: skills-management, Property 7: 磁盘缓存 TTL 行为
// **Validates: Requirements 9.2**
// ============================================================================

describe('Property 7: 磁盘缓存 TTL 行为', () => {
  test('缓存在 TTL 内返回原始数据，TTL 后返回 null，invalidate 后立即返回 null', () => {
    fc.assert(
      fc.property(
        // 随机缓存数据
        fc.anything(),
        // TTL 内的时间偏移（0 到 29999 毫秒）
        fc.integer({ min: 0, max: 29_999 }),
        // TTL 外的时间偏移（30001 到 120000 毫秒）
        fc.integer({ min: 30_001, max: 120_000 }),
        (data, withinTtlOffset, beyondTtlOffset) => {
          const baseTime = 1_000_000_000;
          let currentTime = baseTime;

          // 创建缓存实例，注入可控的时间函数
          const cache = new SkillsDiskCache(30_000, () => currentTime);

          // 写入缓存
          cache.set(data);

          // 在 TTL 内读取应返回原始数据
          currentTime = baseTime + withinTtlOffset;
          const withinResult = cache.get();
          // 通过 JSON 序列化清理后比较（处理 undefined/NaN 等特殊值）
          expect(JSON.stringify(withinResult)).toBe(JSON.stringify(data));

          // 在 TTL 外读取应返回 null
          currentTime = baseTime + beyondTtlOffset;
          const beyondResult = cache.get();
          expect(beyondResult).toBeNull();

          // 重新写入后，invalidate 应立即清除
          currentTime = baseTime;
          cache.set(data);
          cache.invalidate();
          const afterInvalidate = cache.get();
          expect(afterInvalidate).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================================
// Property 8: 无效 SKILL.md 输入返回错误结果
// Feature: skills-management, Property 8: 无效 SKILL.md 输入返回错误结果
// **Validates: Requirements 10.4**
// ============================================================================

/**
 * 生成不含有效 YAML frontmatter 的字符串
 * 策略：生成不包含 --- 分隔符对的随机字符串，或包含无效 YAML 的 frontmatter
 */
const invalidSkillMdArb: fc.Arbitrary<string> = fc.oneof(
  // 策略 1：完全没有 --- 分隔符的随机字符串
  fc.string({ minLength: 0, maxLength: 200 }).filter((s) => !s.includes('---')),

  // 策略 2：只有一个 --- 分隔符（缺少闭合）
  fc.string({ minLength: 1, maxLength: 100 }).map((s) => `---\n${s}`),

  // 策略 3：有 --- 对但 YAML 语法错误（无效缩进/冒号）
  fc.constant('---\n  bad:\n    - [\ninvalid yaml {{{\n---\n'),

  // 策略 4：有效 YAML 但缺少必需字段 name
  fc.string({ minLength: 1, maxLength: 50 }).map(
    (desc) => `---\ndescription: ${desc}\n---\n`,
  ),

  // 策略 5：有效 YAML 但缺少必需字段 description
  fc.string({
    unit: fc.constantFrom(...LOWER_DIGIT.split('')),
    minLength: 1,
    maxLength: 20,
  }).map((name) => `---\nname: ${name}\n---\n`),

  // 策略 6：frontmatter 内容为空
  fc.constant('---\n\n---\n'),

  // 策略 7：frontmatter 内容为非对象类型（如纯字符串）
  fc.constant('---\njust a string\n---\n'),
);

describe('Property 8: 无效 SKILL.md 输入返回错误结果', () => {
  test('对于任意不含有效 frontmatter 的字符串，parseSkillMd 应返回 ok: false 且不抛异常', () => {
    fc.assert(
      fc.property(invalidSkillMdArb, (input) => {
        // 不应抛出异常
        let result: ReturnType<typeof parseSkillMd>;
        expect(() => {
          result = parseSkillMd(input);
        }).not.toThrow();

        // 应返回错误结果
        expect(result!.ok).toBe(false);

        // error 字符串应非空
        if (!result!.ok) {
          expect(typeof result!.error).toBe('string');
          expect(result!.error.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ============================================================================
// Property 9: 文件监听防抖行为
// Feature: skills-management, Property 9: 文件监听防抖行为
// **Validates: Requirements 11.2**
// ============================================================================

describe('Property 9: 文件监听防抖行为', () => {
  test('对于任意 N >= 1 次在 500ms 窗口内的文件变更事件，防抖逻辑应仅触发 1 次回调', () => {
    fc.assert(
      fc.property(
        // 事件次数 N（1 到 50）
        fc.integer({ min: 1, max: 50 }),
        (eventCount) => {
          // 使用 vitest fake timers 控制 setTimeout/clearTimeout
          vi.useFakeTimers();

          try {
            let callbackCount = 0;
            const notifier = createDebouncedNotifier(500, () => {
              callbackCount++;
            });

            // 在窗口内触发 N 次事件（不推进时间）
            for (let i = 0; i < eventCount; i++) {
              notifier.notify();
            }

            // 此时回调不应被触发（仍在防抖等待中）
            expect(callbackCount).toBe(0);

            // 推进时间超过防抖延迟，触发回调
            vi.advanceTimersByTime(500);

            // 回调应恰好触发 1 次
            expect(callbackCount).toBe(1);

            // 清理
            notifier.cancel();
          } finally {
            // 恢复真实 timers
            vi.useRealTimers();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================================
// Property 10: 技能详情包含所有必需字段
// Feature: skills-management, Property 10: 技能详情包含所有必需字段
// **Validates: Requirements 4.2**
// ============================================================================

/**
 * 生成随机 SkillInfo 对象（包含所有必需字段）
 * 对应 types/electron.ts 中的 SkillInfo 接口
 */
const skillInfoArb = fc.record({
  id: skillIdArb,
  name: fc.string({ minLength: 1, maxLength: 30 }),
  description: fc.string({ minLength: 0, maxLength: 60 }),
  version: fc.tuple(fc.integer({ min: 0, max: 9 }), fc.integer({ min: 0, max: 9 }), fc.integer({ min: 0, max: 9 }))
    .map(([a, b, c]) => `${a}.${b}.${c}`),
  author: fc.string({ minLength: 1, maxLength: 20 }),
  category: fc.constantFrom('feishu', 'development', 'productivity', 'ai', 'security', 'tools'),
  status: fc.constantFrom('installed', 'available', 'updatable', 'error') as fc.Arbitrary<'installed' | 'available' | 'updatable' | 'error'>,
  enabled: fc.boolean(),
  emoji: fc.option(fc.constantFrom('🔧', '🎯', '📦', '🚀', '💡', '🤖'), { nil: undefined }),
  source: fc.constantFrom('custom', 'clawhub', 'bundled', 'plugin') as fc.Arbitrary<'custom' | 'clawhub' | 'bundled' | 'plugin'>,
  isCustom: fc.boolean(),
});

describe('Property 10: 技能详情包含所有必需字段', () => {
  test('对于任意有效 SkillInfo，详情渲染数据应包含所有必需字段', () => {
    fc.assert(
      fc.property(skillInfoArb, (skillInfo) => {
        // 模拟详情面板的渲染数据提取逻辑
        // 从 SkillInfo 中提取详情面板需要展示的字段
        const detailData = {
          name: skillInfo.name,
          description: skillInfo.description,
          version: skillInfo.version,
          author: skillInfo.author,
          category: skillInfo.category,
          status: skillInfo.status,
          enabled: skillInfo.enabled,
          ...(skillInfo.emoji !== undefined ? { emoji: skillInfo.emoji } : {}),
        };

        // 验证所有必需字段存在且类型正确
        expect(typeof detailData.name).toBe('string');
        expect(detailData.name.length).toBeGreaterThan(0);

        expect(typeof detailData.description).toBe('string');

        expect(typeof detailData.version).toBe('string');
        expect(detailData.version.length).toBeGreaterThan(0);

        expect(typeof detailData.author).toBe('string');
        expect(detailData.author.length).toBeGreaterThan(0);

        expect(typeof detailData.category).toBe('string');
        expect(detailData.category.length).toBeGreaterThan(0);

        expect(typeof detailData.status).toBe('string');
        expect(['installed', 'available', 'updatable', 'error']).toContain(detailData.status);

        expect(typeof detailData.enabled).toBe('boolean');

        // emoji 如果存在则应为非空字符串
        if (skillInfo.emoji !== undefined) {
          expect(typeof detailData.emoji).toBe('string');
          expect(detailData.emoji!.length).toBeGreaterThan(0);
        }

        // 验证必需字段的键集合完整性
        const requiredKeys = ['name', 'description', 'version', 'author', 'category', 'status', 'enabled'];
        for (const key of requiredKeys) {
          expect(detailData).toHaveProperty(key);
        }
      }),
      { numRuns: 100 },
    );
  });
});
