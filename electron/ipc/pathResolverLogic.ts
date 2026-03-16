/**
 * PATH 解析纯逻辑模块
 *
 * 将 settings.ts 中 getVersionManagerPaths() 的核心逻辑提取为纯函数，
 * 不依赖 Electron、os、process 等运行时环境，便于属性测试。
 *
 * 所有外部依赖（homedir、platform、环境变量、目录扫描）均通过参数注入。
 */

import path from 'path';

// ─── 参数接口 ────────────────────────────────────────────────────────────────

/** getVersionManagerPathsPure 的输入参数 */
export interface PathResolverParams {
  /** 用户主目录路径 */
  homedir: string;
  /** 运行平台标识 */
  platform: string;
  /** NVM_DIR 环境变量值 */
  nvmDir?: string;
  /** FNM_DIR 环境变量值 */
  fnmDir?: string;
  /** N_PREFIX 环境变量值 */
  nPrefix?: string;
  /** APPDATA 环境变量值（Windows） */
  appData?: string;
  /** LOCALAPPDATA 环境变量值（Windows） */
  localAppData?: string;
  /** ProgramFiles 环境变量值（Windows） */
  programFiles?: string;
  /** ProgramFiles(x86) 环境变量值（Windows） */
  programFilesX86?: string;
  /** USERPROFILE 环境变量值（Windows） */
  userProfile?: string;
  /** 模拟目录扫描结果：给定目录路径，返回子目录名称列表 */
  scanDir?: (dirPath: string) => string[];
}

// ─── 纯函数：获取版本管理器路径 ──────────────────────────────────────────────

/**
 * 获取版本管理器路径的纯逻辑版本
 *
 * 不依赖 Electron 或 Node.js 运行时环境，所有外部状态通过参数注入。
 * 与 settings.ts 中 getVersionManagerPaths() 的逻辑保持一致。
 *
 * 覆盖的版本管理器：nvm、volta、fnm、asdf、nodenv、n
 * Windows 平台额外覆盖：nvm-windows、volta、nodejs 官方安装、chocolatey、scoop
 */
export function getVersionManagerPathsPure(params: PathResolverParams): string[] {
  const {
    homedir,
    platform,
    nvmDir,
    fnmDir,
    nPrefix,
    appData,
    localAppData,
    programFiles,
    programFilesX86,
    userProfile,
    scanDir = () => [],
  } = params;

  const paths: string[] = [];

  // --- nvm ---
  // 优先使用 NVM_DIR 环境变量，否则使用默认路径
  const effectiveNvmDir = nvmDir || path.join(homedir, '.nvm');
  const nvmVersionsDir = path.join(effectiveNvmDir, 'versions', 'node');
  // 扫描 nvm versions/node/ 下所有已安装版本的 bin 目录
  for (const ver of scanDir(nvmVersionsDir)) {
    paths.push(path.join(nvmVersionsDir, ver, 'bin'));
  }

  // --- volta ---
  paths.push(path.join(homedir, '.volta', 'bin'));

  // --- fnm ---
  // 优先使用 FNM_DIR 环境变量，否则使用默认路径
  const effectiveFnmDir = fnmDir || path.join(homedir, '.fnm');
  const fnmVersionsDir = path.join(effectiveFnmDir, 'node-versions');
  // 扫描 fnm node-versions/ 下所有版本的 installation/bin 目录
  for (const ver of scanDir(fnmVersionsDir)) {
    paths.push(path.join(fnmVersionsDir, ver, 'installation', 'bin'));
  }

  // --- asdf ---
  // shims 目录（统一入口）
  paths.push(path.join(homedir, '.asdf', 'shims'));
  // 扫描 asdf installs/nodejs/ 下所有版本的 bin 目录
  const asdfNodeDir = path.join(homedir, '.asdf', 'installs', 'nodejs');
  for (const ver of scanDir(asdfNodeDir)) {
    paths.push(path.join(asdfNodeDir, ver, 'bin'));
  }

  // --- nodenv ---
  // shims 目录（统一入口）
  paths.push(path.join(homedir, '.nodenv', 'shims'));
  // 扫描 nodenv versions/ 下所有版本的 bin 目录
  const nodenvVersionsDir = path.join(homedir, '.nodenv', 'versions');
  for (const ver of scanDir(nodenvVersionsDir)) {
    paths.push(path.join(nodenvVersionsDir, ver, 'bin'));
  }

  // --- n ---
  paths.push(path.join(homedir, 'n', 'bin'));
  // 支持自定义 N_PREFIX 环境变量
  if (nPrefix) {
    paths.push(path.join(nPrefix, 'bin'));
  }

  // --- Windows 特定路径 ---
  if (platform === 'win32') {
    const effectiveAppData = appData || '';
    const effectiveLocalAppData = localAppData || '';
    const effectiveProgramFiles = programFiles || 'C:\\Program Files';
    const effectiveProgramFilesX86 = programFilesX86 || 'C:\\Program Files (x86)';
    const effectiveUserProfile = userProfile || homedir;

    paths.push(
      path.join(effectiveAppData, 'nvm'),
      path.join(effectiveLocalAppData, 'volta', 'bin'),
      path.join(effectiveProgramFiles, 'nodejs'),
      path.join(effectiveProgramFilesX86, 'nodejs'),
      'C:\\ProgramData\\chocolatey\\bin',
      path.join(effectiveUserProfile, 'scoop', 'shims'),
    );
  }

  return paths;
}
