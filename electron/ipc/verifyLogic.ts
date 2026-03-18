/**
 * 验证错误分类逻辑（纯函数）
 * 从 SetupFlowContext.tsx 的 verifyLocalSetup 中提取，
 * 便于属性测试（PBT）验证。
 *
 * 增强：支持 ZodError 结构化解析 + IPC 错误码体系
 */

// ─── IPC 错误码类型定义 ─────────────────────────────────────────────────────

/** IPC 层面的结构化错误码，覆盖所有常见错误场景 */
export type IpcErrorCode =
  | 'ENOENT'              // 命令不存在
  | 'TIMEOUT'             // 执行超时
  | 'NETWORK_DNS'         // DNS 解析失败
  | 'NETWORK_REFUSED'     // 连接被拒绝
  | 'NETWORK_TIMEOUT'     // 网络连接超时
  | 'SCHEMA_INVALID'      // Schema 校验失败
  | 'AUTH_FAILED'         // 认证失败
  | 'SERVICE_NOT_INSTALLED' // 服务未安装
  | 'UNKNOWN';            // 未知错误

// ─── 验证错误分类结果接口 ───────────────────────────────────────────────────

/** 验证错误分类结果（向后兼容，新增 errorCode 和 schemaDetails 字段） */
export interface VerifyErrorInfo {
  /** 错误类别 */
  category: 'config_schema' | 'cli_unavailable' | 'gateway_failed' | 'unknown';
  /** 用户友好的错误描述 */
  message: string;
  /** 可操作的修复建议 */
  suggestion: string;
  /** 结构化错误码 */
  errorCode: IpcErrorCode;
  /** 解析出的 schema 错误详情（如 ZodError path + message） */
  schemaDetails?: Array<{ path: string; message: string }>;
}

// ─── 关键词列表 ─────────────────────────────────────────────────────────────

/** schema 错误关键词列表 */
const SCHEMA_ERROR_KEYWORDS = [
  'unrecognized key',
  'invalid dmscope',
  'invalid_type',
  'unrecognized_keys',
  'schema',
  'validation failed',
  'zoderror',
];

/** CLI 不可用错误关键词 */
const CLI_UNAVAILABLE_KEYWORDS = [
  'enoent',
  'spawn',
  'command not found',
  'not found',
  'no such file',
];

/** 网关失败错误关键词 */
const GATEWAY_FAILED_KEYWORDS = [
  'gateway',
  '网关',
  'econnrefused',
  'timeout',
  'timed out',
];

// ─── ZodError 解析 ──────────────────────────────────────────────────────────

/**
 * ZodError 单条错误条目的内部结构
 * 对应 Zod 库输出的 issues 数组中的每个元素
 */
interface ZodIssueRaw {
  /** 错误路径数组，如 ["session", "dmScope"] */
  path?: unknown[];
  /** 错误描述信息 */
  message?: string;
}

/**
 * 解析 ZodError 格式的 schema 校验错误
 *
 * 从 CLI 输出字符串中提取 ZodError JSON 结构，
 * 解析其中的 path 数组和 message 字段。
 *
 * 支持的格式：
 *   1. 完整 JSON 对象：{ "issues": [...], "name": "ZodError" }
 *   2. 仅 issues 数组：[{ "path": [...], "message": "..." }, ...]
 *   3. 嵌套在其他文本中的 JSON 片段
 *
 * @param output CLI 输出字符串，可能包含 ZodError JSON
 * @returns 解析出的错误条目数组，每条包含 path 和 message
 */
export function parseZodErrorDetails(
  output: string,
): Array<{ path: string; message: string }> {
  if (!output || typeof output !== 'string') {
    return [];
  }

  /** 从 issues 数组提取 path + message */
  const extractFromIssues = (issues: unknown[]): Array<{ path: string; message: string }> => {
    const results: Array<{ path: string; message: string }> = [];
    for (const issue of issues) {
      if (issue && typeof issue === 'object') {
        const raw = issue as ZodIssueRaw;
        const pathStr = Array.isArray(raw.path)
          ? raw.path.map(String).join('.')
          : '';
        const msg = typeof raw.message === 'string' ? raw.message : '';
        results.push({ path: pathStr, message: msg });
      }
    }
    return results;
  };

  // 策略 1：尝试匹配包含 "issues" 字段的 ZodError JSON 对象
  // 使用正则提取 JSON 对象片段（花括号匹配）
  const jsonObjectMatches = output.match(/\{[^{}]*"issues"\s*:\s*\[[\s\S]*?\][^{}]*\}/g);
  if (jsonObjectMatches) {
    for (const match of jsonObjectMatches) {
      try {
        const parsed = JSON.parse(match);
        if (parsed && Array.isArray(parsed.issues)) {
          const details = extractFromIssues(parsed.issues);
          if (details.length > 0) return details;
        }
      } catch {
        // JSON 解析失败，继续尝试下一个匹配
      }
    }
  }

  // 策略 2：尝试匹配独立的 JSON 数组（可能是 issues 数组本身）
  const jsonArrayMatches = output.match(/\[\s*\{[\s\S]*?\}\s*\]/g);
  if (jsonArrayMatches) {
    for (const match of jsonArrayMatches) {
      try {
        const parsed = JSON.parse(match);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // 检查是否看起来像 ZodError issues（含 path 或 message 字段）
          const looksLikeIssues = parsed.some(
            (item: unknown) =>
              item && typeof item === 'object' &&
              ('path' in (item as object) || 'message' in (item as object)),
          );
          if (looksLikeIssues) {
            const details = extractFromIssues(parsed);
            if (details.length > 0) return details;
          }
        }
      } catch {
        // JSON 解析失败，继续尝试
      }
    }
  }

  // 未找到可解析的 ZodError 结构
  return [];
}

// ─── 增强的错误分类函数 ─────────────────────────────────────────────────────

/**
 * 分类验证错误，返回具体的错误类别、描述和修复建议
 *
 * 增强逻辑：
 *   1. 优先尝试 ZodError 结构化解析，提取 schema 错误详情
 *   2. 如果 ZodError 解析成功，直接返回 config_schema 类别 + schemaDetails
 *   3. 否则回退到关键词匹配（向后兼容）
 *   4. 所有返回结果均包含 errorCode 字段
 *
 * @param errorMessage 原始错误信息
 * @returns 结构化的错误分类结果（含 errorCode 和可选 schemaDetails）
 */
export function classifyVerifyError(errorMessage: string): VerifyErrorInfo {
  const lower = errorMessage.toLowerCase();

  // ── 优先：尝试 ZodError 结构化解析 ──
  const zodDetails = parseZodErrorDetails(errorMessage);
  if (zodDetails.length > 0) {
    // 构建包含具体字段信息的错误描述
    const fieldList = zodDetails
      .map(d => d.path ? `${d.path}: ${d.message}` : d.message)
      .join('；');
    return {
      category: 'config_schema',
      message: `配置文件 schema 校验失败：${fieldList}`,
      suggestion: '请尝试运行 `openclaw doctor --fix` 修复配置文件，或手动检查 ~/.openclaw/openclaw.json 中的不兼容字段。',
      errorCode: 'SCHEMA_INVALID',
      schemaDetails: zodDetails,
    };
  }

  // ── 回退：关键词匹配（向后兼容） ──

  // 检查 schema 配置错误
  for (const keyword of SCHEMA_ERROR_KEYWORDS) {
    if (lower.includes(keyword)) {
      return {
        category: 'config_schema',
        message: '配置文件存在 schema 兼容性问题',
        suggestion: '请尝试运行 `openclaw doctor --fix` 修复配置文件，或手动检查 ~/.openclaw/openclaw.json 中的不兼容字段。',
        errorCode: 'SCHEMA_INVALID',
      };
    }
  }

  // 检查 CLI 不可用
  for (const keyword of CLI_UNAVAILABLE_KEYWORDS) {
    if (lower.includes(keyword)) {
      return {
        category: 'cli_unavailable',
        message: 'OpenClaw CLI 不可用',
        suggestion: '请确认 OpenClaw CLI 已正确安装，或在设置中配置正确的可执行文件路径。',
        errorCode: 'ENOENT',
      };
    }
  }

  // 检查网关失败（区分超时和连接拒绝）
  for (const keyword of GATEWAY_FAILED_KEYWORDS) {
    if (lower.includes(keyword)) {
      // 细分网关错误的 errorCode
      let errorCode: IpcErrorCode = 'NETWORK_REFUSED';
      if (lower.includes('timeout') || lower.includes('timed out')) {
        errorCode = 'NETWORK_TIMEOUT';
      } else if (lower.includes('econnrefused')) {
        errorCode = 'NETWORK_REFUSED';
      }
      return {
        category: 'gateway_failed',
        message: 'OpenClaw 网关启动或连接失败',
        suggestion: '请检查网关配置和端口是否被占用，或尝试重启网关服务。',
        errorCode,
      };
    }
  }

  // 未知错误
  return {
    category: 'unknown',
    message: '验证过程中发生未知错误',
    suggestion: '请检查 OpenClaw CLI 和网关状态后重试。',
    errorCode: 'UNKNOWN',
  };
}
