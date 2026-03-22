/**
 * 单元测试：skillsLogic.ts 纯逻辑模块
 *
 * 验证类型定义和核心纯函数的行为：
 * - toKebabCase：任意字符串转 kebab-case
 * - isValidSkillName：kebab-case 格式验证
 * - stripAnsi：ANSI 转义序列清理
 * - inferSkillCategory：技能分类推断
 * - parseSkillMd：SKILL.md 解析
 * - formatSkillMd：SKILL.md 格式化
 */

import { describe, test, expect } from 'vitest';
import {
  toKebabCase,
  isValidSkillName,
  stripAnsi,
  inferSkillCategory,
  parseSkillMd,
  formatSkillMd,
  type SkillMdData,
} from '../skillsLogic';

// ── toKebabCase ─────────────────────────────────────────────────────────────

describe('toKebabCase', () => {
  test('普通英文字符串转换为小写连字符格式', () => {
    expect(toKebabCase('Hello World')).toBe('hello-world');
  });

  test('大写字母转为小写', () => {
    expect(toKebabCase('MySkillName')).toBe('myskillname');
  });

  test('特殊字符替换为连字符', () => {
    expect(toKebabCase('my_skill@name!')).toBe('my-skill-name');
  });

  test('连续特殊字符合并为单个连字符', () => {
    expect(toKebabCase('a---b___c')).toBe('a-b-c');
  });

  test('去除首尾连字符', () => {
    expect(toKebabCase('--hello--')).toBe('hello');
  });

  test('空字符串返回兜底值 skill', () => {
    expect(toKebabCase('')).toBe('skill');
  });

  test('纯特殊字符返回兜底值 skill', () => {
    expect(toKebabCase('---')).toBe('skill');
    expect(toKebabCase('!@#$%')).toBe('skill');
  });

  test('中文字符被移除', () => {
    expect(toKebabCase('我的技能')).toBe('skill');
  });

  test('混合中英文保留英文部分', () => {
    expect(toKebabCase('my技能name')).toBe('my-name');
  });

  test('数字保留', () => {
    expect(toKebabCase('skill123')).toBe('skill123');
    expect(toKebabCase('123skill')).toBe('123skill');
  });

  test('已经是 kebab-case 的字符串保持不变', () => {
    expect(toKebabCase('my-skill-name')).toBe('my-skill-name');
  });
});

// ── isValidSkillName ────────────────────────────────────────────────────────

describe('isValidSkillName', () => {
  test('有效的 kebab-case 名称返回 true', () => {
    expect(isValidSkillName('my-skill')).toBe(true);
    expect(isValidSkillName('skill')).toBe(true);
    expect(isValidSkillName('a')).toBe(true);
    expect(isValidSkillName('skill123')).toBe(true);
    expect(isValidSkillName('my-cool-skill')).toBe(true);
    expect(isValidSkillName('a1-b2-c3')).toBe(true);
  });

  test('包含大写字母返回 false', () => {
    expect(isValidSkillName('MySkill')).toBe(false);
  });

  test('包含下划线返回 false', () => {
    expect(isValidSkillName('my_skill')).toBe(false);
  });

  test('以连字符开头返回 false', () => {
    expect(isValidSkillName('-skill')).toBe(false);
  });

  test('以连字符结尾返回 false', () => {
    expect(isValidSkillName('skill-')).toBe(false);
  });

  test('包含连续连字符返回 false', () => {
    expect(isValidSkillName('my--skill')).toBe(false);
  });

  test('空字符串返回 false', () => {
    expect(isValidSkillName('')).toBe(false);
  });

  test('包含空格返回 false', () => {
    expect(isValidSkillName('my skill')).toBe(false);
  });
});

// ── stripAnsi ───────────────────────────────────────────────────────────────

describe('stripAnsi', () => {
  test('去除颜色控制码', () => {
    expect(stripAnsi('\u001b[31mred text\u001b[0m')).toBe('red text');
  });

  test('去除多个 ANSI 序列', () => {
    expect(stripAnsi('\u001b[1m\u001b[32mgreen bold\u001b[0m')).toBe('green bold');
  });

  test('无 ANSI 序列的字符串保持不变', () => {
    expect(stripAnsi('plain text')).toBe('plain text');
  });

  test('空字符串返回空字符串', () => {
    expect(stripAnsi('')).toBe('');
  });

  test('去除 \\x1B 格式的 ANSI 序列', () => {
    expect(stripAnsi('\x1B[33myellow\x1B[0m')).toBe('yellow');
  });

  test('去除复合参数的 ANSI 序列', () => {
    expect(stripAnsi('\u001b[1;31;42mstyle\u001b[0m')).toBe('style');
  });
});

// ── inferSkillCategory ──────────────────────────────────────────────────────

describe('inferSkillCategory', () => {
  test('名称包含 feishu 返回 feishu', () => {
    expect(inferSkillCategory('feishu-bot', '')).toBe('feishu');
  });

  test('描述包含飞书返回 feishu', () => {
    expect(inferSkillCategory('bot', '飞书机器人')).toBe('feishu');
  });

  test('描述包含 lark 返回 feishu', () => {
    expect(inferSkillCategory('bot', 'Lark integration')).toBe('feishu');
  });

  test('描述包含 github 返回 development', () => {
    expect(inferSkillCategory('pr-review', 'GitHub PR review')).toBe('development');
  });

  test('名称包含 gh 返回 development', () => {
    expect(inferSkillCategory('gh-issues', '')).toBe('development');
  });

  test('描述包含 calendar 返回 productivity', () => {
    expect(inferSkillCategory('cal', 'Calendar management')).toBe('productivity');
  });

  test('描述包含任务返回 productivity', () => {
    expect(inferSkillCategory('todo', '任务管理')).toBe('productivity');
  });

  test('描述包含笔记返回 productivity', () => {
    expect(inferSkillCategory('notes', '笔记工具')).toBe('productivity');
  });

  test('描述包含 ai 返回 ai', () => {
    expect(inferSkillCategory('model', 'AI assistant')).toBe('ai');
  });

  test('描述包含 llm 返回 ai', () => {
    expect(inferSkillCategory('chat', 'LLM wrapper')).toBe('ai');
  });

  test('描述包含 security 返回 security', () => {
    expect(inferSkillCategory('vault', 'Security scanner')).toBe('security');
  });

  test('描述包含加密返回 security', () => {
    expect(inferSkillCategory('enc', '加密工具')).toBe('security');
  });

  test('描述包含 automation 返回 automation', () => {
    expect(inferSkillCategory('auto', 'Automation tool')).toBe('automation');
  });

  test('描述包含监控返回 monitoring', () => {
    expect(inferSkillCategory('watch', '监控服务')).toBe('monitoring');
  });

  test('描述包含聊天返回 communication', () => {
    expect(inferSkillCategory('chat', '聊天机器人')).toBe('communication');
  });

  test('描述包含 music 返回 media', () => {
    expect(inferSkillCategory('player', 'Music player')).toBe('media');
  });

  test('描述包含图片返回 media', () => {
    expect(inferSkillCategory('img', '图片处理')).toBe('media');
  });

  test('无匹配关键词返回 tools', () => {
    expect(inferSkillCategory('my-skill', 'A generic skill')).toBe('tools');
  });

  test('空名称和描述返回 tools', () => {
    expect(inferSkillCategory('', '')).toBe('tools');
  });
});


// ── parseSkillMd ────────────────────────────────────────────────────────────

describe('parseSkillMd', () => {
  test('解析包含完整 frontmatter 和章节的 SKILL.md', () => {
    const content = `---
name: my-skill
description: "一句话描述技能功能"
metadata:
  {
    "openclaw": {
      "emoji": "🔧",
      "homepage": "https://example.com",
      "requires": {
        "bins": ["python3"],
        "env": ["API_KEY"],
        "config": ["browser.enabled"]
      },
      "primaryEnv": "API_KEY"
    }
  }
user-invocable: true
---

## Instructions

当用户要求执行任务时，执行以下步骤：

1. 第一步
2. 第二步

## Rules

- 执行前必须确认操作
`;
    const result = parseSkillMd(content);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.frontmatter.name).toBe('my-skill');
    expect(result.data.frontmatter.description).toBe('一句话描述技能功能');
    expect(result.data.frontmatter.metadata?.openclaw?.emoji).toBe('🔧');
    expect(result.data.frontmatter.metadata?.openclaw?.requires?.bins).toEqual(['python3']);
    expect(result.data.frontmatter.metadata?.openclaw?.requires?.env).toEqual(['API_KEY']);
    expect(result.data.frontmatter.metadata?.openclaw?.primaryEnv).toBe('API_KEY');
    expect(result.data.frontmatter['user-invocable']).toBe(true);
    expect(result.data.sections['Instructions']).toContain('第一步');
    expect(result.data.sections['Rules']).toContain('执行前必须确认操作');
  });

  test('缺少 frontmatter 分隔符返回错误', () => {
    const result = parseSkillMd('no frontmatter here');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('frontmatter');
  });

  test('YAML 语法错误返回错误而非抛出异常', () => {
    const content = `---
name: test
description: "desc"
bad_yaml: [unclosed
---

## Instructions

content
`;
    const result = parseSkillMd(content);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('YAML');
  });

  test('缺少 name 字段返回错误', () => {
    const content = `---
description: "desc"
---
`;
    const result = parseSkillMd(content);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('name');
  });

  test('缺少 description 字段返回错误', () => {
    const content = `---
name: test
---
`;
    const result = parseSkillMd(content);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('description');
  });

  test('无章节的 SKILL.md 解析成功，sections 为空', () => {
    const content = `---
name: minimal
description: "minimal skill"
---
`;
    const result = parseSkillMd(content);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.data.sections)).toHaveLength(0);
  });

  test('解析包含 install 安装器规格的 metadata', () => {
    const content = `---
name: brew-skill
description: "needs brew"
metadata:
  {
    "openclaw": {
      "install": [
        {
          "id": "brew",
          "kind": "brew",
          "formula": "my-tool",
          "bins": ["my-tool"],
          "label": "Install via Homebrew"
        }
      ]
    }
  }
---

## Instructions

安装后使用
`;
    const result = parseSkillMd(content);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const install = result.data.frontmatter.metadata?.openclaw?.install;
    expect(install).toHaveLength(1);
    expect(install?.[0].id).toBe('brew');
    expect(install?.[0].formula).toBe('my-tool');
  });
});

// ── formatSkillMd ───────────────────────────────────────────────────────────

describe('formatSkillMd', () => {
  test('格式化最小 SkillMdData', () => {
    const data: SkillMdData = {
      frontmatter: { name: 'test', description: 'A test skill' },
      sections: {},
    };
    const output = formatSkillMd(data);
    expect(output).toContain('---');
    expect(output).toContain('name: test');
    expect(output).toContain('description: A test skill');
  });

  test('格式化包含 metadata 的 SkillMdData', () => {
    const data: SkillMdData = {
      frontmatter: {
        name: 'my-skill',
        description: '技能描述',
        metadata: {
          openclaw: {
            emoji: '🔧',
            requires: { bins: ['python3'] },
          },
        },
      },
      sections: { Instructions: '执行步骤' },
    };
    const output = formatSkillMd(data);
    expect(output).toContain('metadata:');
    expect(output).toContain('"emoji": "🔧"');
    expect(output).toContain('## Instructions');
    expect(output).toContain('执行步骤');
  });

  test('格式化包含可选字段的 SkillMdData', () => {
    const data: SkillMdData = {
      frontmatter: {
        name: 'cmd-skill',
        description: 'command skill',
        'user-invocable': false,
        'command-dispatch': 'tool',
        'command-tool': 'my-tool',
      },
      sections: {},
    };
    const output = formatSkillMd(data);
    expect(output).toContain('user-invocable: false');
    expect(output).toContain('command-dispatch: tool');
    expect(output).toContain('command-tool: my-tool');
  });
});

// ── 往返一致性 ──────────────────────────────────────────────────────────────

describe('parseSkillMd ↔ formatSkillMd 往返一致性', () => {
  test('基本往返：format → parse 产生等价对象', () => {
    const data: SkillMdData = {
      frontmatter: {
        name: 'round-trip',
        description: '往返测试',
        metadata: {
          openclaw: {
            emoji: '🎯',
            homepage: 'https://example.com',
            requires: { bins: ['node'], env: ['TOKEN'], config: ['x.y'] },
            primaryEnv: 'TOKEN',
          },
        },
        'user-invocable': true,
      },
      sections: {
        Instructions: '1. 第一步\n2. 第二步',
        Rules: '- 规则一\n- 规则二',
      },
    };

    const formatted = formatSkillMd(data);
    const parsed = parseSkillMd(formatted);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    // frontmatter 字段一致
    expect(parsed.data.frontmatter.name).toBe(data.frontmatter.name);
    expect(parsed.data.frontmatter.description).toBe(data.frontmatter.description);
    expect(parsed.data.frontmatter['user-invocable']).toBe(data.frontmatter['user-invocable']);
    expect(parsed.data.frontmatter.metadata).toEqual(data.frontmatter.metadata);

    // 章节内容一致
    expect(parsed.data.sections['Instructions']).toBe(data.sections['Instructions']);
    expect(parsed.data.sections['Rules']).toBe(data.sections['Rules']);
  });

  test('包含 install 安装器的往返一致性', () => {
    const data: SkillMdData = {
      frontmatter: {
        name: 'install-test',
        description: '安装器测试',
        metadata: {
          openclaw: {
            install: [
              { id: 'brew', kind: 'brew', formula: 'tool', bins: ['tool'], label: 'Homebrew' },
            ],
          },
        },
      },
      sections: { Instructions: '安装后使用' },
    };

    const formatted = formatSkillMd(data);
    const parsed = parseSkillMd(formatted);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.frontmatter.metadata).toEqual(data.frontmatter.metadata);
  });
});

// ── 导入任务 1.3 新增的函数和类型 ──────────────────────────────────────────────

import {
  SkillsDiskCache,
  computeMissingRequirements,
  mergeSearchResults,
  canModifySkill,
  createDebouncedNotifier,
  type MergedSkillInfo,
} from '../skillsLogic';

// ── SkillsDiskCache ─────────────────────────────────────────────────────────

describe('SkillsDiskCache', () => {
  test('set 后 get 在 TTL 内返回缓存数据', () => {
    let now = 1000;
    const cache = new SkillsDiskCache(30_000, () => now);

    const data = [{ id: 'a', name: 'Skill A' }];
    cache.set(data);

    // 时间前进 10 秒，仍在 TTL 内
    now = 11_000;
    expect(cache.get()).toEqual(data);
  });

  test('get 在 TTL 过期后返回 null', () => {
    let now = 1000;
    const cache = new SkillsDiskCache(30_000, () => now);

    cache.set([{ id: 'a' }]);

    // 时间前进 31 秒，超过 TTL
    now = 32_000;
    expect(cache.get()).toBeNull();
  });

  test('get 在 TTL 恰好等于时返回 null（边界条件）', () => {
    let now = 0;
    const cache = new SkillsDiskCache(30_000, () => now);

    cache.set('data');

    // 恰好 30001 毫秒后（> TTL）
    now = 30_001;
    expect(cache.get()).toBeNull();
  });

  test('invalidate 后 get 立即返回 null', () => {
    let now = 1000;
    const cache = new SkillsDiskCache(30_000, () => now);

    cache.set({ key: 'value' });
    cache.invalidate();

    expect(cache.get()).toBeNull();
  });

  test('未 set 时 get 返回 null', () => {
    const cache = new SkillsDiskCache();
    expect(cache.get()).toBeNull();
  });

  test('多次 set 覆盖旧数据', () => {
    let now = 0;
    const cache = new SkillsDiskCache(30_000, () => now);

    cache.set('first');
    now = 5_000;
    cache.set('second');

    expect(cache.get()).toBe('second');
  });

  test('自定义 TTL 生效', () => {
    let now = 0;
    const cache = new SkillsDiskCache(5_000, () => now);

    cache.set('data');

    // 5 秒内有效
    now = 4_999;
    expect(cache.get()).toBe('data');

    // 超过 5 秒过期
    now = 5_001;
    expect(cache.get()).toBeNull();
  });

  test('invalidate 后重新 set 可正常使用', () => {
    let now = 0;
    const cache = new SkillsDiskCache(30_000, () => now);

    cache.set('old');
    cache.invalidate();
    cache.set('new');

    expect(cache.get()).toBe('new');
  });
});

// ── computeMissingRequirements ──────────────────────────────────────────────

describe('computeMissingRequirements', () => {
  test('所有依赖都满足时返回空数组', () => {
    const requires = { bins: ['node'], env: ['TOKEN'], config: ['x.y'] };
    const actual = { bins: ['node'], env: ['TOKEN'], config: ['x.y'] };
    expect(computeMissingRequirements(requires, actual)).toEqual([]);
  });

  test('缺失 bins 项正确标识', () => {
    const requires = { bins: ['python3', 'node'] };
    const actual = { bins: ['node'] };
    expect(computeMissingRequirements(requires, actual)).toEqual(['bin:python3']);
  });

  test('缺失 env 项正确标识', () => {
    const requires = { env: ['API_KEY', 'SECRET'] };
    const actual = { env: ['API_KEY'] };
    expect(computeMissingRequirements(requires, actual)).toEqual(['env:SECRET']);
  });

  test('缺失 config 项正确标识', () => {
    const requires = { config: ['browser.enabled', 'proxy.url'] };
    const actual = { config: ['browser.enabled'] };
    expect(computeMissingRequirements(requires, actual)).toEqual(['config:proxy.url']);
  });

  test('多种类型同时缺失', () => {
    const requires = { bins: ['python3'], env: ['KEY'], config: ['x'] };
    const actual = { bins: [], env: [], config: [] };
    const missing = computeMissingRequirements(requires, actual);
    expect(missing).toEqual(['bin:python3', 'env:KEY', 'config:x']);
  });

  test('requires 为空对象时返回空数组', () => {
    expect(computeMissingRequirements({}, {})).toEqual([]);
  });

  test('actualConfig 为空对象时所有 requires 项均缺失', () => {
    const requires = { bins: ['a'], env: ['B'], config: ['c'] };
    const missing = computeMissingRequirements(requires, {});
    expect(missing).toEqual(['bin:a', 'env:B', 'config:c']);
  });

  test('actualConfig 有额外项不影响结果', () => {
    const requires = { bins: ['node'] };
    const actual = { bins: ['node', 'python3', 'go'] };
    expect(computeMissingRequirements(requires, actual)).toEqual([]);
  });
});

// ── mergeSearchResults ──────────────────────────────────────────────────────

describe('mergeSearchResults', () => {
  test('匹配的搜索结果标记为 installed: true', () => {
    const local = [{ id: 'skill-a', name: 'Skill A' }];
    const search = [
      { id: 'skill-a', name: 'Skill A', description: 'desc A' },
      { id: 'skill-b', name: 'Skill B', description: 'desc B' },
    ];
    const merged = mergeSearchResults(local, search);

    expect(merged).toHaveLength(2);
    expect(merged[0].installed).toBe(true);
    expect(merged[1].installed).toBe(false);
  });

  test('本地列表为空时所有结果标记为 installed: false', () => {
    const search = [
      { id: 'x', name: 'X', description: 'desc' },
    ];
    const merged = mergeSearchResults([], search);
    expect(merged[0].installed).toBe(false);
  });

  test('搜索结果为空时返回空数组', () => {
    const local = [{ id: 'a', name: 'A' }];
    const merged = mergeSearchResults(local, []);
    expect(merged).toEqual([]);
  });

  test('保留搜索结果中的额外字段', () => {
    const local = [{ id: 'a', name: 'A' }];
    const search = [
      { id: 'a', name: 'A', description: 'desc', rating: 4.5, downloads: 100 },
    ];
    const merged = mergeSearchResults(local, search);
    expect(merged[0].rating).toBe(4.5);
    expect(merged[0].downloads).toBe(100);
    expect(merged[0].installed).toBe(true);
  });

  test('多个本地技能匹配多个搜索结果', () => {
    const local = [
      { id: 'a', name: 'A' },
      { id: 'c', name: 'C' },
    ];
    const search = [
      { id: 'a', name: 'A', description: 'da' },
      { id: 'b', name: 'B', description: 'db' },
      { id: 'c', name: 'C', description: 'dc' },
    ];
    const merged = mergeSearchResults(local, search);
    expect(merged.map((m) => m.installed)).toEqual([true, false, true]);
  });
});

// ── canModifySkill ──────────────────────────────────────────────────────────

describe('canModifySkill', () => {
  test('source 为 custom 返回 true', () => {
    expect(canModifySkill({ source: 'custom' })).toBe(true);
  });

  test('source 为 clawhub 返回 false', () => {
    expect(canModifySkill({ source: 'clawhub' })).toBe(false);
  });

  test('source 为 bundled 返回 false', () => {
    expect(canModifySkill({ source: 'bundled' })).toBe(false);
  });

  test('source 为 plugin 返回 false', () => {
    expect(canModifySkill({ source: 'plugin' })).toBe(false);
  });

  test('source 为空字符串返回 false', () => {
    expect(canModifySkill({ source: '' })).toBe(false);
  });

  test('source 为任意其他值返回 false', () => {
    expect(canModifySkill({ source: 'unknown' })).toBe(false);
  });
});

// ── createDebouncedNotifier ─────────────────────────────────────────────────

describe('createDebouncedNotifier', () => {
  test('notify 后延迟触发回调', async () => {
    let called = 0;
    const notifier = createDebouncedNotifier(50, () => { called++; });

    notifier.notify();

    // 回调尚未触发
    expect(called).toBe(0);

    // 等待防抖延迟结束
    await new Promise((r) => setTimeout(r, 80));
    expect(called).toBe(1);

    notifier.cancel(); // 清理
  });

  test('多次 notify 只触发一次回调（防抖）', async () => {
    let called = 0;
    const notifier = createDebouncedNotifier(50, () => { called++; });

    notifier.notify();
    notifier.notify();
    notifier.notify();

    await new Promise((r) => setTimeout(r, 80));
    expect(called).toBe(1);

    notifier.cancel();
  });

  test('cancel 取消待执行的回调', async () => {
    let called = 0;
    const notifier = createDebouncedNotifier(50, () => { called++; });

    notifier.notify();
    notifier.cancel();

    await new Promise((r) => setTimeout(r, 80));
    expect(called).toBe(0);
  });

  test('cancel 后重新 notify 可正常触发', async () => {
    let called = 0;
    const notifier = createDebouncedNotifier(50, () => { called++; });

    notifier.notify();
    notifier.cancel();
    notifier.notify();

    await new Promise((r) => setTimeout(r, 80));
    expect(called).toBe(1);

    notifier.cancel();
  });

  test('连续快速 notify 重置计时器', async () => {
    let called = 0;
    const notifier = createDebouncedNotifier(100, () => { called++; });

    notifier.notify();
    await new Promise((r) => setTimeout(r, 60));
    // 60ms 后再次 notify，重置计时器
    notifier.notify();
    await new Promise((r) => setTimeout(r, 60));
    // 此时距第二次 notify 仅 60ms，回调不应触发
    expect(called).toBe(0);

    await new Promise((r) => setTimeout(r, 60));
    // 距第二次 notify 已 120ms > 100ms，回调应已触发
    expect(called).toBe(1);

    notifier.cancel();
  });
});
