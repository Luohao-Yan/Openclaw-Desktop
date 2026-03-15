/**
 * OpenClaw Manifest 版本集中配置
 *
 * 升级 OpenClaw 版本时，只需修改此文件中的 CURRENT_MANIFEST_VERSION 即可。
 * 所有引用 manifest 版本的地方都从这里读取，无需逐个文件修改。
 */

/** 当前使用的 manifest 版本号 */
export const CURRENT_MANIFEST_VERSION = '3.13';

/** 所有已支持的 manifest 版本列表（用于向后兼容） */
export const SUPPORTED_MANIFEST_VERSIONS = ['3.8', '3.13'] as const;
