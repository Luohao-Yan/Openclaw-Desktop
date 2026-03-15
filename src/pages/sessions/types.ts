/**
 * Sessions 模块共享类型定义与工具函数
 */
import {
  MessageSquare,
  Users,
  Activity,
  Database,
  User,
  Bot,
  Settings2,
} from 'lucide-react';
import type { translations } from '../../i18n/translations';

// ── 翻译函数类型 ──────────────────────────────────────────────────────────────
export type TFunc = (key: keyof typeof translations.en) => string;

// ── 数据模型 ──────────────────────────────────────────────────────────────────

/** 会话条目（与 IPC 返回对齐） */
export interface Session {
  id: string;
  key: string;
  agent: string;
  model: string;
  channel: string;
  status: string;
}

/** 会话统计 */
export interface SessionStats {
  total: number;
  active: number;
  idle: number;
  agents: Record<string, number>;
  stores?: { agentId: string; path: string }[];
}

/** transcript 中的单条消息 */
export interface TranscriptMessage {
  role: string;
  content: string;
  timestamp?: string;
  tokens?: number;
  [k: string]: unknown;
}

// ── 统计卡片配置 ──────────────────────────────────────────────────────────────

/** 单张统计卡片的数据结构 */
export interface StatCardData {
  key: string;
  label: string;
  value: string;
  icon: typeof MessageSquare;
  accent: string;
  gradient: string;
}

/** 根据统计数据构建 4 张卡片配置 */
export function buildStatCards(stats: SessionStats, t: TFunc): StatCardData[] {
  return [
    { key: 'total', label: t('sessions.totalSessions'), value: String(stats.total), icon: MessageSquare, accent: '#60a5fa', gradient: 'linear-gradient(135deg, rgba(96,165,250,0.18) 0%, rgba(59,130,246,0.06) 100%)' },
    { key: 'active', label: t('sessions.activeSessions'), value: String(stats.active), icon: Activity, accent: '#34d399', gradient: 'linear-gradient(135deg, rgba(52,211,153,0.18) 0%, rgba(16,185,129,0.06) 100%)' },
    { key: 'agents', label: t('sessions.uniqueAgents'), value: String(Object.keys(stats.agents).length), icon: Users, accent: '#a78bfa', gradient: 'linear-gradient(135deg, rgba(167,139,250,0.18) 0%, rgba(139,92,246,0.06) 100%)' },
    { key: 'stores', label: t('sessions.storeCount'), value: String(stats.stores?.length ?? 0), icon: Database, accent: '#fbbf24', gradient: 'linear-gradient(135deg, rgba(251,191,36,0.18) 0%, rgba(245,158,11,0.06) 100%)' },
  ];
}

// ── 消息角色样式 ──────────────────────────────────────────────────────────────

/** 角色样式配置 */
export interface RoleStyle {
  icon: typeof MessageSquare;
  color: string;
  bg: string;
  label: string;
}

/** 根据消息角色返回对应的图标、颜色、背景 */
export function getRoleStyle(role: string): RoleStyle {
  switch (role) {
    case 'user': return { icon: User, color: '#60a5fa', bg: 'rgba(96,165,250,0.08)', label: 'User' };
    case 'assistant': return { icon: Bot, color: '#34d399', bg: 'rgba(52,211,153,0.08)', label: 'Assistant' };
    case 'system': return { icon: Settings2, color: '#a78bfa', bg: 'rgba(167,139,250,0.08)', label: 'System' };
    default: return { icon: MessageSquare, color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', label: role };
  }
}
