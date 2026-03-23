/**
 * AgentBindingDialog.tsx - 技能关联Agent对话框
 *
 * 功能：
 * - 显示技能已绑定的Agent列表
 * - 支持搜索Agent
 * - 支持多选绑定/解绑Agent
 * - 实时更新绑定状态
 */

import React, { useState, useEffect, useCallback } from 'react';
import { X, Search, Check, Users, UserPlus, UserMinus, Loader2 } from 'lucide-react';
import AppButton from '../AppButton';
import AppBadge from '../AppBadge';
import type { AgentInfo } from '../../types/electron';
import type { SkillAgentBinding } from '../../types/electron';

interface AgentBindingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  skillId: string;
  skillName: string;
  /** 当前已绑定的Agent列表 */
  boundAgents: AgentInfo[];
  /** 所有可用的Agent列表 */
  allAgents: AgentInfo[];
  /** 绑定回调函数 */
  onBind: (agentIds: string[]) => Promise<{ success: boolean; error?: string }>;
  /** 解绑回调函数 */
  onUnbind: (agentIds: string[]) => Promise<{ success: boolean; error?: string }>;
  /** 刷新回调函数 */
  onRefresh?: () => void;
}

const AgentBindingDialog: React.FC<AgentBindingDialogProps> = ({
  isOpen,
  onClose,
  skillId,
  skillName,
  boundAgents,
  allAgents,
  onBind,
  onUnbind,
  onRefresh,
}) => {
  // 搜索关键词
  const [searchQuery, setSearchQuery] = useState('');
  // 选中的Agent（待绑定）
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  // 加载状态
  const [binding, setBinding] = useState(false);
  const [unbinding, setUnbinding] = useState(false);
  // 错误提示
  const [error, setError] = useState<string | null>(null);
  // 成功提示
  const [success, setSuccess] = useState<string | null>(null);

  // 已绑定Agent的ID集合
  const boundAgentIds = new Set(boundAgents.map((a) => a.id));

  // 过滤后的Agent列表
  const filteredAgents = allAgents.filter((agent) => {
    const matchesSearch =
      agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  // 选中/取消选中Agent
  const toggleAgentSelection = useCallback((agentId: string) => {
    setSelectedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
      }
      return next;
    });
  }, []);

  // 全选/取消全选
  const toggleSelectAll = useCallback(() => {
    const unselectedAgents = filteredAgents.filter((a) => !selectedAgents.has(a.id));
    if (unselectedAgents.length > 0) {
      // 全选未绑定的Agent
      const toSelect = unselectedAgents
        .filter((a) => !boundAgentIds.has(a.id))
        .map((a) => a.id);
      setSelectedAgents((prev) => new Set([...prev, ...toSelect]));
    } else {
      // 取消全选
      setSelectedAgents(new Set());
    }
  }, [filteredAgents, selectedAgents, boundAgentIds]);

  // 批量绑定
  const handleBind = useCallback(async () => {
    if (selectedAgents.size === 0) {
      setError('请先选择要绑定的Agent');
      return;
    }

    setBinding(true);
    setError(null);
    setSuccess(null);

    try {
      const agentIds = Array.from(selectedAgents);
      const result = await onBind(agentIds);

      if (result.success) {
        setSuccess(`成功绑定到 ${agentIds.length} 个Agent`);
        setSelectedAgents(new Set());
        onRefresh?.();
        // 延迟关闭对话框
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        setError(result.error || '绑定失败');
      }
    } catch (err: any) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBinding(false);
    }
  }, [selectedAgents, onBind, onRefresh, onClose]);

  // 单个解绑
  const handleUnbind = useCallback(
    async (agentId: string) => {
      setUnbinding(true);
      setError(null);
      setSuccess(null);

      try {
        const result = await onUnbind([agentId]);

        if (result.success) {
          setSuccess('解绑成功');
          onRefresh?.();
        } else {
          setError(result.error || '解绑失败');
        }
      } catch (err: any) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setUnbinding(false);
      }
    },
    [onUnbind, onRefresh]
  );

  // 批量解绑选中的Agent
  const handleBatchUnbind = useCallback(async () => {
    const toUnbind = Array.from(selectedAgents).filter((id) => boundAgentIds.has(id));
    if (toUnbind.length === 0) {
      setError('请先选择要解绑的Agent');
      return;
    }

    setUnbinding(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await onUnbind(toUnbind);

      if (result.success) {
        setSuccess(`成功解绑 ${toUnbind.length} 个Agent`);
        setSelectedAgents(new Set());
        onRefresh?.();
      } else {
        setError(result.error || '解绑失败');
      }
    } catch (err: any) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUnbinding(false);
    }
  }, [selectedAgents, boundAgentIds, onUnbind, onRefresh]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                关联 Agent
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">{skillName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-6 pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索 Agent..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Agent List */}
        <div className="flex-1 overflow-y-auto px-6 pb-4">
          <div className="space-y-2">
            {filteredAgents.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                未找到匹配的 Agent
              </div>
            ) : (
              filteredAgents.map((agent) => {
                const isBound = boundAgentIds.has(agent.id);
                const isSelected = selectedAgents.has(agent.id);

                return (
                  <div
                    key={agent.id}
                    className={`
                      flex items-center gap-3 p-3 rounded-lg border-2 transition-all
                      ${isSelected ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}
                      ${isBound ? 'bg-green-50 dark:bg-green-900/20' : ''}
                    `}
                  >
                    {/* Checkbox */}
                    <button
                      onClick={() => toggleAgentSelection(agent.id)}
                      className={`
                        w-5 h-5 rounded border-2 flex items-center justify-center transition-colors
                        ${isSelected ? 'bg-blue-500 border-blue-500' : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:border-blue-500'}
                      `}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>

                    {/* Agent Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-gray-900 dark:text-white truncate">
                          {agent.name}
                        </h3>
                        {isBound && (
                          <AppBadge variant="success" size="sm">
                            已绑定
                          </AppBadge>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {agent.id} · {agent.workspace}
                      </p>
                    </div>

                    {/* Action Button */}
                    {isBound && (
                      <button
                        onClick={() => handleUnbind(agent.id)}
                        disabled={unbinding}
                        className={`
                          p-2 rounded-lg transition-colors
                          ${unbinding
                            ? 'opacity-50 cursor-not-allowed'
                            : 'hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400'
                          }
                        `}
                      >
                        <UserMinus className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Status Messages */}
        {error && (
          <div className="px-6 pb-2">
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          </div>
        )}
        {success && (
          <div className="px-6 pb-2">
            <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-300 text-sm">
              {success}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <button
              onClick={toggleSelectAll}
              className="text-sm text-gray-600 dark:text:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              全选
            </button>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              已绑定 {boundAgents.length} / 共 {allAgents.length}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleBatchUnbind}
              disabled={selectedAgents.size === 0 || unbinding}
              className={`
                px-4 py-2 rounded-lg text-sm font-medium transition-colors
                ${selectedAgents.size === 0 || unbinding
                  ? 'opacity-50 cursor-not-allowed text-gray-500 dark:text-gray-400'
                  : 'hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400'
                }
              `}
            >
              批量解绑
            </button>
            <AppButton
              variant="primary"
              onClick={handleBind}
              disabled={selectedAgents.size === 0 || binding}
            >
              {binding && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <UserPlus className="w-4 h-4 mr-2" />
              绑定到选中 Agent
            </AppButton>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentBindingDialog;
