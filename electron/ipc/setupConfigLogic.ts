/**
 * setupConfigLogic.ts
 *
 * 提供 sanitizeSetupConfig 纯函数，用于在 Setup Wizard 的 done 子步骤
 * 调用 config:set 写入 openclaw.json 之前，过滤掉 schema 不兼容字段。
 *
 * 不兼容字段说明：
 * - skills.install.recommended：openclaw schema 不识别该 key
 * - 根级 daemon：openclaw schema 不包含根级 daemon 字段
 */

/**
 * 过滤 Setup Wizard done 子步骤配置对象中的 schema 不兼容字段。
 *
 * 具体过滤规则：
 * 1. 若 skills.install.recommended 存在，则删除该字段
 * 2. 若根级 daemon 字段存在，则删除
 * 3. 所有其他字段原样保留
 *
 * 纯函数：使用深拷贝，不修改原始输入对象。
 * 幂等：多次调用结果一致。
 *
 * @param raw - 原始配置对象（来自 done 子步骤构建的配置）
 * @returns 过滤后的配置对象，不含 schema 不兼容字段
 */
export function sanitizeSetupConfig(raw: Record<string, unknown>): Record<string, unknown> {
  // 深拷贝，确保不修改原始输入对象
  const result: Record<string, unknown> = JSON.parse(JSON.stringify(raw));

  // ── 规则 1：处理 skills.install.recommended ──────────────────────────────
  // openclaw schema 的 skills.install 不识别 recommended 字段，删除
  if (result.skills !== null && typeof result.skills === 'object') {
    const skills = result.skills as Record<string, unknown>;
    if (skills.install !== null && typeof skills.install === 'object') {
      const install = skills.install as Record<string, unknown>;
      if ('recommended' in install) {
        delete install.recommended;
      }
    }
  }

  // ── 规则 2：处理根级 daemon 字段 ─────────────────────────────────────────
  // openclaw schema 不包含根级 daemon 字段，daemon 管理由 CLI 独立处理
  if ('daemon' in result) {
    delete result.daemon;
  }

  return result;
}
