/**
 * skillsLogic.ts — 技能管理纯逻辑模块
 *
 * 包含所有可独立测试的纯函数和类型定义，不依赖 Electron API 或文件系统。
 * 用于 SKILL.md 解析/格式化、名称验证、分类推断、ANSI 清理等。
 */

import yaml from 'js-yaml';

// ── 类型定义 ──────────────────────────────────────────────────────────────────

/** SKILL.md 结构化数据 */
export interface SkillMdData {
  frontmatter: {
    name: string;
    description: string;
    metadata?: {
      openclaw?: {
        emoji?: string;
        homepage?: string;
        requires?: { bins?: string[]; env?: string[]; config?: string[] };
        primaryEnv?: string;
        install?: Array<{
          id: string;
          kind: string;
          formula?: string;
          bins?: string[];
          label?: string;
        }>;
        always?: boolean;
        os?: string[];
      };
    };
    'user-invocable'?: boolean;
    'disable-model-invocation'?: boolean;
    'command-dispatch'?: string;
    'command-tool'?: string;
    'command-arg-mode'?: string;
  };
  /** key 为章节标题（如 "Instructions"、"Rules"），value 为 Markdown 内容 */
  sections: Record<string, string>;
}

/** 解析结果：成功或失败的判别联合类型 */
export type ParseResult =
  | { ok: true; data: SkillMdData }
  | { ok: false; error: string };

/** 技能运行时配置条目，对应 openclaw.json 中 skills.entries.<id> */
export interface SkillEntryConfig {
  enabled?: boolean;
  apiKey?: string | { source: string; provider: string; id: string };
  env?: Record<string, string>;
  config?: Record<string, unknown>;
}

// ── 名称验证 ──────────────────────────────────────────────────────────────────

/**
 * 将任意字符串转换为 kebab-case。
 * 规则：转小写 → 非字母数字字符替换为连字符 → 合并连续连字符 → 去除首尾连字符。
 * 处理后为空则返回 'skill' 作为兜底值。
 */
export function toKebabCase(input: string): string {
  const result = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // 非字母数字替换为连字符
    .replace(/-{2,}/g, '-')       // 合并连续连字符
    .replace(/^-+/, '')           // 去除开头连字符
    .replace(/-+$/, '');          // 去除结尾连字符

  return result || 'skill';
}

/**
 * 验证技能名称是否为有效的 kebab-case 格式。
 * 有效格式：小写字母或数字开头，可包含由单个连字符分隔的段。
 */
export function isValidSkillName(name: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name);
}

// ── SKILL.md 解析/格式化 ──────────────────────────────────────────────────────

/**
 * 解析 SKILL.md 原始文本为结构化对象。
 *
 * 提取 YAML frontmatter（含 metadata.openclaw 嵌套结构）和 Markdown 各章节。
 * 缺少 frontmatter 或 YAML 语法错误时返回 `{ ok: false, error }` 而非抛出异常。
 */
export function parseSkillMd(content: string): ParseResult {
  try {
    // 匹配 frontmatter：以 --- 开头，以 --- 结束
    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fmMatch) {
      return { ok: false, error: '缺少 YAML frontmatter（未找到 --- 分隔符）' };
    }

    const yamlStr = fmMatch[1];
    let parsed: Record<string, unknown>;

    try {
      parsed = yaml.load(yamlStr) as Record<string, unknown>;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: `YAML 解析错误: ${msg}` };
    }

    // 校验必需字段
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, error: 'frontmatter 内容为空或格式无效' };
    }
    if (typeof parsed.name !== 'string' || !parsed.name) {
      return { ok: false, error: 'frontmatter 缺少必需字段: name' };
    }
    if (typeof parsed.description !== 'string') {
      return { ok: false, error: 'frontmatter 缺少必需字段: description' };
    }

    // 构建 frontmatter 对象
    const frontmatter: SkillMdData['frontmatter'] = {
      name: parsed.name as string,
      description: parsed.description as string,
    };

    // 处理 metadata 字段（可能是内联 JSON 或 YAML 对象）
    if (parsed.metadata !== undefined && parsed.metadata !== null) {
      frontmatter.metadata = parsed.metadata as SkillMdData['frontmatter']['metadata'];
    }

    // 处理可选的布尔/字符串字段
    if (parsed['user-invocable'] !== undefined) {
      frontmatter['user-invocable'] = parsed['user-invocable'] as boolean;
    }
    if (parsed['disable-model-invocation'] !== undefined) {
      frontmatter['disable-model-invocation'] = parsed['disable-model-invocation'] as boolean;
    }
    if (parsed['command-dispatch'] !== undefined) {
      frontmatter['command-dispatch'] = parsed['command-dispatch'] as string;
    }
    if (parsed['command-tool'] !== undefined) {
      frontmatter['command-tool'] = parsed['command-tool'] as string;
    }
    if (parsed['command-arg-mode'] !== undefined) {
      frontmatter['command-arg-mode'] = parsed['command-arg-mode'] as string;
    }

    // 解析 Markdown 章节（## 标题）
    const bodyStart = fmMatch[0].length;
    const body = content.slice(bodyStart).replace(/^\r?\n/, '');
    const sections = parseSections(body);

    return { ok: true, data: { frontmatter, sections } };
  } catch (e: unknown) {
    // 兜底：任何未预期的异常都不抛出，返回错误结果
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `解析异常: ${msg}` };
  }
}

/**
 * 解析 Markdown 正文中的 ## 章节。
 * 返回 Record<标题, 内容>，内容不含标题行本身，首尾空白已修剪。
 */
function parseSections(body: string): Record<string, string> {
  const sections: Record<string, string> = {};
  // 按 ## 标题分割：找到所有 ## 标题的位置
  const regex = /^## (.+)$/gm;
  let match: RegExpExecArray | null;
  const headings: Array<{ title: string; contentStart: number; matchStart: number }> = [];

  while ((match = regex.exec(body)) !== null) {
    headings.push({
      title: match[1].trim(),
      contentStart: match.index + match[0].length,
      matchStart: match.index,
    });
  }

  for (let i = 0; i < headings.length; i++) {
    // 章节内容：从标题行末尾到下一个标题行开头（或文件末尾）
    const contentEnd = i + 1 < headings.length
      ? headings[i + 1].matchStart
      : body.length;
    const content = body.slice(headings[i].contentStart, contentEnd).trim();
    sections[headings[i].title] = content;
  }

  return sections;
}

/**
 * 将结构化对象格式化为符合 OpenClaw 规范的 SKILL.md 文本。
 *
 * 确保 `parseSkillMd(formatSkillMd(data))` 的往返一致性。
 * metadata 字段使用内联 JSON 格式输出（OpenClaw 约定）。
 */
export function formatSkillMd(data: SkillMdData): string {
  const lines: string[] = [];

  // 构建 frontmatter YAML
  lines.push('---');

  // name 和 description 始终输出（均使用 yamlScalar 确保 YAML 安全）
  lines.push(`name: ${yamlScalar(data.frontmatter.name)}`);
  lines.push(`description: ${yamlScalar(data.frontmatter.description)}`);

  // metadata 使用内联 JSON 格式（OpenClaw 约定）
  if (data.frontmatter.metadata !== undefined) {
    const jsonStr = JSON.stringify(data.frontmatter.metadata, null, 2);
    // 缩进 JSON 内容，使其在 YAML 中作为 metadata 字段的值
    const indented = jsonStr.split('\n').map((line, i) => i === 0 ? line : '  ' + line).join('\n');
    lines.push(`metadata:\n  ${indented}`);
  }

  // 可选的布尔/字符串字段
  if (data.frontmatter['user-invocable'] !== undefined) {
    lines.push(`user-invocable: ${data.frontmatter['user-invocable']}`);
  }
  if (data.frontmatter['disable-model-invocation'] !== undefined) {
    lines.push(`disable-model-invocation: ${data.frontmatter['disable-model-invocation']}`);
  }
  if (data.frontmatter['command-dispatch'] !== undefined) {
    lines.push(`command-dispatch: ${yamlScalar(data.frontmatter['command-dispatch'])}`);
  }
  if (data.frontmatter['command-tool'] !== undefined) {
    lines.push(`command-tool: ${yamlScalar(data.frontmatter['command-tool'])}`);
  }
  if (data.frontmatter['command-arg-mode'] !== undefined) {
    lines.push(`command-arg-mode: ${yamlScalar(data.frontmatter['command-arg-mode'])}`);
  }

  lines.push('---');

  // 输出 Markdown 章节
  const sectionKeys = Object.keys(data.sections);
  if (sectionKeys.length > 0) {
    lines.push(''); // frontmatter 与正文之间空一行
    for (let i = 0; i < sectionKeys.length; i++) {
      const title = sectionKeys[i];
      const content = data.sections[title];
      lines.push(`## ${title}`);
      lines.push('');
      lines.push(content);
      // 章节之间空一行
      if (i < sectionKeys.length - 1) {
        lines.push('');
      }
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * 将字符串转为安全的 YAML 标量值。
 * 包含特殊字符时使用双引号包裹，否则直接输出。
 */
function yamlScalar(value: string): string {
  // 需要引号的情况：
  // 1. 空字符串
  // 2. 包含 YAML 特殊字符（冒号、井号、引号、换行等）
  // 3. 前后有空白
  // 4. YAML 保留字面量（true/false/null/yes/no）
  // 5. 以数字开头（可能被解析为数值）
  // 6. 以 YAML 指示符开头（-、.、~）或仅由这些字符组成，避免被误解析
  if (
    value === '' ||
    /[:#\n\r"'{}[\],&*?|><!%@`]/.test(value) ||
    value !== value.trim() ||
    value === 'true' || value === 'false' ||
    value === 'null' || value === 'yes' || value === 'no' ||
    value === '~' ||
    /^\d/.test(value) ||
    /^[-.]/.test(value)
  ) {
    // 使用双引号，转义内部双引号和反斜杠
    const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
  }
  return value;
}

// ── ANSI 清理 ─────────────────────────────────────────────────────────────────

/**
 * 去除字符串中的所有 ANSI 转义序列。
 * 覆盖 CSI 序列（颜色/光标等）、OSC 序列（终端标题等）、
 * 以及其他常见的 ESC 控制序列。
 */
export function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1B(?:\[[0-9;]*[A-Za-z]|\].*?(?:\x07|\x1B\\)|\[[\?]?[0-9;]*[hl]|[()][AB012]|[=>NOM78H])/g, '');
}

// ── 分类推断 ──────────────────────────────────────────────────────────────────

/**
 * 根据技能名称和描述推断分类。
 * 按优先级匹配关键词，返回对应分类字符串。
 * 可能的分类：feishu, development, productivity, ai, security,
 *             automation, monitoring, communication, media, tools
 */
export function inferSkillCategory(name: string, description: string): string {
  const nameLower = name.toLowerCase();
  const descLower = description.toLowerCase();

  // 飞书/Lark 相关
  if (nameLower.includes('feishu') || descLower.includes('飞书') || descLower.includes('lark')) {
    return 'feishu';
  }
  // 开发工具
  if (descLower.includes('github') || nameLower.includes('gh')) {
    return 'development';
  }
  // 生产力工具（日程/会议）
  if (descLower.includes('calendar') || descLower.includes('日程') || descLower.includes('会议')) {
    return 'productivity';
  }
  // 生产力工具（任务/待办）
  if (descLower.includes('task') || descLower.includes('任务') || descLower.includes('待办')) {
    return 'productivity';
  }
  // 生产力工具（笔记/文档）
  if (descLower.includes('note') || descLower.includes('笔记') || descLower.includes('文档')) {
    return 'productivity';
  }
  // AI/模型
  if (descLower.includes('ai') || descLower.includes('模型') || descLower.includes('llm')) {
    return 'ai';
  }
  // 安全
  if (descLower.includes('security') || descLower.includes('安全') || descLower.includes('加密')) {
    return 'security';
  }
  // 自动化
  if (descLower.includes('automation') || descLower.includes('自动化')) {
    return 'automation';
  }
  // 监控
  if (descLower.includes('monitor') || descLower.includes('监控')) {
    return 'monitoring';
  }
  // 通信/聊天
  if (descLower.includes('message') || descLower.includes('聊天') || descLower.includes('im')) {
    return 'communication';
  }
  // 媒体（音频/播放）
  if (descLower.includes('music') || descLower.includes('音频') || descLower.includes('播放')) {
    return 'media';
  }
  // 媒体（图片/视频）
  if (descLower.includes('image') || descLower.includes('图片') || descLower.includes('视频')) {
    return 'media';
  }

  // 默认分类
  return 'tools';
}

// ── 合并搜索结果类型 ─────────────────────────────────────────────────────────

/** 合并后的技能信息，包含搜索结果字段和安装状态标识 */
export interface MergedSkillInfo {
  id: string;
  name: string;
  description: string;
  /** 是否已在本地安装 */
  installed: boolean;
  [key: string]: unknown;
}

// ── 磁盘缓存管理器 ───────────────────────────────────────────────────────────

/** 磁盘缓存条目，包含数据和写入时间戳 */
interface DiskCacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * 技能列表磁盘缓存管理器。
 *
 * 对 readInstalledSkillsFromDisk() 的结果进行内存缓存，
 * 避免在短时间内重复执行磁盘 I/O。
 * 默认 TTL 为 30 秒，可通过构造函数参数自定义。
 */
export class SkillsDiskCache {
  /** 缓存条目 */
  private cache: DiskCacheEntry<unknown> | null = null;
  /** 缓存有效期（毫秒） */
  private readonly ttlMs: number;
  /** 获取当前时间的函数，便于测试注入 */
  private readonly nowFn: () => number;

  /**
   * @param ttlMs 缓存有效期，默认 30000 毫秒（30 秒）
   * @param nowFn 获取当前时间戳的函数，默认 Date.now，测试时可注入
   */
  constructor(ttlMs: number = 30_000, nowFn: () => number = Date.now) {
    this.ttlMs = ttlMs;
    this.nowFn = nowFn;
  }

  /**
   * 获取缓存数据。
   * 若缓存存在且未过期则返回数据，否则返回 null。
   */
  get<T = unknown>(): T | null {
    if (!this.cache) return null;
    if (this.nowFn() - this.cache.timestamp > this.ttlMs) {
      // 缓存已过期，清除并返回 null
      this.cache = null;
      return null;
    }
    return this.cache.data as T;
  }

  /**
   * 写入缓存数据，记录当前时间戳。
   */
  set(data: unknown): void {
    this.cache = { data, timestamp: this.nowFn() };
  }

  /**
   * 立即清除缓存。
   */
  invalidate(): void {
    this.cache = null;
  }
}

// ── 缺失依赖计算 ─────────────────────────────────────────────────────────────

/**
 * 计算缺失的依赖项。
 *
 * 将 requires 中声明的 bins/env/config 与 actualConfig 中实际可用的项进行比对，
 * 返回缺失项数组，每项以类型前缀标识（如 "bin:python3"、"env:API_KEY"、"config:browser.enabled"）。
 *
 * @param requires 技能声明的依赖需求
 * @param actualConfig 实际可用的配置/环境
 * @returns 缺失项数组，格式为 "type:name"
 */
export function computeMissingRequirements(
  requires: { bins?: string[]; env?: string[]; config?: string[] },
  actualConfig: { bins?: string[]; env?: string[]; config?: string[] },
): string[] {
  const missing: string[] = [];

  // 检查缺失的二进制依赖
  const actualBins = new Set(actualConfig.bins ?? []);
  for (const bin of requires.bins ?? []) {
    if (!actualBins.has(bin)) {
      missing.push(`bin:${bin}`);
    }
  }

  // 检查缺失的环境变量
  const actualEnv = new Set(actualConfig.env ?? []);
  for (const env of requires.env ?? []) {
    if (!actualEnv.has(env)) {
      missing.push(`env:${env}`);
    }
  }

  // 检查缺失的配置项
  const actualCfg = new Set(actualConfig.config ?? []);
  for (const cfg of requires.config ?? []) {
    if (!actualCfg.has(cfg)) {
      missing.push(`config:${cfg}`);
    }
  }

  return missing;
}

// ── 搜索结果合并 ─────────────────────────────────────────────────────────────

/**
 * 合并本地已安装技能列表和搜索结果。
 *
 * 遍历搜索结果，若其 id 匹配本地已安装技能的 id，则标记 installed 为 true。
 *
 * @param localSkills 本地已安装技能列表
 * @param searchResults 搜索结果列表
 * @returns 合并后的技能信息数组，每项包含 installed 标识
 */
export function mergeSearchResults(
  localSkills: Array<{ id: string; name: string }>,
  searchResults: Array<{ id: string; name: string; description: string; [key: string]: unknown }>,
): MergedSkillInfo[] {
  const installedIds = new Set(localSkills.map((s) => s.id));

  return searchResults.map((result) => ({
    ...result,
    installed: installedIds.has(result.id),
  }));
}

// ── 技能可修改性检查 ─────────────────────────────────────────────────────────

/**
 * 判断技能是否可编辑/删除。
 * 仅 source 为 'custom' 的技能允许修改操作。
 */
export function canModifySkill(skill: { source: string }): boolean {
  return skill.source === 'custom';
}

// ── 防抖通知器 ───────────────────────────────────────────────────────────────

/**
 * 创建防抖通知器。
 *
 * 调用 notify() 会重置计时器；在 delayMs 毫秒内无新的 notify() 调用后，
 * 触发一次 callback。调用 cancel() 可取消待执行的回调。
 *
 * @param delayMs 防抖延迟（毫秒）
 * @param callback 防抖结束后执行的回调函数
 * @returns 包含 notify() 和 cancel() 方法的对象
 */
export function createDebouncedNotifier(
  delayMs: number,
  callback: () => void,
): { notify(): void; cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    /** 触发通知，重置防抖计时器 */
    notify(): void {
      if (timer !== null) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = null;
        callback();
      }, delayMs);
    },
    /** 取消待执行的回调 */
    cancel(): void {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
