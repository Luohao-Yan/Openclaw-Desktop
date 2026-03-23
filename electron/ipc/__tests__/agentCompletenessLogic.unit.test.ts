/**
 * 单元测试：Agent 配置完整性检查逻辑
 * Feature: main-agent-init-completeness
 *
 * 测试 checkAgentCompleteness、planAgentCompletenessRepair、
 * generateDefaultWorkspaceFileContent 和 validateAgentRename 的典型场景和边界情况。
 */

import { describe, test, expect } from 'vitest';
import { join } from 'path';
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

// ── 辅助工具 ──────────────────────────────────────────────────────

/** 创建基础 AgentInfo 对象 */
function makeAgentInfo(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id: 'test-agent',
    name: 'TestAgent',
    workspace: 'test-workspace',
    model: 'gpt-4',
    workspaceRoot: '/home/user/.openclaw/workspace-test',
    agentConfigRoot: '/home/user/.openclaw/agents/test/agent',
    ...overrides,
  };
}

/** 创建全部 present 的 CompletenessReport */
function makeAllPresentReport(): CompletenessReport {
  return {
    workspaceDir: 'present',
    workspaceFiles: Object.fromEntries(
      COMPLETENESS_WORKSPACE_FILES.map((f) => [f, 'present' as CheckStatus]),
    ),
    agentConfigDir: 'present',
    modelsJson: 'present',
  };
}

/** 创建全部 missing 的 CompletenessReport */
function makeAllMissingReport(): CompletenessReport {
  return {
    workspaceDir: 'missing',
    workspaceFiles: Object.fromEntries(
      COMPLETENESS_WORKSPACE_FILES.map((f) => [f, 'missing' as CheckStatus]),
    ),
    agentConfigDir: 'missing',
    modelsJson: 'missing',
  };
}

// ── checkAgentCompleteness 测试 ───────────────────────────────────

describe('checkAgentCompleteness', () => {
  test('所有文件存在时，报告全部为 present', () => {
    const agentInfo = makeAgentInfo();
    const existsFn: ExistsFn = () => true;

    const report = checkAgentCompleteness(agentInfo, existsFn);

    expect(report.workspaceDir).toBe('present');
    expect(report.agentConfigDir).toBe('present');
    expect(report.modelsJson).toBe('present');
    for (const file of COMPLETENESS_WORKSPACE_FILES) {
      expect(report.workspaceFiles[file]).toBe('present');
    }
  });

  test('所有文件不存在时，报告全部为 missing', () => {
    const agentInfo = makeAgentInfo();
    const existsFn: ExistsFn = () => false;

    const report = checkAgentCompleteness(agentInfo, existsFn);

    expect(report.workspaceDir).toBe('missing');
    expect(report.agentConfigDir).toBe('missing');
    expect(report.modelsJson).toBe('missing');
    for (const file of COMPLETENESS_WORKSPACE_FILES) {
      expect(report.workspaceFiles[file]).toBe('missing');
    }
  });

  test('部分文件存在时，报告正确反映混合状态', () => {
    const agentInfo = makeAgentInfo();
    // 仅 workspace 目录和 AGENTS.md 存在
    const existingPaths = new Set([
      agentInfo.workspaceRoot!,
      join(agentInfo.workspaceRoot!, 'AGENTS.md'),
      agentInfo.agentConfigRoot!,
    ]);
    const existsFn: ExistsFn = (path) => existingPaths.has(path);

    const report = checkAgentCompleteness(agentInfo, existsFn);

    expect(report.workspaceDir).toBe('present');
    expect(report.workspaceFiles['AGENTS.md']).toBe('present');
    expect(report.workspaceFiles['SOUL.md']).toBe('missing');
    expect(report.workspaceFiles['TOOLS.md']).toBe('missing');
    expect(report.agentConfigDir).toBe('present');
    expect(report.modelsJson).toBe('missing');
  });

  test('workspaceRoot 为 undefined 时，workspace 项全部为 missing', () => {
    const agentInfo = makeAgentInfo({ workspaceRoot: undefined });
    const existsFn: ExistsFn = () => true;

    const report = checkAgentCompleteness(agentInfo, existsFn);

    expect(report.workspaceDir).toBe('missing');
    for (const file of COMPLETENESS_WORKSPACE_FILES) {
      expect(report.workspaceFiles[file]).toBe('missing');
    }
    // agentConfigRoot 有值，应正常检查
    expect(report.agentConfigDir).toBe('present');
  });

  test('workspaceRoot 为空字符串时，workspace 项全部为 missing', () => {
    const agentInfo = makeAgentInfo({ workspaceRoot: '' });
    const existsFn: ExistsFn = () => true;

    const report = checkAgentCompleteness(agentInfo, existsFn);

    expect(report.workspaceDir).toBe('missing');
    for (const file of COMPLETENESS_WORKSPACE_FILES) {
      expect(report.workspaceFiles[file]).toBe('missing');
    }
  });

  test('agentConfigRoot 为 undefined 时，config 项全部为 missing', () => {
    const agentInfo = makeAgentInfo({ agentConfigRoot: undefined });
    const existsFn: ExistsFn = () => true;

    const report = checkAgentCompleteness(agentInfo, existsFn);

    expect(report.agentConfigDir).toBe('missing');
    expect(report.modelsJson).toBe('missing');
    // workspaceRoot 有值，应正常检查
    expect(report.workspaceDir).toBe('present');
  });

  test('agentConfigRoot 为空字符串时，config 项全部为 missing', () => {
    const agentInfo = makeAgentInfo({ agentConfigRoot: '' });
    const existsFn: ExistsFn = () => true;

    const report = checkAgentCompleteness(agentInfo, existsFn);

    expect(report.agentConfigDir).toBe('missing');
    expect(report.modelsJson).toBe('missing');
  });
});

// ── planAgentCompletenessRepair 测试 ──────────────────────────────

describe('planAgentCompletenessRepair', () => {
  test('全部 missing 时，修复计划包含所有目录和文件', () => {
    const agentInfo = makeAgentInfo();
    const report = makeAllMissingReport();

    const plan = planAgentCompletenessRepair(agentInfo, report);

    // 应包含 workspace 目录和 agentConfig 目录
    expect(plan.directoriesToCreate).toContain(agentInfo.workspaceRoot);
    expect(plan.directoriesToCreate).toContain(agentInfo.agentConfigRoot);
    expect(plan.directoriesToCreate).toHaveLength(2);

    // 应包含 7 个 workspace 文件 + 1 个 models.json = 8 个文件
    expect(plan.filesToWrite).toHaveLength(COMPLETENESS_WORKSPACE_FILES.length + 1);

    // 验证 models.json 在文件列表中
    const modelsJsonItem = plan.filesToWrite.find((f) => f.path.endsWith('models.json'));
    expect(modelsJsonItem).toBeDefined();
    expect(modelsJsonItem!.content).toContain('providers');
  });

  test('全部 present 时，修复计划为空', () => {
    const agentInfo = makeAgentInfo();
    const report = makeAllPresentReport();

    const plan = planAgentCompletenessRepair(agentInfo, report);

    expect(plan.directoriesToCreate).toHaveLength(0);
    expect(plan.filesToWrite).toHaveLength(0);
  });

  test('部分 missing 时，仅包含缺失项的修复动作', () => {
    const agentInfo = makeAgentInfo();
    const report = makeAllPresentReport();
    // 仅 SOUL.md 和 models.json 缺失
    report.workspaceFiles['SOUL.md'] = 'missing';
    report.modelsJson = 'missing';

    const plan = planAgentCompletenessRepair(agentInfo, report);

    expect(plan.directoriesToCreate).toHaveLength(0);
    expect(plan.filesToWrite).toHaveLength(2);

    const soulFile = plan.filesToWrite.find((f) => f.path.endsWith('SOUL.md'));
    expect(soulFile).toBeDefined();
    expect(soulFile!.content).toContain(agentInfo.name);

    const modelsFile = plan.filesToWrite.find((f) => f.path.endsWith('models.json'));
    expect(modelsFile).toBeDefined();
  });

  test('workspaceRoot 为空时，跳过 workspace 相关修复项', () => {
    const agentInfo = makeAgentInfo({ workspaceRoot: '' });
    const report = makeAllMissingReport();

    const plan = planAgentCompletenessRepair(agentInfo, report);

    // 不应包含 workspace 目录
    expect(plan.directoriesToCreate).not.toContain('');
    // 应仅包含 agentConfigRoot 目录
    expect(plan.directoriesToCreate).toContain(agentInfo.agentConfigRoot);
    expect(plan.directoriesToCreate).toHaveLength(1);

    // 不应包含 workspace 文件，仅包含 models.json
    expect(plan.filesToWrite).toHaveLength(1);
    expect(plan.filesToWrite[0].path).toContain('models.json');
  });

  test('agentConfigRoot 为空时，跳过 config 相关修复项', () => {
    const agentInfo = makeAgentInfo({ agentConfigRoot: '' });
    const report = makeAllMissingReport();

    const plan = planAgentCompletenessRepair(agentInfo, report);

    // 应仅包含 workspaceRoot 目录
    expect(plan.directoriesToCreate).toContain(agentInfo.workspaceRoot);
    expect(plan.directoriesToCreate).toHaveLength(1);

    // 不应包含 models.json，仅包含 workspace 文件
    expect(plan.filesToWrite).toHaveLength(COMPLETENESS_WORKSPACE_FILES.length);
    const modelsFile = plan.filesToWrite.find((f) => f.path.endsWith('models.json'));
    expect(modelsFile).toBeUndefined();
  });

  test('workspace 文件路径使用 path.join 正确拼接', () => {
    const agentInfo = makeAgentInfo({ workspaceRoot: '/test/workspace' });
    const report = makeAllMissingReport();

    const plan = planAgentCompletenessRepair(agentInfo, report);

    const agentsFile = plan.filesToWrite.find((f) => f.path.endsWith('AGENTS.md'));
    expect(agentsFile).toBeDefined();
    expect(agentsFile!.path).toBe(join('/test/workspace', 'AGENTS.md'));
  });
});


// ── generateDefaultWorkspaceFileContent 测试 ──────────────────────

describe('generateDefaultWorkspaceFileContent', () => {
  test('AGENTS.md 包含 agentName 和描述模板', () => {
    const content = generateDefaultWorkspaceFileContent('AGENTS.md', 'MyAgent');
    expect(content).toContain('MyAgent');
    expect(content).toContain('# MyAgent');
    expect(content.length).toBeGreaterThan(0);
  });

  test('SOUL.md 包含 agentName 和行为准则模板', () => {
    const content = generateDefaultWorkspaceFileContent('SOUL.md', 'MyAgent');
    expect(content).toContain('MyAgent');
    expect(content).toContain('行为准则');
  });

  test('TOOLS.md 包含 agentName 和工具配置模板', () => {
    const content = generateDefaultWorkspaceFileContent('TOOLS.md', 'MyAgent');
    expect(content).toContain('MyAgent');
    expect(content).toContain('工具配置');
  });

  test('BOOTSTRAP.md 包含 agentName 和启动配置模板', () => {
    const content = generateDefaultWorkspaceFileContent('BOOTSTRAP.md', 'MyAgent');
    expect(content).toContain('MyAgent');
    expect(content).toContain('启动配置');
  });

  test('HEARTBEAT.md 包含 agentName 和心跳配置模板', () => {
    const content = generateDefaultWorkspaceFileContent('HEARTBEAT.md', 'MyAgent');
    expect(content).toContain('MyAgent');
    expect(content).toContain('心跳配置');
  });

  test('IDENTITY.md 包含 agentName 和身份配置模板', () => {
    const content = generateDefaultWorkspaceFileContent('IDENTITY.md', 'MyAgent');
    expect(content).toContain('MyAgent');
    expect(content).toContain('身份配置');
  });

  test('USER.md 包含 agentName 和用户配置模板', () => {
    const content = generateDefaultWorkspaceFileContent('USER.md', 'MyAgent');
    expect(content).toContain('MyAgent');
    expect(content).toContain('用户配置');
  });

  test('未知文件名包含 fileName 和 agentName', () => {
    const content = generateDefaultWorkspaceFileContent('CUSTOM.md', 'MyAgent');
    expect(content).toContain('CUSTOM.md');
    expect(content).toContain('MyAgent');
  });

  test('所有已知文件均生成非空内容', () => {
    for (const file of COMPLETENESS_WORKSPACE_FILES) {
      const content = generateDefaultWorkspaceFileContent(file, 'TestAgent');
      expect(content.length).toBeGreaterThan(0);
      expect(content).toContain('TestAgent');
    }
  });
});

// ── validateAgentRename 测试 ──────────────────────────────────────

describe('validateAgentRename', () => {
  test('合法名称通过校验', () => {
    const result = validateAgentRename('my-agent_01', []);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test('纯字母名称通过校验', () => {
    const result = validateAgentRename('TestAgent', []);
    expect(result.valid).toBe(true);
  });

  test('纯数字名称通过校验', () => {
    const result = validateAgentRename('123', []);
    expect(result.valid).toBe(true);
  });

  test('空字符串被拒绝', () => {
    const result = validateAgentRename('', []);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('纯空格字符串被拒绝', () => {
    const result = validateAgentRename('   ', []);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('包含中文字符被拒绝', () => {
    const result = validateAgentRename('智能体', []);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('包含特殊字符被拒绝', () => {
    const result = validateAgentRename('agent@home', []);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('包含空格被拒绝', () => {
    const result = validateAgentRename('my agent', []);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('与已有名称冲突（完全相同）被拒绝', () => {
    const result = validateAgentRename('agent1', ['agent1', 'agent2']);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('与已有名称冲突（不区分大小写）被拒绝', () => {
    const result = validateAgentRename('Agent1', ['agent1', 'agent2']);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('不冲突的名称通过校验', () => {
    const result = validateAgentRename('agent3', ['agent1', 'agent2']);
    expect(result.valid).toBe(true);
  });

  test('名称前后有空格时自动 trim 后校验', () => {
    const result = validateAgentRename('  myAgent  ', []);
    expect(result.valid).toBe(true);
  });

  test('trim 后与已有名称冲突被拒绝', () => {
    const result = validateAgentRename('  agent1  ', ['agent1']);
    expect(result.valid).toBe(false);
  });

  test('tab 字符被视为空白', () => {
    const result = validateAgentRename('\t', []);
    expect(result.valid).toBe(false);
  });
});
