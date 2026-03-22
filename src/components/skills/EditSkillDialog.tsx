/**
 * EditSkillDialog — 编辑技能对话框
 *
 * 使用 AppModal 统一弹窗结构，分为两部分：
 * - Frontmatter 表单（name/description/emoji/requires）
 * - Markdown 文本编辑区（textarea）
 * - 打开时调用 skillsRead 加载 SKILL.md 内容，前端解析 frontmatter
 * - 保存时重新组装 SKILL.md 后调用 skillsSave
 * - 非自定义技能以只读模式展示，禁用保存按钮
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Save, AlertTriangle, RefreshCw, Eye } from 'lucide-react';
import yaml from 'js-yaml';
import AppButton from '../AppButton';
import AppModal from '../AppModal';

/** 常用 emoji 列表 */
const COMMON_EMOJIS = [
  '🔧', '🎯', '📦', '🚀', '💡', '🤖', '🔍', '📝',
  '🛡️', '⚡', '🎨', '🔗', '📊', '🌐', '💻', '🎮',
  '📱', '🔔', '🎵', '🎬',
];

interface EditSkillDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  skillId: string;
  skillName: string;
  isCustom: boolean;
}

interface FrontmatterData {
  name: string;
  description: string;
  emoji: string;
  requires: string;
}

/** 从 SKILL.md 原始内容中解析 frontmatter 和 body */
function parseSkillContent(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  try {
    const parsed = yaml.load(match[1]) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;
    const body = content.slice(match[0].length).replace(/^\r?\n/, '');
    return { frontmatter: parsed, body };
  } catch {
    return null;
  }
}

/** 将 frontmatter 对象和 body 重新组装为 SKILL.md 内容 */
function assembleSkillContent(frontmatter: Record<string, unknown>, body: string): string {
  const yamlStr = yaml.dump(frontmatter, {
    lineWidth: -1,
    noRefs: true,
    quotingType: '"',
  }).trimEnd();
  const parts = ['---', yamlStr, '---'];
  if (body.trim()) parts.push('', body.trimEnd());
  return parts.join('\n') + '\n';
}

const EditSkillDialog: React.FC<EditSkillDialogProps> = ({
  isOpen,
  onClose,
  onSuccess,
  skillId,
  skillName,
  isCustom,
}) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [rawFrontmatter, setRawFrontmatter] = useState<Record<string, unknown>>({});
  const [form, setForm] = useState<FrontmatterData>({
    name: '', description: '', emoji: '🔧', requires: '',
  });
  const [body, setBody] = useState('');

  const readOnly = !isCustom;

  // 加载技能内容
  const loadContent = useCallback(async () => {
    if (!skillId) return;
    setLoading(true);
    setError('');
    try {
      const result = await window.electronAPI.skillsRead(skillId);
      if (result.success && result.content) {
        const parsed = parseSkillContent(result.content);
        if (parsed) {
          setRawFrontmatter(parsed.frontmatter);
          const fm = parsed.frontmatter;
          const metadata = fm.metadata as Record<string, unknown> | undefined;
          const openclaw = metadata?.openclaw as Record<string, unknown> | undefined;
          setForm({
            name: (fm.name as string) || '',
            description: (fm.description as string) || '',
            emoji: (openclaw?.emoji as string) || '🔧',
            requires: openclaw?.requires ? JSON.stringify(openclaw.requires, null, 2) : '',
          });
          setBody(parsed.body);
        } else {
          setBody(result.content);
          setForm({ name: skillName, description: '', emoji: '🔧', requires: '' });
          setRawFrontmatter({});
        }
      } else {
        setError(result.error || '读取技能内容失败');
      }
    } catch (err: unknown) {
      setError(`加载异常: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [skillId, skillName]);

  useEffect(() => {
    if (isOpen && skillId) void loadContent();
    if (!isOpen) {
      setForm({ name: '', description: '', emoji: '🔧', requires: '' });
      setBody('');
      setError('');
      setRawFrontmatter({});
    }
  }, [isOpen, skillId, loadContent]);

  const handleSave = useCallback(async () => {
    if (readOnly || saving) return;
    setSaving(true);
    setError('');
    try {
      const merged = { ...rawFrontmatter };
      merged.name = form.name;
      merged.description = form.description;
      if (!merged.metadata || typeof merged.metadata !== 'object') merged.metadata = {};
      const metadata = merged.metadata as Record<string, unknown>;
      if (!metadata.openclaw || typeof metadata.openclaw !== 'object') metadata.openclaw = {};
      const openclaw = metadata.openclaw as Record<string, unknown>;
      openclaw.emoji = form.emoji;
      if (form.requires.trim()) {
        try {
          openclaw.requires = JSON.parse(form.requires);
        } catch {
          setError('requires 格式无效，请输入有效的 JSON');
          setSaving(false);
          return;
        }
      } else {
        delete openclaw.requires;
      }
      const content = assembleSkillContent(merged, body);
      const result = await window.electronAPI.skillsSave(skillId, content);
      if (result.success) {
        onSuccess?.();
        onClose();
      } else {
        setError(result.error || '保存失败');
      }
    } catch (err: unknown) {
      setError(`保存异常: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }, [readOnly, saving, rawFrontmatter, form, body, skillId, onSuccess, onClose]);

  // 构建标题（含只读徽章）
  const titleNode = (
    <span className="flex items-center gap-2">
      {readOnly ? '查看技能' : '编辑技能'}
      {readOnly && (
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs"
          style={{ backgroundColor: 'rgba(245,158,11,0.12)', color: '#F59E0B' }}
        >
          <Eye className="w-3 h-3" />
          只读
        </span>
      )}
    </span>
  );

  return (
    <AppModal
      open={isOpen}
      onClose={onClose}
      title={titleNode}
      variant="info"
      size="lg"
      icon={<span className="text-lg">{form.emoji || '🔧'}</span>}
      disableClose={saving}
      footer={
        <>
          <AppButton variant="secondary" onClick={onClose} disabled={saving}>
            {readOnly ? '关闭' : '取消'}
          </AppButton>
          {!readOnly && (
            <AppButton
              variant="primary"
              onClick={() => void handleSave()}
              disabled={saving || loading}
              loading={saving}
              icon={<Save className="w-4 h-4" />}
            >
              保存
            </AppButton>
          )}
        </>
      }
      /* 覆盖内容区 padding，改为可滚动容器 */
      className="flex flex-col"
    >
      {/* 可滚动内容区 */}
      <div className="overflow-y-auto space-y-4" style={{ maxHeight: '60vh' }}>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin" style={{ color: 'var(--app-text-muted)' }} />
            <span className="ml-2 text-sm" style={{ color: 'var(--app-text-muted)' }}>加载中...</span>
          </div>
        ) : (
          <>
            {/* Frontmatter 表单 */}
            <div
              className="rounded-xl border p-4 space-y-3"
              style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}
            >
              <h4 className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>基本信息</h4>

              {/* 名称 */}
              <div className="space-y-1">
                <label className="text-xs" style={{ color: 'var(--app-text-muted)' }}>名称</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{
                    backgroundColor: 'var(--app-bg-elevated)',
                    border: '1px solid var(--app-border)',
                    color: 'var(--app-text)',
                  }}
                  readOnly={readOnly}
                  disabled={readOnly}
                />
              </div>

              {/* 描述 */}
              <div className="space-y-1">
                <label className="text-xs" style={{ color: 'var(--app-text-muted)' }}>描述</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{
                    backgroundColor: 'var(--app-bg-elevated)',
                    border: '1px solid var(--app-border)',
                    color: 'var(--app-text)',
                  }}
                  readOnly={readOnly}
                  disabled={readOnly}
                />
              </div>

              {/* Emoji 选择器 */}
              <div className="space-y-1">
                <label className="text-xs" style={{ color: 'var(--app-text-muted)' }}>图标</label>
                <div className="flex flex-wrap gap-1">
                  {COMMON_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => !readOnly && setForm((f) => ({ ...f, emoji }))}
                      className="w-8 h-8 rounded-md text-base flex items-center justify-center transition-all"
                      style={{
                        backgroundColor: form.emoji === emoji ? 'rgba(59,130,246,0.2)' : 'var(--app-bg-elevated)',
                        border: form.emoji === emoji ? '2px solid rgba(59,130,246,0.5)' : '1px solid var(--app-border)',
                        cursor: readOnly ? 'default' : 'pointer',
                        opacity: readOnly ? 0.6 : 1,
                      }}
                      disabled={readOnly}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              {/* Requires（JSON 格式） */}
              <div className="space-y-1">
                <label className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
                  依赖声明 (requires, JSON 格式)
                </label>
                <textarea
                  value={form.requires}
                  onChange={(e) => setForm((f) => ({ ...f, requires: e.target.value }))}
                  placeholder='{"bins": ["python3"], "env": ["API_KEY"]}'
                  rows={2}
                  className="w-full rounded-lg px-3 py-2 text-xs font-mono outline-none resize-none"
                  style={{
                    backgroundColor: 'var(--app-bg-elevated)',
                    border: '1px solid var(--app-border)',
                    color: 'var(--app-text)',
                  }}
                  readOnly={readOnly}
                  disabled={readOnly}
                />
              </div>
            </div>

            {/* Markdown 编辑区 */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
                指令内容 (Markdown)
              </h4>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={12}
                className="w-full rounded-xl px-4 py-3 text-sm font-mono outline-none resize-y"
                style={{
                  backgroundColor: 'var(--app-bg-subtle)',
                  border: '1px solid var(--app-border)',
                  color: 'var(--app-text)',
                  minHeight: '200px',
                }}
                placeholder="## Instructions&#10;&#10;在此编写技能指令..."
                readOnly={readOnly}
                disabled={readOnly}
              />
            </div>

            {/* 错误提示 */}
            {error && (
              <div
                className="rounded-xl border px-4 py-3 text-xs flex items-start gap-2"
                style={{
                  backgroundColor: 'rgba(239,68,68,0.08)',
                  borderColor: 'rgba(239,68,68,0.22)',
                  color: '#FCA5A5',
                }}
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </>
        )}
      </div>
    </AppModal>
  );
};

export default EditSkillDialog;
