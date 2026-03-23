/**
 * 属性测试：Agent 配置完整性检查逻辑
 * Feature: main-agent-init-completeness
 *
 * 使用 fast-check 对纯函数进行属性测试，
 * 验证完整性检查、修复计划生成、默认内容生成和重命名校验的正确性。
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import type { AgentInfo } from '../agents.js';
import {
  checkAgentCompleteness,
  planAgentCompletenessRepair,
  generateDefaultWorkspaceFileContent,
  validateAgentRename,
  COMPLETENESS_WORKSPACE_FILES,
  type CheckStatus,
  type CompletenessReport,
  type ExistsFn,
} from '../agentCompletenessLogic.js';

// ── 生成器（Arbitraries）──────────────────────────────────────────

/**
 * 生成非空路径字符串（模拟有效的文件系统路径）
 */
const nonEmptyPathArb = (): fc.Arbitrary<string> =>
  fc.stringMatching(/^\/[a-zA-Z0-9_\-/.]+$/).filter((s) => s.length >= 2);

/**
 * 生成合法的 agent 名称
 */
const agentNameArb = (): fc.Arbitrary<string> =>
  fc.stringMatching(/^[a-zA-Z0-9_-]+$/).filter((s) => s.length >= 1);

/**
 * 生成带有非空 workspaceRoot 和 agentConfigRoot 的 AgentInfo
 */
const fullAgentInfoArb = (): fc.Arbitrary<AgentInfo> =>
  fc.record({
    id: fc.string({ minLength: 1, maxLength: 20 }),
    name: agentNameArb(),
    workspace: fc.string({ minLength: 1, maxLength: 30 }),
    model: fc.string({ minLength: 1, maxLength: 20 }),
    workspaceRoot: nonEmptyPathArb(),
    agentConfigRoot: nonEmptyPathArb(),
  });

/**
 * 生成 workspaceRoot 为空/undefined 的 AgentInfo
 */
const emptyWorkspaceRootAgentInfoArb = (): fc.Arbitrary<AgentInfo> =>
  fc.record({
    id: fc.string({ minLength: 1, maxLength: 20 }),
    name: agentNameArb(),
    workspace: fc.string({ minLength: 1, maxLength: 30 }),
    model: fc.string({ minLength: 1, maxLength: 20 }),
    workspaceRoot: fc.constantFrom(undefined, '') as fc.Arbitrary<string | undefined>,
    agentConfigRoot: nonEmptyPathArb(),
  }) as fc.Arbitrary<AgentInfo>;

/**
 * 生成 agentConfigRoot 为空/undefined 的 AgentInfo
 */
const emptyConfigRootAgentInfoArb = (): fc.Arbitrary<AgentInfo> =>
  fc.record({
    id: fc.string({ minLength: 1, maxLength: 20 }),
    name: agentNameArb(),
    workspace: fc.string({ minLength: 1, maxLength: 30 }),
    model: fc.string({ minLength: 1, maxLength: 20 }),
    workspaceRoot: nonEmptyPathArb(),
    agentConfigRoot: fc.constantFrom(undefined, '') as fc.Arbitrary<string | undefined>,
  }) as fc.Arbitrary<AgentInfo>;

/**
 * 生成任意 AgentInfo（workspaceRoot 和 agentConfigRoot 可能为空）
 */
const anyAgentInfoArb = (): fc.Arbitrary<AgentInfo> =>
  fc.record({
    id: fc.string({ minLength: 1, maxLength: 20 }),
    name: agentNameArb(),
    workspace: fc.string({ minLength: 1, maxLength: 30 }),
    model: fc.string({ minLength: 1, maxLength: 20 }),
    workspaceRoot: fc.oneof(nonEmptyPathArb(), fc.constantFrom(undefined, '')) as fc.Arbitrary<string | undefined>,
    agentConfigRoot: fc.oneof(nonEmptyPathArb(), fc.constantFrom(undefined, '')) as fc.Arbitrary<string | undefined>,
  }) as fc.Arbitrary<AgentInfo>;

/**
 * 生成随机的 existsFn 函数（基于路径集合）
 */
const existsFnArb = (): fc.Arbitrary<ExistsFn> =>
  fc.boolean().map((defaultVal) => (_path: string) => defaultVal);

/**
 * 生成 CheckStatus 值
 */
const checkStatusArb = (): fc.Arbitrary<CheckStatus> =>
  fc.constantFrom('present' as CheckStatus, 'missing' as CheckStatus);

/**
 * 生成完整的 CompletenessReport
 */
const completenessReportArb = (): fc.Arbitrary<CompletenessReport> =>
  fc.record({
    workspaceDir: checkStatusArb(),
    workspaceFiles: fc.record(
      Object.fromEntries(
        COMPLETENESS_WORKSPACE_FILES.map((f) => [f, checkStatusArb()])
      ) as Record<string, fc.Arbitrary<CheckStatus>>,
    ),
    agentConfigDir: checkStatusArb(),
    modelsJson: checkStatusArb(),
  });

// ============================================================
// Property 1: 报告结构完整性
// Feature: main-agent-init-completeness, Property 1: 报告结构完整性
// ============================================================

describe('Feature: main-agent-init-completeness, Property 1: 报告结构完整性', () => {
  /**
   * Validates: Requirements 1.1, 1.2
   *
   * 对任意 AgentInfo 和 existsFn，checkAgentCompleteness 返回的报告
   * 应包含所有必需字段，且值均为 'present' 或 'missing'。
   */
  test('报告应包含所有必需字段且值为有效的 CheckStatus', () => {
    fc.assert(
      fc.property(
        anyAgentInfoArb(),
        fc.boolean(),
        (agentInfo, existsResult) => {
          const existsFn: ExistsFn = () => existsResult;
          const report = checkAgentCompleteness(agentInfo, existsFn);

          // 验证顶层字段存在且值有效
          expect(['present', 'missing']).toContain(report.workspaceDir);
          expect(['present', 'missing']).toContain(report.agentConfigDir);
          expect(['present', 'missing']).toContain(report.modelsJson);

          // 验证 workspaceFiles 包含全部 7 个文件
          expect(Object.keys(report.workspaceFiles).sort()).toEqual(
            [...COMPLETENESS_WORKSPACE_FILES].sort(),
          );

          // 验证每个 workspaceFile 的值有效
          for (const file of COMPLETENESS_WORKSPACE_FILES) {
            expect(['present', 'missing']).toContain(report.workspaceFiles[file]);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ============================================================
// Property 2: 空路径导致 missing
// Feature: main-agent-init-completeness, Property 2: 空路径导致 missing
// ============================================================

describe('Feature: main-agent-init-completeness, Property 2: 空路径导致 missing', () => {
  /**
   * Validates: Requirements 1.3, 1.4
   *
   * 当 workspaceRoot 为空/undefined 时，workspaceDir 和所有 workspaceFiles 应为 'missing'。
   * 当 agentConfigRoot 为空/undefined 时，agentConfigDir 和 modelsJson 应为 'missing'。
   */
  test('workspaceRoot 为空/undefined 时，workspace 相关项均为 missing', () => {
    fc.assert(
      fc.property(
        emptyWorkspaceRootAgentInfoArb(),
        fc.boolean(),
        (agentInfo, existsResult) => {
          const existsFn: ExistsFn = () => existsResult;
          const report = checkAgentCompleteness(agentInfo, existsFn);

          // workspaceDir 必须为 missing
          expect(report.workspaceDir).toBe('missing');

          // 所有 workspaceFiles 必须为 missing
          for (const file of COMPLETENESS_WORKSPACE_FILES) {
            expect(report.workspaceFiles[file]).toBe('missing');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  test('agentConfigRoot 为空/undefined 时，config 相关项均为 missing', () => {
    fc.assert(
      fc.property(
        emptyConfigRootAgentInfoArb(),
        fc.boolean(),
        (agentInfo, existsResult) => {
          const existsFn: ExistsFn = () => existsResult;
          const report = checkAgentCompleteness(agentInfo, existsFn);

          // agentConfigDir 必须为 missing
          expect(report.agentConfigDir).toBe('missing');

          // modelsJson 必须为 missing
          expect(report.modelsJson).toBe('missing');
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 3: existsFn 结果正确映射到报告
// Feature: main-agent-init-completeness, Property 3: existsFn 结果正确映射到报告
// ============================================================

describe('Feature: main-agent-init-completeness, Property 3: existsFn 结果正确映射到报告', () => {
  /**
   * Validates: Requirements 1.1, 1.2
   *
   * 对任意 AgentInfo（路径非空）和 existsFn，
   * 报告中每个检查项的状态应与 existsFn 对对应路径的返回值一致。
   */
  test('existsFn 返回值应正确映射到报告中的 present/missing 状态', () => {
    fc.assert(
      fc.property(
        fullAgentInfoArb(),
        fc.boolean(),
        (agentInfo, existsResult) => {
          // 使用统一返回值的 existsFn，便于验证映射关系
          const existsFn: ExistsFn = () => existsResult;
          const report = checkAgentCompleteness(agentInfo, existsFn);
          const expected: CheckStatus = existsResult ? 'present' : 'missing';

          // workspaceDir 应与 existsFn(workspaceRoot) 一致
          expect(report.workspaceDir).toBe(expected);

          // 每个 workspaceFile 应与 existsFn(join(workspaceRoot, file)) 一致
          for (const file of COMPLETENESS_WORKSPACE_FILES) {
            expect(report.workspaceFiles[file]).toBe(expected);
          }

          // agentConfigDir 应与 existsFn(agentConfigRoot) 一致
          expect(report.agentConfigDir).toBe(expected);

          // modelsJson 应与 existsFn(join(agentConfigRoot, 'models.json')) 一致
          expect(report.modelsJson).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 4: missing 项与修复动作一一对应
// Feature: main-agent-init-completeness, Property 4: missing 项与修复动作一一对应
// ============================================================

describe('Feature: main-agent-init-completeness, Property 4: missing 项与修复动作一一对应', () => {
  /**
   * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
   *
   * 对任意 AgentInfo（路径非空）和 CompletenessReport，
   * missing 的目录项应在 directoriesToCreate 中，missing 的文件项应在 filesToWrite 中，
   * present 的项不应出现在修复计划中。
   */
  test('missing 项生成对应修复动作，present 项不生成修复动作', () => {
    fc.assert(
      fc.property(
        fullAgentInfoArb(),
        completenessReportArb(),
        (agentInfo, report) => {
          const plan = planAgentCompletenessRepair(agentInfo, report);

          // 验证 workspaceDir
          if (report.workspaceDir === 'missing') {
            expect(plan.directoriesToCreate).toContain(agentInfo.workspaceRoot);
          } else {
            expect(plan.directoriesToCreate).not.toContain(agentInfo.workspaceRoot);
          }

          // 验证 agentConfigDir
          if (report.agentConfigDir === 'missing') {
            expect(plan.directoriesToCreate).toContain(agentInfo.agentConfigRoot);
          } else {
            expect(plan.directoriesToCreate).not.toContain(agentInfo.agentConfigRoot);
          }

          // 验证 workspace 文件
          const filePaths = plan.filesToWrite.map((f) => f.path);
          for (const file of COMPLETENESS_WORKSPACE_FILES) {
            const expectedPath = `${agentInfo.workspaceRoot}/${file}`;
            // 使用 path.join 的结果来匹配
            const matchingFile = plan.filesToWrite.find(
              (f) => f.path.endsWith(`/${file}`) || f.path.endsWith(`\\${file}`),
            );
            if (report.workspaceFiles[file] === 'missing') {
              expect(matchingFile).toBeDefined();
            } else {
              expect(matchingFile).toBeUndefined();
            }
          }

          // 验证 models.json
          const modelsJsonFile = plan.filesToWrite.find(
            (f) => f.path.endsWith('/models.json') || f.path.endsWith('\\models.json'),
          );
          if (report.modelsJson === 'missing') {
            expect(modelsJsonFile).toBeDefined();
          } else {
            expect(modelsJsonFile).toBeUndefined();
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  test('所有项均为 present 时，修复计划为空', () => {
    fc.assert(
      fc.property(
        fullAgentInfoArb(),
        (agentInfo) => {
          // 构造全部 present 的报告
          const allPresentReport: CompletenessReport = {
            workspaceDir: 'present',
            workspaceFiles: Object.fromEntries(
              COMPLETENESS_WORKSPACE_FILES.map((f) => [f, 'present' as CheckStatus]),
            ),
            agentConfigDir: 'present',
            modelsJson: 'present',
          };

          const plan = planAgentCompletenessRepair(agentInfo, allPresentReport);

          expect(plan.directoriesToCreate).toHaveLength(0);
          expect(plan.filesToWrite).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 5: 已知文件默认内容包含 agentName
// Feature: main-agent-init-completeness, Property 5: 已知文件默认内容包含 agentName
// ============================================================

describe('Feature: main-agent-init-completeness, Property 5: 已知文件默认内容包含 agentName', () => {
  /**
   * Validates: Requirements 7.1, 7.2, 7.3, 7.4
   *
   * 对任意已知 workspace 文件名和非空 agentName，
   * generateDefaultWorkspaceFileContent 返回的内容应为非空字符串且包含 agentName。
   */
  test('已知文件的默认内容应为非空字符串且包含 agentName', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...COMPLETENESS_WORKSPACE_FILES),
        agentNameArb(),
        (fileName, agentName) => {
          const content = generateDefaultWorkspaceFileContent(fileName, agentName);

          // 内容非空
          expect(content.length).toBeGreaterThan(0);

          // 内容包含 agentName
          expect(content).toContain(agentName);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 6: 未知文件默认内容包含 fileName 和 agentName
// Feature: main-agent-init-completeness, Property 6: 未知文件默认内容包含 fileName 和 agentName
// ============================================================

describe('Feature: main-agent-init-completeness, Property 6: 未知文件默认内容包含 fileName 和 agentName', () => {
  /**
   * Validates: Requirements 7.5
   *
   * 对任意不在已知列表中的 fileName 和非空 agentName，
   * generateDefaultWorkspaceFileContent 返回的内容应为非空字符串，
   * 且同时包含 fileName 和 agentName。
   */
  test('未知文件的默认内容应包含 fileName 和 agentName', () => {
    // 已知文件名集合
    const knownFiles = new Set<string>(COMPLETENESS_WORKSPACE_FILES);

    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-zA-Z0-9_\-.]+$/).filter(
          (s) => s.length >= 1 && !knownFiles.has(s),
        ),
        agentNameArb(),
        (fileName, agentName) => {
          const content = generateDefaultWorkspaceFileContent(fileName, agentName);

          // 内容非空
          expect(content.length).toBeGreaterThan(0);

          // 内容包含 fileName
          expect(content).toContain(fileName);

          // 内容包含 agentName
          expect(content).toContain(agentName);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 7: 重命名校验 — 空名称和非法字符被拒绝
// Feature: main-agent-init-completeness, Property 7: 重命名校验 — 空名称和非法字符被拒绝
// ============================================================

describe('Feature: main-agent-init-completeness, Property 7: 重命名校验 — 空名称和非法字符被拒绝', () => {
  /**
   * Validates: Requirements 8.1
   *
   * 空字符串或纯空格字符串作为 newName 时，应返回 { valid: false }。
   */
  test('空名称或纯空格名称应被拒绝', () => {
    /** 生成空字符串或纯空格/tab 字符串 */
    const emptyOrWhitespaceArb: fc.Arbitrary<string> = fc.constantFrom(
      '', ' ', '  ', '   ', '\t', '\t ', ' \t ', '    ', '\t\t',
    );

    fc.assert(
      fc.property(
        emptyOrWhitespaceArb,
        (name: string) => {
          const result = validateAgentRename(name, []);
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 8.1
   *
   * 包含非 ASCII 字母/数字/连字符/下划线字符的 newName 应被拒绝。
   */
  test('包含非法字符的名称应被拒绝', () => {
    /** 生成包含非法字符的名称（trim 后非空且含非法字符） */
    const illegalCharNameArb = fc.tuple(
      fc.stringMatching(/^[a-zA-Z0-9_-]*$/),
      fc.constantFrom('@', '#', '$', '%', '!', '&', '*', '(', ')', '+', '=', '/', '?', '<', '>', ',', '.', ':', ';', '"', "'", '`', '~', '{', '}', '[', ']', '|', '中', '文'),
      fc.stringMatching(/^[a-zA-Z0-9_-]*$/),
    ).map(([prefix, illegal, suffix]) => `${prefix}${illegal}${suffix}`)
      .filter((name) => {
        const trimmed = name.trim();
        return trimmed.length > 0 && !/^[a-zA-Z0-9_-]+$/.test(trimmed);
      });

    fc.assert(
      fc.property(
        illegalCharNameArb,
        (name) => {
          const result = validateAgentRename(name, []);
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 8: 重命名校验 — 名称冲突检测
// Feature: main-agent-init-completeness, Property 8: 重命名校验 — 名称冲突检测
// ============================================================

describe('Feature: main-agent-init-completeness, Property 8: 重命名校验 — 名称冲突检测', () => {
  /**
   * Validates: Requirements 8.1
   *
   * 当 existingNames 中存在与 newName 相同的名称（不区分大小写）时，
   * 应返回 { valid: false }。
   */
  test('与已有名称冲突（不区分大小写）时应被拒绝', () => {
    fc.assert(
      fc.property(
        agentNameArb(),
        fc.array(agentNameArb(), { minLength: 0, maxLength: 5 }),
        (name, otherNames) => {
          // 将 name 的某种大小写变体加入 existingNames
          const variant = name.toUpperCase() === name ? name.toLowerCase() : name.toUpperCase();
          const existingNames = [...otherNames, variant];

          const result = validateAgentRename(name, existingNames);
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 8.1
   *
   * 当 newName 合法且不与 existingNames 冲突时，应返回 { valid: true }。
   */
  test('合法且不冲突的名称应通过校验', () => {
    fc.assert(
      fc.property(
        agentNameArb(),
        fc.array(agentNameArb(), { minLength: 0, maxLength: 5 }),
        (name, existingNames) => {
          // 过滤掉与 name 冲突的已有名称
          const nonConflicting = existingNames.filter(
            (existing) => existing.toLowerCase() !== name.trim().toLowerCase(),
          );

          const result = validateAgentRename(name, nonConflicting);
          expect(result.valid).toBe(true);
          expect(result.error).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });
});
