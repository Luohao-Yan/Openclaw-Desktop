/**
 * AgentSkillsPanel.tsx - Agent专属技能管理面板
 *
 * 功能：
 * - 显示Agent的全局技能和专属技能列表
 * - 支持添加/解绑专属技能
 * - 支持搜索和筛选技能
 * - 实时更新技能列表
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  RefreshCw,
  Plus,
  Link2,
  X,
  Loader2,
  Globe,
  Lock,
} from 'lucide-react';
import AppButton from '../AppButton';
import AppBadge from '../AppBadge';
import type { SkillInfo } from '../../types/electron';
import type { AgentSkillInfo } from '../../types/electron';

interface AgentSkillsPanelProps {
  agentId: string;
  agentName: string;
  /** Agent的专属技能信息 */
  agentSkills: AgentSkillInfo | null;
  /** 是否加载中 */
  loading?: boolean;
  /** 刷新回调 */
  onRefresh?: () => void;
  /** 添加专属技能回调 */
  onAddExclusiveSkill?: (skillId: string) => Promise<{ success: boolean; error?: string }>;
  /** 解绑技能回调 */
  onUnbindSkill?: (skillId: string) => Promise<{ success: boolean; error?: string }>;
  /** 所有可用的技能列表（用于选择添加） */
  allSkills?: SkillInfo[];
}

type TabKey = 'global' | 'exclusive';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'global', label: '全局技能' },
  { key: 'exclusive', label: '专属技能' },
];

const AgentSkillsPanel: React.FC<AgentSkillsPanelProps> = ({
  agentId,
  agentName,
  agentSkills,
  loading = false,
  onRefresh,
  onAddExclusiveSkill,
  onUnbindSkill,
  allSkills = [],
}) => {
  // 搜索关键词
  const [searchQuery, setSearchQuery] = useState('');
  // 当前标签页
  const [activeTab, setActiveTab] = useState<TabKey>('global');
  // 添加技能对话框
  const [addSkillDialogOpen, setAddSkillDialogOpen] = useState(false);
  // 操作状态
  const [operation, setOperation] = useState<{ type: 'add' | 'unbind'; skillId?: string } | null>(null);
  // 错误提示
  const [error, setError] = useState<string | null>(null);
  // 成功提示
  const [success, setSuccess] = useState<string | null>(null);

  // 根据当前标签页和搜索过滤技能
  const filteredSkills = React.useMemo(() => {
    if (!agentSkills) return [];

    const skills =
      activeTab === 'global' ? agentSkills.globalSkills : agentSkills.exclusiveSkills;

    if (!searchQuery.trim()) return skills;

    const q = searchQuery.toLowerCase();
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
    );
  }, [agentSkills, activeTab, searchQuery]);

  // 可添加的技能列表（未绑定的非全局技能）
  const availableSkillsForBinding = React.useMemo(() => {
    if (!agentSkills || !allSkills.length) return [];

    const exclusiveIds = new Set(agentSkills.exclusiveSkills.map((s) => s.id));
    const globalIds = new Set(agentSkills.globalSkills.map((s) => s.id));

    // 当前仅支持从已安装技能中选择添加
    return allSkills
      .filter((s) => s.status === 'installed')
      .filter((s) => !exclusiveIds.has(s.id) && !globalIds.has(s.id));
  }, [agentSkills, allSkills]);

  // 处理添加专属技能
  const handleAddExclusiveSkill = useCallback(
    async (skillId: string) => {
      if (!onAddExclusiveSkill) return;

      setOperation({ type: 'add', skillId });
      setError(null);
      setSuccess(null);

      try {
        const result = await onAddExclusiveSkill(skillId);

        if (result.success) {
          setSuccess('添加专属技能成功');
          setAddSkillDialogOpen(false);
          onRefresh?.();
        } else {
          setError(result.error || '添加失败');
        }
      } catch (err: any) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setOperation(null);
      }
    },
    [onAddExclusiveSkill, onRefresh]
  );

  // 处理解绑技能
  const handleUnbindSkill = useCallback(
    async (skillId: string) => {
      if (!onUnbindSkill) return;

      if (!confirm(`确定要解绑技能 "${skillId}" 吗？`)) return;

      setOperation({ type: 'unbind', skillId });
      setError(null);
      setSuccess(null);

      try {
        const result = await onUnbindSkill(skillId);

        if (result.success) {
          setSuccess('解绑成功');
          onRefresh?.();
        } else {
          setError(result.error || '解绑失败');
        }
      } catch (err: any) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setOperation(null);
      }
    },
    [onUnbindSkill, onRefresh]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            专属技能
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {agentName} 的专属技能配置
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AppButton
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
          </AppButton>
          {activeTab === 'exclusive' && (
            <AppButton
              variant="primary"
              size="sm"
              onClick={() => setAddSkillDialogOpen(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              添加专属技能
            </AppButton>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`
              px-4 py-2 text-sm font-medium transition-colors border-b-2
              ${activeTab === tab.key
                ? 'text-blue-600 dark:text-blue-400 border-blue-500'
                : 'text-gray-600 dark:text-gray-400 border-transparent hover:text-gray-900 dark:hover:text-white'
              }
            `}
          >
            {tab.label}
            {agentSkills && (
              <span className="ml-2 text-xs">
                {tab.key === 'global'
                  ? agentSkills.globalSkills.length
                  : agentSkills.exclusiveSkills.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Status Messages */}
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-300 text-sm">
          {success}
        </div>
      )}

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder={`搜索${activeTab === 'global' ? '全局' : '专属'}技能...`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Skills List */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          </div>
        ) : filteredSkills.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            {searchQuery ? '未找到匹配的技能' : '暂无技能'}
          </div>
        ) : (
          filteredSkills.map((skill) => {
            const isOperating =
              operation &&
              operation.skillId === skill.id;

            return (
              <div
                key={skill.id}
                className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Skill Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">{skill.emoji || '📦'}</span>
                      <h4 className="font-medium text-gray-900 dark:text-white truncate">
                        {skill.name}
                      </h4>
                      {activeTab === 'global' && (
                        <AppBadge variant="default" size="sm">
                          <Globe className="w-3 h-3" />
                          全局
                        </AppBadge>
                      )}
                      {activeTab === 'exclusive' && (
                        <AppBadge variant="success" size="sm">
                          <Lock className="w-3 h-3" />
                          专属
                        </AppBadge>
                      )}
                      <AppBadge
                        variant={skill.enabled ? 'success' : 'default'}
                        size="sm"
                      >
                        {skill.enabled ? '已启用' : '已禁用'}
                      </AppBadge>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
                      {skill.description}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span>{skill.category}</span>
                      <span>·</span>
                      <span>{skill.version}</span>
                      {skill.author && (
                        <>
                          <span>·</span>
                          <span>{skill.author}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  {activeTab === 'exclusive' && onUnbindSkill && (
                    <button
                      onClick={() => handleUnbindSkill(skill.id)}
                      disabled={!!isOperating}
                      className={`
                        p-2 rounded-lg transition-colors
                        ${isOperating
                          ? 'opacity-50 cursor-not-allowed'
                          : 'hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400'
                        }
                      `}
                      title="解绑技能"
                    >
                      {isOperating ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Link2 className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Skill Dialog */}
      {addSkillDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  添加专属技能
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  为 {agentName} 添加专属技能
                </p>
              </div>
              <button
                onClick={() => setAddSkillDialogOpen(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            {/* Skills List */}
            <div className="flex-1 overflow-y-auto p-6">
              {availableSkillsForBinding.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  暂无可添加的技能
                </div>
              ) : (
                <div className="space-y-2">
                  {availableSkillsForBinding.map((skill) => {
                    const isAdding =
                      operation && operation.type === 'add' && operation.skillId === skill.id;

                    return (
                      <div
                        key={skill.id}
                        className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 transition-colors"
                      >
                        <span className="text-2xl">{skill.emoji || '📦'}</span>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-gray-900 dark:text-white truncate">
                            {skill.name}
                          </h4>
                          <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                            {skill.description}
                          </p>
                        </div>
                        <AppButton
                          variant="primary"
                          size="sm"
                          onClick={() => handleAddExclusiveSkill(skill.id)}
                          disabled={!!isAdding}
                        >
                          {isAdding && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                          添加
                        </AppButton>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentSkillsPanel;
