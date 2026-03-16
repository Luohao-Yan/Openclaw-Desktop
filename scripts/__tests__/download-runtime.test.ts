/**
 * 单元测试：构建脚本 download-runtime
 * 覆盖 SHA256 校验逻辑和清单解析逻辑
 */

import { describe, test, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { verifySHA256, loadManifest } from '../download-runtime';

// ============================================================
// SHA256 校验逻辑测试
// ============================================================

describe('verifySHA256', () => {
  /** 临时文件路径列表，测试结束后清理 */
  const tmpFiles: string[] = [];

  /**
   * 创建包含指定内容的临时文件，返回文件路径
   */
  function createTmpFile(content: string): string {
    const tmpDir = os.tmpdir();
    const tmpFile = path.join(tmpDir, `test-sha256-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`);
    fs.writeFileSync(tmpFile, content, 'utf-8');
    tmpFiles.push(tmpFile);
    return tmpFile;
  }

  /**
   * 计算字符串的 SHA256 哈希值
   */
  function sha256(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
  }

  afterEach(() => {
    // 清理所有临时文件
    for (const f of tmpFiles) {
      if (fs.existsSync(f)) {
        fs.unlinkSync(f);
      }
    }
    tmpFiles.length = 0;
  });

  test('正确的哈希值通过校验', async () => {
    const content = 'hello openclaw runtime';
    const filePath = createTmpFile(content);
    const expectedHash = sha256(content);

    const result = await verifySHA256(filePath, expectedHash);
    expect(result).toBe(true);
  });

  test('错误的哈希值抛出错误', async () => {
    const content = 'hello openclaw runtime';
    const filePath = createTmpFile(content);
    const wrongHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    await expect(verifySHA256(filePath, wrongHash)).rejects.toThrow('SHA256 校验失败');
  });

  test('PLACEHOLDER_ 前缀的哈希值跳过校验并返回 true', async () => {
    const content = 'placeholder test content';
    const filePath = createTmpFile(content);

    const result = await verifySHA256(filePath, 'PLACEHOLDER_SOME_HASH');
    expect(result).toBe(true);
  });
});

// ============================================================
// 清单解析逻辑测试
// ============================================================

describe('loadManifest', () => {
  test('能正确解析 scripts/runtime-manifest.json', () => {
    const manifest = loadManifest();
    // 解析成功不应抛出异常，且返回对象
    expect(manifest).toBeDefined();
    expect(typeof manifest).toBe('object');
  });

  test('解析结果包含正确的 nodeVersion 和 openclawVersion', () => {
    const manifest = loadManifest();
    expect(manifest.nodeVersion).toBe('22.16.0');
    expect(manifest.openclawVersion).toBe('3.13.0');
  });

  test('解析结果包含 4 个目标平台配置', () => {
    const manifest = loadManifest();
    expect(manifest.targets).toHaveLength(4);

    // 验证四个平台架构组合均存在
    const platformArchPairs = manifest.targets.map(
      (t) => `${t.platform}-${t.arch}`
    );
    expect(platformArchPairs).toContain('darwin-arm64');
    expect(platformArchPairs).toContain('darwin-x64');
    expect(platformArchPairs).toContain('win32-x64');
    expect(platformArchPairs).toContain('linux-x64');
  });
});
