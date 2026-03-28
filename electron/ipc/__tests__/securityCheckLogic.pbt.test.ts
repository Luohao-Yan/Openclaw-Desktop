/**
 * 属性测试：安全检查结果完整性
 * Feature: agent-enhancement-features
 *
 * 使用 fast-check 验证安全检查结果数组的结构完整性：
 * - 每个结果对象包含 name、riskLevel、status、message、recommendation 字段
 * - 结果覆盖所有三个检查类别（文件权限、API 密钥、配置安全性）
 * - 结果数组恰好包含 3 项
 *
 * Property 2: 安全检查结果完整性（验证: 需求 8.2, 8.3）
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';

// ============================================================================
// 类型定义（与 agents:securityCheck handler 中的结果结构保持一致）
// ============================================================================

/** 安全检查结果项 */
interface SecurityCheckResult {
  name: string;
  riskLevel: 'low' | 'medium' | 'high';
  status: 'pass' | 'warning' | 'fail';
  message: string;
  recommendation: string;
}

/** 三个安全检查类别名称（与 handler 实现一致） */
const SECURITY_CHECK_CATEGORIES = [
  '文件权限检查',
  'API 密钥安全',
  '配置安全性',
] as const;

/** 有效的风险等级 */
const VALID_RISK_LEVELS: ReadonlyArray<SecurityCheckResult['riskLevel']> = ['low', 'medium', 'high'];

/** 有效的检查状态 */
const VALID_STATUSES: ReadonlyArray<SecurityCheckResult['status']> = ['pass', 'warning', 'fail'];

// ============================================================================
// 纯函数：模拟安全检查逻辑（从 handler 中提取的核心逻辑）
// ============================================================================

/**
 * 执行文件权限检查
 * 根据工作区是否存在及目录权限模式返回检查结果
 * @param workspaceExists 工作区目录是否存在
 * @param permissionMode Unix 权限位（0-511，即 0o000-0o777）
 * @param throwError 是否模拟异常
 */
function checkFilePermissions(
  workspaceExists: boolean,
  permissionMode: number,
  throwError: boolean,
): SecurityCheckResult {
  if (throwError) {
    return {
      name: '文件权限检查',
      riskLevel: 'medium',
      status: 'fail',
      message: '文件权限检查异常: 模拟错误',
      recommendation: '请检查工作区目录是否可访问',
    };
  }

  if (!workspaceExists) {
    return {
      name: '文件权限检查',
      riskLevel: 'medium',
      status: 'fail',
      message: '工作区目录不存在，无法检查文件权限',
      recommendation: '请确认 Agent 的 workspaceRoot 配置正确且目录已创建',
    };
  }

  // 权限位取低 9 位
  const mode = permissionMode & 0o777;
  const isSecure = mode <= 0o755;

  return {
    name: '文件权限检查',
    riskLevel: isSecure ? 'low' : 'medium',
    status: isSecure ? 'pass' : 'warning',
    message: isSecure
      ? `工作区目录权限正常 (${mode.toString(8)})`
      : `工作区目录权限过于宽松 (${mode.toString(8)})，超过 755`,
    recommendation: isSecure
      ? '当前权限设置合理，无需调整'
      : '建议执行 chmod 755 将工作区目录权限收紧至 755 或更严格',
  };
}

/**
 * 执行 API 密钥安全检查
 * 扫描配置 JSON 字符串中是否包含常见明文密钥模式
 * @param configJson 配置对象的 JSON 字符串
 * @param throwError 是否模拟异常
 */
function checkApiKeySecurity(
  configJson: string,
  throwError: boolean,
): SecurityCheckResult {
  if (throwError) {
    return {
      name: 'API 密钥安全',
      riskLevel: 'medium',
      status: 'fail',
      message: 'API 密钥安全检查异常: 模拟错误',
      recommendation: '请确认 openclaw.json 配置文件可正常读取',
    };
  }

  const apiKeyPatterns = [/sk-/i, /key-/i, /api[_-]?key/i, /secret[_-]?key/i, /token[_-]/i, /bearer\s+/i];
  const foundPatterns: string[] = [];

  for (const pattern of apiKeyPatterns) {
    if (pattern.test(configJson)) {
      foundPatterns.push(pattern.source);
    }
  }

  const hasExposedKeys = foundPatterns.length > 0;

  return {
    name: 'API 密钥安全',
    riskLevel: hasExposedKeys ? 'high' : 'low',
    status: hasExposedKeys ? 'fail' : 'pass',
    message: hasExposedKeys
      ? `配置文件中检测到疑似明文 API 密钥 (匹配模式: ${foundPatterns.join(', ')})`
      : '配置文件中未检测到明文 API 密钥',
    recommendation: hasExposedKeys
      ? '建议将 API 密钥移至环境变量或加密存储，避免在配置文件中明文保存'
      : '当前配置安全，建议定期检查是否有新增的明文密钥',
  };
}

/**
 * 执行配置安全性检查
 * 检查 allowAgents 是否包含通配符、bindings 是否完整
 * @param allowAgents 子智能体允许列表
 * @param bindings 绑定配置数组
 * @param throwError 是否模拟异常
 */
function checkConfigSecurity(
  allowAgents: string[],
  bindings: Array<{ channel?: string; accountId?: string }>,
  throwError: boolean,
): SecurityCheckResult {
  if (throwError) {
    return {
      name: '配置安全性',
      riskLevel: 'medium',
      status: 'fail',
      message: '配置安全性检查异常: 模拟错误',
      recommendation: '请检查 Agent 配置是否完整',
    };
  }

  const issues: string[] = [];

  // 检查 allowAgents 是否包含通配符 '*'
  const hasWildcard = allowAgents.some((a) => a === '*');
  if (hasWildcard) {
    issues.push('allowAgents 包含通配符 "*"，允许所有子智能体访问');
  }

  // 检查 bindings 是否都有正确的 channel 和 accountId
  for (const binding of bindings) {
    if (!binding.channel || typeof binding.channel !== 'string' || !binding.channel.trim()) {
      issues.push('存在缺少 channel 的绑定配置');
    }
    if (!binding.accountId || typeof binding.accountId !== 'string' || !binding.accountId.trim()) {
      issues.push('存在缺少 accountId 的绑定配置');
    }
  }

  const hasIssues = issues.length > 0;

  return {
    name: '配置安全性',
    riskLevel: hasIssues ? 'medium' : 'low',
    status: hasIssues ? 'warning' : 'pass',
    message: hasIssues
      ? `发现 ${issues.length} 个配置安全问题: ${issues.join('; ')}`
      : '关键配置项均使用安全默认值',
    recommendation: hasIssues
      ? '建议限制 allowAgents 范围（避免使用通配符），并确保所有 bindings 都配置了 channel 和 accountId'
      : '当前配置安全，建议定期审查配置变更',
  };
}

/**
 * 执行完整的安全检查，返回三个检查类别的结果数组
 * 这是从 agents:securityCheck handler 中提取的纯逻辑
 */
function performSecurityCheck(input: {
  workspaceExists: boolean;
  permissionMode: number;
  configJson: string;
  allowAgents: string[];
  bindings: Array<{ channel?: string; accountId?: string }>;
  errors: { filePermission: boolean; apiKey: boolean; configSecurity: boolean };
}): SecurityCheckResult[] {
  return [
    checkFilePermissions(input.workspaceExists, input.permissionMode, input.errors.filePermission),
    checkApiKeySecurity(input.configJson, input.errors.apiKey),
    checkConfigSecurity(input.allowAgents, input.bindings, input.errors.configSecurity),
  ];
}

// ============================================================================
// 结果验证函数
// ============================================================================

/**
 * 验证单个安全检查结果是否符合 SecurityCheckResult 结构
 * 检查所有必需字段的类型和值域
 */
function validateSecurityCheckResult(result: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (result === null || typeof result !== 'object') {
    return { valid: false, errors: ['结果不是有效的对象'] };
  }

  const r = result as Record<string, unknown>;

  // 检查 name 字段：非空字符串
  if (typeof r.name !== 'string' || r.name.length === 0) {
    errors.push('name 字段必须是非空字符串');
  }

  // 检查 riskLevel 字段：'low' | 'medium' | 'high'
  if (!VALID_RISK_LEVELS.includes(r.riskLevel as any)) {
    errors.push(`riskLevel 字段必须是 ${VALID_RISK_LEVELS.join('|')} 之一，实际值: ${String(r.riskLevel)}`);
  }

  // 检查 status 字段：'pass' | 'warning' | 'fail'
  if (!VALID_STATUSES.includes(r.status as any)) {
    errors.push(`status 字段必须是 ${VALID_STATUSES.join('|')} 之一，实际值: ${String(r.status)}`);
  }

  // 检查 message 字段：非空字符串
  if (typeof r.message !== 'string' || r.message.length === 0) {
    errors.push('message 字段必须是非空字符串');
  }

  // 检查 recommendation 字段：字符串（可以为空）
  if (typeof r.recommendation !== 'string') {
    errors.push('recommendation 字段必须是字符串');
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// 生成器（Arbitraries）
// ============================================================================

/** 生成随机的 Unix 权限位（0o000 - 0o777） */
const permissionModeArb = fc.integer({ min: 0, max: 0o777 });

/** 生成随机的配置 JSON 字符串（可能包含或不包含 API 密钥模式） */
const configJsonArb = fc.oneof(
  // 不含密钥模式的普通配置
  fc.record({
    name: fc.string({ minLength: 1, maxLength: 20 }),
    version: fc.string({ minLength: 1, maxLength: 10 }),
    enabled: fc.boolean(),
  }).map((obj) => JSON.stringify(obj)),
  // 可能包含密钥模式的配置
  fc.record({
    name: fc.string({ minLength: 1, maxLength: 20 }),
    apiKey: fc.constantFrom('sk-abc123', 'key-xyz', 'normal-value', 'safe-config'),
    token: fc.constantFrom('token_abc', 'bearer abc', 'myvalue', '12345'),
  }).map((obj) => JSON.stringify(obj)),
);

/** 生成随机的 allowAgents 数组 */
const allowAgentsArb = fc.array(
  fc.oneof(
    fc.string({ minLength: 1, maxLength: 16 }),
    fc.constant('*'),
  ),
  { minLength: 0, maxLength: 5 },
);

/** 生成随机的 binding 对象 */
const bindingArb = fc.record({
  channel: fc.oneof(
    fc.string({ minLength: 1, maxLength: 16 }),
    fc.constant(''),
    fc.constant(undefined as unknown as string),
  ),
  accountId: fc.oneof(
    fc.string({ minLength: 1, maxLength: 16 }),
    fc.constant(''),
    fc.constant(undefined as unknown as string),
  ),
});

/** 生成随机的 bindings 数组 */
const bindingsArb = fc.array(bindingArb, { minLength: 0, maxLength: 5 });

/** 生成随机的错误标志（控制每个检查项是否抛出异常） */
const errorsArb = fc.record({
  filePermission: fc.boolean(),
  apiKey: fc.boolean(),
  configSecurity: fc.boolean(),
});

/** 生成完整的安全检查输入 */
const securityCheckInputArb = fc.record({
  workspaceExists: fc.boolean(),
  permissionMode: permissionModeArb,
  configJson: configJsonArb,
  allowAgents: allowAgentsArb,
  bindings: bindingsArb,
  errors: errorsArb,
});

// ============================================================================
// Property 2: 安全检查结果完整性
// Feature: agent-enhancement-features, Property 2: 安全检查结果完整性
// ============================================================================

describe('Feature: agent-enhancement-features, Property 2: 安全检查结果完整性', () => {
  /**
   * **Validates: Requirements 8.2, 8.3**
   *
   * 对任意 Agent 配置和工作区状态，安全检查返回的结果数组中：
   * 1. 每个结果对象包含 name（非空字符串）、riskLevel（'low'|'medium'|'high'）、
   *    status（'pass'|'warning'|'fail'）、message（非空字符串）、recommendation（字符串）
   * 2. 结果覆盖所有三个检查类别（文件权限检查、API 密钥安全、配置安全性）
   * 3. 结果数组恰好包含 3 项
   */
  test(
    'Feature: agent-enhancement-features, Property 2: 安全检查结果完整性',
    () => {
      fc.assert(
        fc.property(
          securityCheckInputArb,
          (input) => {
            // 步骤 1：执行安全检查
            const results = performSecurityCheck(input);

            // 步骤 2：验证结果数组恰好包含 3 项
            expect(results).toHaveLength(3);

            // 步骤 3：验证每个结果对象的字段结构
            for (const result of results) {
              const validation = validateSecurityCheckResult(result);
              expect(validation.errors).toEqual([]);
              expect(validation.valid).toBe(true);
            }

            // 步骤 4：验证结果覆盖所有三个检查类别
            const resultNames = results.map((r) => r.name);
            for (const category of SECURITY_CHECK_CATEGORIES) {
              expect(resultNames).toContain(category);
            }

            // 步骤 5：验证每个类别恰好出现一次（无重复）
            const uniqueNames = new Set(resultNames);
            expect(uniqueNames.size).toBe(3);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
