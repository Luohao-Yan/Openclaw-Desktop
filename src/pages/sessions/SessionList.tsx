/**
 * 会话列表组件
 * 左侧面板，紧凑卡片式列表，支持选中高亮
 */
import React from 'react';
import { MessageSquare, Bot } from 'lucide-react';
import type { Session, TFunc } from './types';

interface SessionListProps {
  /** 过滤后的会话列表 */
  sessions: Session[];
  /** 当前选中的会话 */
  selectedSession: Session | null;
  /** 选中会话回调 */
  onSelect: (session: Session) => void;
  /** 翻译函数 */
  t: TFunc;
}

/** 左侧会话列表面板 */
const SessionList: React.FC<SessionListProps> = ({ sessions, selectedSession, onSelect, t }) => (
  <div className="w-[280px] shrink-0 flex flex-col rounded-2xl border overflow-hidden"
    style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)' }}>

    {/* 列表头部 */}
    <div className="px-3.5 py-2.5 border-b flex items-center justify-between shrink-0"
      style={{ borderColor: 'var(--app-border)' }}>
      <span className="text-xs font-medium" style={{ color: 'var(--app-text)' }}>
        {t('sessions.activeList')}
      </span>
      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium tabular-nums"
        style={{ backgroundColor: 'rgba(96,165,250,0.12)', color: '#60a5fa' }}>
        {sessions.length}
      </span>
    </div>

    {/* 列表内容 */}
    <div className="flex-1 overflow-y-auto">
      {sessions.length === 0 ? (
        /* 空状态 */
        <div className="flex flex-col items-center justify-center h-full p-6 text-center">
          <MessageSquare size={28} style={{ color: 'var(--app-text-muted)', opacity: 0.3 }} />
          <p className="mt-2 text-xs" style={{ color: 'var(--app-text-muted)' }}>{t('sessions.noSessions')}</p>
        </div>
      ) : (
        <div className="p-1.5 space-y-0.5">
          {sessions.map((s) => {
            const isSelected = selectedSession?.id === s.id;
            return (
              <button key={s.id} onClick={() => onSelect(s)}
                className="w-full text-left px-3 py-2.5 rounded-xl transition-all duration-150 cursor-pointer group"
                style={{
                  backgroundColor: isSelected ? 'rgba(96,165,250,0.12)' : 'transparent',
                  border: isSelected ? '1px solid rgba(96,165,250,0.2)' : '1px solid transparent',
                }}>
                <div className="flex items-center gap-2.5">
                  {/* 智能体头像 */}
                  <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: isSelected ? 'rgba(96,165,250,0.18)' : 'rgba(148,163,184,0.08)',
                    }}>
                    <Bot size={15} style={{ color: isSelected ? '#60a5fa' : 'var(--app-text-muted)' }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    {/* 智能体名 + 渠道标签 */}
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-medium truncate" style={{ color: 'var(--app-text)' }}>{s.agent}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full shrink-0 font-medium"
                        style={{ backgroundColor: 'rgba(52,211,153,0.1)', color: '#34d399' }}>
                        {s.channel}
                      </span>
                    </div>
                    {/* 模型名 */}
                    <div className="mt-0.5 text-[11px] truncate" style={{ color: 'var(--app-text-muted)' }}>{s.model}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  </div>
);

export default SessionList;
