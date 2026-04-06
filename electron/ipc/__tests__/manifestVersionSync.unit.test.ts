/**
 * 单元测试：OpenClaw 版本同步（3.24 → 4.5）Manifest 验证
 * Feature: openclaw-version-sync
 *
 * 针对具体场景和边界条件进行单元测试，覆盖：
 * - 5.1: manifest 结构和版本验证
 * - 5.2: 新增 section/field/command 验证
 * - 5.3: 废弃项移除和 Breaking Changes 验证
 */

import { describe, test, expect } from 'vitest';
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

// ── 辅助：按 id 查找 section / field / command ─────────────────────

/** 按 id 查找 section */
const findSection = (id: string) =>
  manifest45.sections.find((s: { id: string }) => s.id === id);

/** 在指定 section 中按 id 查找 field */
const findField = (sectionId: string, fieldId: string) => {
  const section = findSection(sectionId);
  return section?.fields?.find((f: { id: string }) => f.id === fieldId);
};

/** 在指定 section 中按 id 查找 command */
const findCommand = (sectionId: string, commandId: string) => {
  const section = findSection(sectionId);
  return section?.commands?.find((c: { id: string }) => c.id === commandId);
};


// ============================================================
// 5.1: manifest 结构和版本验证单元测试
// ============================================================

describe('5.1: manifest 结构和版本验证', () => {
  /**
   * Validates: Requirements 1.2, 14.1
   * 验证 4.5.json 顶层字段存在性
   */
  test('4.5.json 包含所有顶层必需字段', () => {
    expect(manifest45).toHaveProperty('manifestVersion');
    expect(manifest45).toHaveProperty('openclawVersionRange');
    expect(manifest45).toHaveProperty('capabilities');
    expect(manifest45).toHaveProperty('sections');
  });

  /**
   * Validates: Requirements 1.2
   * 验证 manifestVersion 值为 "4.5"
   */
  test('manifestVersion 为 "4.5"', () => {
    expect(manifest45.manifestVersion).toBe('4.5');
  });

  /**
   * Validates: Requirements 1.2
   * 验证 openclawVersionRange 值为 "4.5"
   */
  test('openclawVersionRange 为 "4.5"', () => {
    expect(manifest45.openclawVersionRange).toBe('4.5');
  });

  /**
   * Validates: Requirements 2.1
   * 验证 CURRENT_MANIFEST_VERSION 为 '4.5'
   */
  test('CURRENT_MANIFEST_VERSION 为 "4.5"', () => {
    expect(CURRENT_MANIFEST_VERSION).toBe('4.5');
  });

  /**
   * Validates: Requirements 2.2
   * 验证 SUPPORTED_MANIFEST_VERSIONS 包含 '4.5'
   */
  test('SUPPORTED_MANIFEST_VERSIONS 包含 "4.5"', () => {
    expect(SUPPORTED_MANIFEST_VERSIONS).toContain('4.5');
  });

  /**
   * Validates: Requirements 2.3
   * 验证 pickManifestVersion('4.5.0') 返回 '4.5'
   */
  test('pickManifestVersion("4.5.0") 返回 "4.5"', () => {
    expect(pickManifestVersion('4.5.0')).toBe('4.5');
  });

  /**
   * Validates: Requirements 2.3
   * 验证 pickManifestVersion('3.24.1') 返回 '3.24'
   */
  test('pickManifestVersion("3.24.1") 返回 "3.24"', () => {
    expect(pickManifestVersion('3.24.1')).toBe('3.24');
  });
});


// ============================================================
// 5.2: 新增 section/field/command 验证单元测试
// ============================================================

describe('5.2: 新增 section/field/command 验证', () => {
  // ── taskFlows section（需求 4.1-4.4）──────────────────────────

  describe('taskFlows section', () => {
    /**
     * Validates: Requirements 4.1
     */
    test('taskFlows section 存在', () => {
      expect(findSection('taskFlows')).toBeDefined();
    });

    /**
     * Validates: Requirements 4.2, 4.3, 4.4
     */
    test('taskFlows 包含 flowsList、flowsShow、flowsCancel 命令', () => {
      expect(findCommand('taskFlows', 'flowsList')).toBeDefined();
      expect(findCommand('taskFlows', 'flowsShow')).toBeDefined();
      expect(findCommand('taskFlows', 'flowsCancel')).toBeDefined();
    });
  });

  // ── modelAuth authChoice provider 选项（需求 3.1-3.7）─────────

  describe('modelAuth authChoice provider 选项', () => {
    const authChoiceField = () => findField('modelAuth', 'authChoice');
    const optionValues = () =>
      authChoiceField()?.options?.map((o: { value: string }) => o.value) ?? [];

    /**
     * Validates: Requirements 3.1
     */
    test('authChoice 包含 qwen-api-key', () => {
      expect(optionValues()).toContain('qwen-api-key');
    });

    /**
     * Validates: Requirements 3.2
     */
    test('authChoice 包含 fireworks-api-key', () => {
      expect(optionValues()).toContain('fireworks-api-key');
    });

    /**
     * Validates: Requirements 3.3
     */
    test('authChoice 包含 stepfun-api-key', () => {
      expect(optionValues()).toContain('stepfun-api-key');
    });

    /**
     * Validates: Requirements 3.4
     */
    test('authChoice 包含 bedrock-profile', () => {
      expect(optionValues()).toContain('bedrock-profile');
    });

    /**
     * Validates: Requirements 3.5
     */
    test('authChoice 包含 gemini-cli', () => {
      expect(optionValues()).toContain('gemini-cli');
    });

    /**
     * Validates: Requirements 3.6
     * 验证废弃的 qwen-portal-auth 不存在
     */
    test('authChoice 不包含 qwen-portal-auth', () => {
      expect(optionValues()).not.toContain('qwen-portal-auth');
    });
  });

  // ── modelAuth agentDefaultParams 字段（需求 3.7）──────────────

  describe('modelAuth agentDefaultParams', () => {
    /**
     * Validates: Requirements 3.7
     */
    test('agentDefaultParams 字段存在且类型为 text', () => {
      const field = findField('modelAuth', 'agentDefaultParams');
      expect(field).toBeDefined();
      expect(field.type).toBe('text');
    });
  });

  // ── gateway section 新增字段（需求 6.1-6.3）───────────────────

  describe('gateway section 新增字段', () => {
    /**
     * Validates: Requirements 6.1
     */
    test('webchatHistoryMaxChars 字段存在且类型为 number', () => {
      const field = findField('gateway', 'webchatHistoryMaxChars');
      expect(field).toBeDefined();
      expect(field.type).toBe('number');
    });

    /**
     * Validates: Requirements 6.2
     */
    test('authTrustedProxy 字段存在且类型为 text', () => {
      const field = findField('gateway', 'authTrustedProxy');
      expect(field).toBeDefined();
      expect(field.type).toBe('text');
    });

    /**
     * Validates: Requirements 6.3
     */
    test('authCooldownRateLimited 字段存在且类型为 number', () => {
      const field = findField('gateway', 'authCooldownRateLimited');
      expect(field).toBeDefined();
      expect(field.type).toBe('number');
    });
  });

  // ── channels section 新增字段和命令（需求 7.1-7.7）────────────

  describe('channels section 新增字段和命令', () => {
    /**
     * Validates: Requirements 7.2
     */
    test('contextVisibility 字段存在且类型为 select', () => {
      const field = findField('channels', 'contextVisibility');
      expect(field).toBeDefined();
      expect(field.type).toBe('select');
    });

    /**
     * Validates: Requirements 7.3
     */
    test('matrixHistoryLimit 字段存在且类型为 number', () => {
      const field = findField('channels', 'matrixHistoryLimit');
      expect(field).toBeDefined();
      expect(field.type).toBe('number');
    });

    /**
     * Validates: Requirements 7.6
     */
    test('telegramErrorPolicy 字段存在且类型为 select', () => {
      const field = findField('channels', 'telegramErrorPolicy');
      expect(field).toBeDefined();
      expect(field.type).toBe('select');
    });

    /**
     * Validates: Requirements 7.7
     */
    test('telegramErrorCooldownMs 字段存在且类型为 number', () => {
      const field = findField('channels', 'telegramErrorCooldownMs');
      expect(field).toBeDefined();
      expect(field.type).toBe('number');
    });

    /**
     * Validates: Requirements 7.1
     */
    test('channelsAddQQ 命令存在', () => {
      expect(findCommand('channels', 'channelsAddQQ')).toBeDefined();
    });
  });

  // ── skills section 新增命令（需求 8.1）────────────────────────

  describe('skills section 新增命令', () => {
    /**
     * Validates: Requirements 8.1
     */
    test('skillsInstallForce 命令存在', () => {
      expect(findCommand('skills', 'skillsInstallForce')).toBeDefined();
    });
  });

  // ── plugins section 新增字段和命令（需求 8.2-8.4）─────────────

  describe('plugins section 新增字段和命令', () => {
    /**
     * Validates: Requirements 8.2
     */
    test('pluginsInstallForce 命令存在', () => {
      expect(findCommand('plugins', 'pluginsInstallForce')).toBeDefined();
    });

    /**
     * Validates: Requirements 8.3
     */
    test('xaiConfig 字段存在', () => {
      expect(findField('plugins', 'xaiConfig')).toBeDefined();
    });

    /**
     * Validates: Requirements 8.4
     */
    test('firecrawlConfig 字段存在', () => {
      expect(findField('plugins', 'firecrawlConfig')).toBeDefined();
    });
  });

  // ── cron section 新增字段和命令（需求 9.1-9.2）────────────────

  describe('cron section 新增字段和命令', () => {
    /**
     * Validates: Requirements 9.1
     */
    test('cronTools 命令存在', () => {
      expect(findCommand('cron', 'cronTools')).toBeDefined();
    });

    /**
     * Validates: Requirements 9.2
     */
    test('cronToolsWhitelist 字段存在', () => {
      expect(findField('cron', 'cronToolsWhitelist')).toBeDefined();
    });
  });

  // ── agents section 新增字段和命令（需求 10.1-10.2）────────────

  describe('agents section 新增字段和命令', () => {
    /**
     * Validates: Requirements 10.1
     */
    test('agentDefaultsCompactionNotifyUser 字段存在', () => {
      expect(findField('agents', 'agentDefaultsCompactionNotifyUser')).toBeDefined();
    });

    /**
     * Validates: Requirements 10.2
     */
    test('agentContainer 命令存在', () => {
      expect(findCommand('agents', 'agentContainer')).toBeDefined();
    });
  });

  // ── memory section 新增字段和命令（需求 5.1-5.4）──────────────

  describe('memory section 新增字段和命令', () => {
    /**
     * Validates: Requirements 5.1
     */
    test('memoryRecencyHalfLifeDays 字段存在且类型为 number', () => {
      const field = findField('memory', 'memoryRecencyHalfLifeDays');
      expect(field).toBeDefined();
      expect(field.type).toBe('number');
    });

    /**
     * Validates: Requirements 5.2
     */
    test('memoryMaxAgeDays 字段存在且类型为 number', () => {
      const field = findField('memory', 'memoryMaxAgeDays');
      expect(field).toBeDefined();
      expect(field.type).toBe('number');
    });

    /**
     * Validates: Requirements 5.3
     */
    test('memoryRemHarness 命令存在', () => {
      expect(findCommand('memory', 'memoryRemHarness')).toBeDefined();
    });

    /**
     * Validates: Requirements 5.4
     */
    test('memoryPromoteExplain 命令存在', () => {
      expect(findCommand('memory', 'memoryPromoteExplain')).toBeDefined();
    });
  });

  // ── approvals section 新增命令（需求 11.1-11.2）───────────────

  describe('approvals section 新增命令', () => {
    /**
     * Validates: Requirements 11.1
     */
    test('approvalsMatrix 命令存在', () => {
      expect(findCommand('approvals', 'approvalsMatrix')).toBeDefined();
    });

    /**
     * Validates: Requirements 11.2
     */
    test('approvalsSlack 命令存在', () => {
      expect(findCommand('approvals', 'approvalsSlack')).toBeDefined();
    });
  });

  // ── message section 新增命令（需求 13.2）──────────────────────

  describe('message section 新增命令', () => {
    /**
     * Validates: Requirements 13.2
     */
    test('messageTasks 命令存在', () => {
      expect(findCommand('message', 'messageTasks')).toBeDefined();
    });
  });
});


// ============================================================
// 5.3: 废弃项移除和 Breaking Changes 验证单元测试
// ============================================================

describe('5.3: 废弃项移除和 Breaking Changes 验证', () => {
  /**
   * Validates: Requirements 12.2
   * 验证 legacyGatewayToken 不存在于 gateway section
   */
  test('gateway section 不包含 legacyGatewayToken 字段', () => {
    const field = findField('gateway', 'legacyGatewayToken');
    expect(field).toBeUndefined();
  });

  /**
   * Validates: Requirements 12.3
   * 验证 MiniMax provider 选项 label 包含 "M2.7"
   */
  test('MiniMax provider 选项 label 包含 "M2.7"', () => {
    const authChoice = findField('modelAuth', 'authChoice');
    const minimaxOption = authChoice?.options?.find(
      (o: { value: string }) => o.value === 'minimax-api',
    );
    expect(minimaxOption).toBeDefined();
    expect(minimaxOption.label).toContain('M2.7');
  });

  /**
   * Validates: Requirements 5.1, 5.2
   * 验证 memory section 包含 memoryRecencyHalfLifeDays 和 memoryMaxAgeDays 字段
   */
  test('memory section 包含 Dreaming 相关字段', () => {
    expect(findField('memory', 'memoryRecencyHalfLifeDays')).toBeDefined();
    expect(findField('memory', 'memoryMaxAgeDays')).toBeDefined();
  });

  /**
   * Validates: Requirements 5.3, 5.4
   * 验证 memory section 包含 memoryRemHarness 和 memoryPromoteExplain 命令
   */
  test('memory section 包含 Dreaming 相关命令', () => {
    expect(findCommand('memory', 'memoryRemHarness')).toBeDefined();
    expect(findCommand('memory', 'memoryPromoteExplain')).toBeDefined();
  });

  /**
   * Validates: Requirements 15.1
   * 验证 taskFlows section 的 description 包含中文字符（CJK 范围）
   */
  test('taskFlows section description 包含中文字符', () => {
    const section = findSection('taskFlows');
    expect(section).toBeDefined();
    // 匹配 CJK 统一汉字范围
    expect(section.description).toMatch(/[\u4e00-\u9fff]/);
  });
});
