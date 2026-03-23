/**
 * 构建阶段运行时下载脚本
 *
 * 负责在构建阶段下载平台特定的 Node.js 二进制文件和 OpenClaw CLI，
 * 放置到 resources/ 目录供 electron-builder 打包。
 *
 * 用法:
 *   npx tsx scripts/download-runtime.ts
 *   npx tsx scripts/download-runtime.ts --platform darwin --arch arm64
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as https from 'https';
import * as http from 'http';
import { execSync } from 'child_process';

// ============================================================
// 类型定义
// ============================================================

/** 下载目标平台 */
interface DownloadTarget {
  platform: 'darwin' | 'win32' | 'linux';
  arch: 'arm64' | 'x64';
}

/** 运行时清单中的单个目标配置 */
interface ManifestTarget {
  platform: 'darwin' | 'win32' | 'linux';
  arch: 'arm64' | 'x64';
  nodeUrl: string;
  nodeSha256: string;
  openclawUrl: string;
  openclawSha256: string;
}

/** 运行时清单 */
interface RuntimeManifest {
  nodeVersion: string;
  openclawVersion: string;
  targets: ManifestTarget[];
}

// ============================================================
// 常量
// ============================================================

/** 项目根目录 */
const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

/** 运行时清单路径 */
const MANIFEST_PATH = path.join(PROJECT_ROOT, 'scripts', 'runtime-manifest.json');

/** Node.js 二进制输出根目录 */
const NODE_OUTPUT_ROOT = path.join(PROJECT_ROOT, 'resources', 'node');

/** OpenClaw CLI 输出根目录 */
const BIN_OUTPUT_ROOT = path.join(PROJECT_ROOT, 'resources', 'bin');

// ============================================================
// 工具函数
// ============================================================

/**
 * 打印带时间戳的日志
 */
function log(message: string): void {
  const timestamp = new Date().toISOString().slice(11, 19);
  console.log(`[${timestamp}] ${message}`);
}

/**
 * 打印警告信息
 */
function warn(message: string): void {
  const timestamp = new Date().toISOString().slice(11, 19);
  console.warn(`[${timestamp}] ⚠️  ${message}`);
}

/**
 * 确保目录存在，不存在则递归创建
 */
function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 解析命令行参数
 * 支持 --platform 和 --arch 参数，默认使用当前平台
 */
function parseArgs(): DownloadTarget {
  const args = process.argv.slice(2);
  let platform: string | undefined;
  let arch: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--platform' && i + 1 < args.length) {
      platform = args[i + 1];
      i++;
    } else if (args[i] === '--arch' && i + 1 < args.length) {
      arch = args[i + 1];
      i++;
    }
  }

  // 默认使用当前系统平台和架构
  const resolvedPlatform = (platform || process.platform) as DownloadTarget['platform'];
  const resolvedArch = (arch || process.arch) as DownloadTarget['arch'];

  // 校验平台值
  const validPlatforms = ['darwin', 'win32', 'linux'];
  const validArchs = ['arm64', 'x64'];

  if (!validPlatforms.includes(resolvedPlatform)) {
    throw new Error(`不支持的平台: ${resolvedPlatform}，支持的平台: ${validPlatforms.join(', ')}`);
  }
  if (!validArchs.includes(resolvedArch)) {
    throw new Error(`不支持的架构: ${resolvedArch}，支持的架构: ${validArchs.join(', ')}`);
  }

  return { platform: resolvedPlatform, arch: resolvedArch };
}

/**
 * 读取并解析运行时清单文件
 */
function loadManifest(): RuntimeManifest {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`运行时清单文件不存在: ${MANIFEST_PATH}`);
  }
  const content = fs.readFileSync(MANIFEST_PATH, 'utf-8');
  return JSON.parse(content) as RuntimeManifest;
}

// ============================================================
// 下载与校验
// ============================================================

/**
 * 从指定 URL 下载文件到本地路径
 * 支持 HTTP/HTTPS 协议和 301/302 重定向（最多 5 次）
 */
function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const doDownload = (currentUrl: string, redirectCount: number) => {
      if (redirectCount > 5) {
        reject(new Error(`重定向次数过多（超过 5 次）: ${url}`));
        return;
      }

      // 根据协议选择 http 或 https 模块
      const isHttps = currentUrl.startsWith('https');

      log(`正在下载: ${currentUrl}`);

      const makeRequest = (cb: (res: http.IncomingMessage) => void) => {
        return isHttps
          ? https.get(currentUrl, cb)
          : http.get(currentUrl, cb);
      };

      makeRequest((response: http.IncomingMessage) => {
        // 处理重定向
        if (response.statusCode && [301, 302, 303, 307, 308].includes(response.statusCode)) {
          const redirectUrl = response.headers.location;
          if (!redirectUrl) {
            reject(new Error(`重定向响应缺少 Location 头: ${response.statusCode}`));
            return;
          }
          // 消费响应体以释放连接
          response.resume();
          log(`重定向到: ${redirectUrl}`);
          doDownload(redirectUrl, redirectCount + 1);
          return;
        }

        // 检查 HTTP 状态码
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`下载失败，HTTP 状态码: ${response.statusCode}，URL: ${currentUrl}`));
          return;
        }

        // 确保输出目录存在
        ensureDir(path.dirname(destPath));

        // 写入文件
        const fileStream = fs.createWriteStream(destPath);
        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          const fileSize = fs.statSync(destPath).size;
          log(`下载完成: ${destPath} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
          resolve();
        });

        fileStream.on('error', (err) => {
          // 下载出错时清理不完整的文件
          fs.unlink(destPath, () => {});
          reject(new Error(`写入文件失败: ${err.message}`));
        });
      }).on('error', (err: Error) => {
        reject(new Error(`网络请求失败: ${err.message}，URL: ${currentUrl}`));
      });
    };

    doDownload(url, 0);
  });
}

/**
 * 验证文件的 SHA256 校验和
 *
 * @param filePath - 待校验的文件路径
 * @param expectedHash - 预期的 SHA256 哈希值
 * @returns 校验是否通过
 * @throws 当哈希值不匹配时抛出错误
 */
async function verifySHA256(filePath: string, expectedHash: string): Promise<boolean> {
  // 如果预期值以 PLACEHOLDER_ 开头，跳过校验并打印警告
  if (expectedHash.startsWith('PLACEHOLDER_')) {
    warn(`跳过 SHA256 校验（占位符哈希）: ${path.basename(filePath)}`);
    return true;
  }

  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));

    stream.on('end', () => {
      const actualHash = hash.digest('hex');
      if (actualHash.toLowerCase() === expectedHash.toLowerCase()) {
        log(`SHA256 校验通过: ${path.basename(filePath)}`);
        resolve(true);
      } else {
        reject(
          new Error(
            `SHA256 校验失败: ${path.basename(filePath)}\n` +
            `  预期: ${expectedHash}\n` +
            `  实际: ${actualHash}`
          )
        );
      }
    });

    stream.on('error', (err) => {
      reject(new Error(`读取文件失败: ${err.message}`));
    });
  });
}

// ============================================================
// Node.js 二进制下载
// ============================================================

/**
 * 下载 Node.js 二进制文件到 resources/node/{platform}-{arch}/
 *
 * - macOS/Linux: 下载 .tar.gz 并解压，确保 bin/node 可执行
 * - Windows: 下载 .zip 并解压，确保 node.exe 存在
 *
 * @param target - 目标平台信息
 * @param version - Node.js 版本号
 * @param nodeUrl - 下载 URL
 * @param nodeSha256 - 预期的 SHA256 哈希值
 */
async function downloadNodeBinary(
  target: DownloadTarget,
  version: string,
  nodeUrl: string,
  nodeSha256: string
): Promise<void> {
  const platformArch = `${target.platform}-${target.arch}`;
  const outputDir = path.join(NODE_OUTPUT_ROOT, platformArch);

  // 检查是否已下载（通过检测目标可执行文件是否存在）
  const nodeBinPath = target.platform === 'win32'
    ? path.join(outputDir, 'node.exe')
    : path.join(outputDir, 'bin', 'node');

  if (fs.existsSync(nodeBinPath)) {
    log(`Node.js 二进制文件已存在，跳过下载: ${nodeBinPath}`);
    return;
  }

  log(`开始下载 Node.js v${version} (${platformArch})...`);

  // 确定临时下载文件名
  const isWindows = target.platform === 'win32';
  const ext = isWindows ? '.zip' : '.tar.gz';
  const tmpDir = path.join(PROJECT_ROOT, 'resources', '.tmp');
  ensureDir(tmpDir);
  const tmpFile = path.join(tmpDir, `node-v${version}-${platformArch}${ext}`);

  try {
    // 下载压缩包
    await downloadFile(nodeUrl, tmpFile);

    // SHA256 校验
    await verifySHA256(tmpFile, nodeSha256);

    // 确保输出目录存在
    ensureDir(outputDir);

    // 解压
    if (isWindows) {
      // Windows: 使用 PowerShell 解压 .zip
      log(`正在解压 Node.js (Windows zip)...`);
      // 解压到临时目录，然后移动内容
      const extractTmpDir = path.join(tmpDir, `node-extract-${platformArch}`);
      ensureDir(extractTmpDir);

      try {
        execSync(
          `powershell -Command "Expand-Archive -Path '${tmpFile}' -DestinationPath '${extractTmpDir}' -Force"`,
          { stdio: 'pipe' }
        );
      } catch {
        // 回退到 tar 命令（Windows 10+ 内置）
        execSync(`tar -xf "${tmpFile}" -C "${extractTmpDir}"`, { stdio: 'pipe' });
      }

      // Node.js zip 解压后通常有一层目录，如 node-v22.16.0-win-x64/
      const extractedEntries = fs.readdirSync(extractTmpDir);
      const nodeDir = extractedEntries.find((e) => e.startsWith('node-'));
      const sourceDir = nodeDir ? path.join(extractTmpDir, nodeDir) : extractTmpDir;

      // 复制 node.exe 到输出目录
      copyDirContents(sourceDir, outputDir);

      // 清理临时解压目录
      fs.rmSync(extractTmpDir, { recursive: true, force: true });
    } else {
      // macOS/Linux: 使用 tar 解压 .tar.gz
      log(`正在解压 Node.js (tar.gz)...`);
      const extractTmpDir = path.join(tmpDir, `node-extract-${platformArch}`);
      ensureDir(extractTmpDir);

      execSync(`tar -xzf "${tmpFile}" -C "${extractTmpDir}"`, { stdio: 'pipe' });

      // tar.gz 解压后有一层目录，如 node-v22.16.0-darwin-arm64/
      const extractedEntries = fs.readdirSync(extractTmpDir);
      const nodeDir = extractedEntries.find((e) => e.startsWith('node-'));
      const sourceDir = nodeDir ? path.join(extractTmpDir, nodeDir) : extractTmpDir;

      // 复制内容到输出目录
      copyDirContents(sourceDir, outputDir);

      // 确保 bin/node 可执行
      const nodePath = path.join(outputDir, 'bin', 'node');
      if (fs.existsSync(nodePath)) {
        fs.chmodSync(nodePath, 0o755);
        log(`已设置可执行权限: ${nodePath}`);
      } else {
        throw new Error(`解压后未找到 Node.js 可执行文件: ${nodePath}`);
      }

      // 清理临时解压目录
      fs.rmSync(extractTmpDir, { recursive: true, force: true });
    }

    log(`Node.js v${version} (${platformArch}) 下载并解压完成`);
  } finally {
    // 清理临时下载文件
    if (fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  }
}

// ============================================================
// OpenClaw CLI 下载
// ============================================================

/**
 * 下载 OpenClaw CLI 到 resources/bin/{platform}-{arch}/
 *
 * - macOS/Linux: 下载到 openclaw，设置可执行权限
 * - Windows: 下载到 openclaw.exe
 *
 * @param target - 目标平台信息
 * @param version - OpenClaw CLI 版本号
 * @param openclawUrl - 下载 URL
 * @param openclawSha256 - 预期的 SHA256 哈希值
 */
async function downloadOpenClawCLI(
  target: DownloadTarget,
  version: string,
  openclawUrl: string,
  openclawSha256: string
): Promise<void> {
  const platformArch = `${target.platform}-${target.arch}`;
  const outputDir = path.join(BIN_OUTPUT_ROOT, platformArch);

  // 确定输出文件名
  const isWindows = target.platform === 'win32';
  const binaryName = isWindows ? 'openclaw.exe' : 'openclaw';
  const outputPath = path.join(outputDir, binaryName);

  // 检查是否已下载
  if (fs.existsSync(outputPath)) {
    log(`OpenClaw CLI 已存在，跳过下载: ${outputPath}`);
    return;
  }

  log(`开始下载 OpenClaw CLI v${version} (${platformArch})...`);

  // 确保输出目录存在
  ensureDir(outputDir);

  try {
    // 下载二进制文件
    await downloadFile(openclawUrl, outputPath);

    // SHA256 校验
    await verifySHA256(outputPath, openclawSha256);

    // macOS/Linux 设置可执行权限
    if (!isWindows) {
      fs.chmodSync(outputPath, 0o755);
      log(`已设置可执行权限: ${outputPath}`);
    }

    log(`OpenClaw CLI v${version} (${platformArch}) 下载完成`);
  } catch (err) {
    // 下载失败时清理不完整的文件
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
    throw err;
  }
}

// ============================================================
// 文件操作辅助
// ============================================================

/**
 * 递归复制目录内容到目标目录
 */
function copyDirContents(srcDir: string, destDir: string): void {
  ensureDir(destDir);
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      copyDirContents(srcPath, destPath);
    } else if (entry.isSymbolicLink()) {
      // 保留符号链接
      const linkTarget = fs.readlinkSync(srcPath);
      if (fs.existsSync(destPath)) {
        fs.unlinkSync(destPath);
      }
      fs.symlinkSync(linkTarget, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      // 保留文件权限
      const stat = fs.statSync(srcPath);
      fs.chmodSync(destPath, stat.mode);
    }
  }
}

// ============================================================
// 主流程
// ============================================================

/**
 * 主入口函数
 *
 * 1. 读取运行时清单
 * 2. 解析命令行参数确定目标平台
 * 3. 依次下载 Node.js 和 OpenClaw CLI
 * 4. 执行 SHA256 校验
 */
async function main(): Promise<void> {
  log('========================================');
  log('OpenClaw Desktop 运行时下载脚本');
  log('========================================');

  // 读取运行时清单
  const manifest = loadManifest();
  log(`Node.js 版本: v${manifest.nodeVersion}`);
  log(`OpenClaw CLI 版本: v${manifest.openclawVersion}`);

  // 解析命令行参数
  const target = parseArgs();
  log(`目标平台: ${target.platform}-${target.arch}`);

  // 在清单中查找匹配的目标配置
  const manifestTarget = manifest.targets.find(
    (t) => t.platform === target.platform && t.arch === target.arch
  );

  if (!manifestTarget) {
    throw new Error(
      `运行时清单中未找到平台 ${target.platform}-${target.arch} 的配置。\n` +
      `可用平台: ${manifest.targets.map((t) => `${t.platform}-${t.arch}`).join(', ')}`
    );
  }

  // 下载 Node.js 二进制文件
  log('----------------------------------------');
  log('步骤 1/2: 下载 Node.js 二进制文件');
  log('----------------------------------------');
  await downloadNodeBinary(target, manifest.nodeVersion, manifestTarget.nodeUrl, manifestTarget.nodeSha256);

  // 下载 OpenClaw CLI
  log('----------------------------------------');
  log('步骤 2/2: 下载 OpenClaw CLI');
  log('----------------------------------------');
  await downloadOpenClawCLI(target, manifest.openclawVersion, manifestTarget.openclawUrl, manifestTarget.openclawSha256);

  log('========================================');
  log('所有运行时组件下载完成！');
  log('========================================');
}

// 导出关键函数供测试使用
export {
  verifySHA256,
  loadManifest,
  parseArgs,
  downloadNodeBinary,
  downloadOpenClawCLI,
  downloadFile,
  copyDirContents,
};

// 导出类型
export type { DownloadTarget, ManifestTarget, RuntimeManifest };

// 当作为脚本直接执行时运行主流程
// 通过 tsx / ts-node 执行时 require.main === module 或直接执行
const isDirectRun =
  typeof require !== 'undefined' && require.main === module
  || process.argv[1]?.endsWith('download-runtime.ts');

if (isDirectRun) {
  main().catch((err) => {
    console.error(`\n❌ 运行时下载失败: ${err.message}`);
    process.exit(1);
  });
}
