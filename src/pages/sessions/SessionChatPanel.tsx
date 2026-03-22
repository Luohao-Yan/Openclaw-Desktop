/**
 * 会话对话面板组件
 * 右侧面板：会话头部 + 对话记录 + 消息输入栏
 * 优化：更紧凑的头部、更好的消息气泡、markdown 友好的排版
 */
import React, { useRef, useEffect } from 'react';
import {
  MessageSquare,
  Trash2,
  Download,
  Copy,
  Send,
  Bot,
  User,
  Settings2,
} from 'lucide-react';
import AppButton from '../../components/AppButton';
import type { Session, TranscriptMessage, TFunc } from './types';

interface SessionChatPanelProps {
  session: Session | null;
  transcript: TranscriptMessage[];
  transcriptLoading: boolean;
  newMessage: string;
  onMessageChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  onExport: (sessionId: string, format: 'json' | 'markdown') => void;
  onClose: (sessionId: string) => void;
  t: TFunc;
}

/** 根据角色返回图标和颜色 */
function getRoleConfig(role: string) {
  switch (role) {
    case 'user': return { icon: User, color: '#60a5fa', bg: 'rgba(96,165,250,0.10)', bubbleBg: 'rgba(96,165,250,0.08)', bubbleBorder: 'rgba(96,165,250,0.15)' };
    case 'assistant': return { icon: Bot, color: '#34d399', bg: 'rgba(52,211,153,0.10)', bubbleBg: 'rgba(52,211,153,0.06)', bubbleBorder: 'rgba(52,211,153,0.12)' };
    case 'system': return { icon: Settings2, color: '#a78bfa', bg: 'rgba(167,139,250,0.10)', bubbleBg: 'rgba(167,139,250,0.06)', bubbleBorder: 'rgba(167,139,250,0.12)' };
    default: return { icon: MessageSquare, color: '#94a3b8', bg: 'rgba(148,163,184,0.10)', bubbleBg: 'rgba(148,163,184,0.06)', bubbleBorder: 'rgba(148,163,184,0.12)' };
  }
}

/** 右侧会话对话面板 */
const SessionChatPanel: React.FC<SessionChatPanelProps> = ({
  session, transcript, transcriptLoading,
  newMessage, onMessageChange, onSend, sending,
  onExport, onClose, t,
}) => {
  // 自动滚动到最新消息
  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  /* ── 未选中会话的空状态 ── */
  if (!session) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center rounded-2xl border"
        style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)' }}>
        <div className="h-14 w-14 rounded-2xl flex items-center justify-center mb-3"
          style={{ backgroundColor: 'rgba(96,165,250,0.06)' }}>
          <MessageSquare size={24} style={{ color: '#60a5fa', opacity: 0.4 }} />
        </div>
        <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>{t('sessions.detailTitle')}</p>
        <p className="mt-1 text-xs" style={{ color: 'var(--app-text-muted)', opacity: 0.5 }}>{t('sessions.noSessionsHint')}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col rounded-2xl border overflow-hidden"
      style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)' }}>

      {/* ── 会话头部（紧凑） ── */}
      <div className="px-4 py-2.5 border-b flex items-center justify-between shrink-0"
        style={{ borderColor: 'var(--app-border)' }}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, rgba(96,165,250,0.15), rgba(129,140,248,0.15))' }}>
            <Bot size={16} style={{ color: '#60a5fa' }} />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-medium truncate" style={{ color: 'var(--app-text)' }}>{session.agent}</div>
            <div className="text-[11px] truncate" style={{ color: 'var(--app-text-muted)' }}>
              {session.model}
              <span className="mx-1.5 opacity-30">·</span>
              {session.channel}
            </div>
          </div>
        </div>
        {/* 操作按钮组（iconOnly ghost） */}
        <div className="flex items-center gap-1 shrink-0">
          <AppButton variant="ghost" size="sm" iconOnly
            icon={<Download size={14} />}
            onClick={() => void onExport(session.id, 'json')}
            title="Export JSON"
          />
          <AppButton variant="ghost" size="sm" iconOnly
            icon={<Copy size={14} />}
            onClick={() => navigator.clipboard.writeText(session.key)}
            title="Copy Key"
          />
          {/* 关闭会话：danger ghost */}
          <AppButton variant="ghost" size="sm" iconOnly
            icon={<Trash2 size={14} />}
            onClick={() => void onClose(session.id)}
            title="Close Session"
            style={{ color: '#ef4444' }}
          />
        </div>
      </div>

      {/* ── 对话记录区域 ── */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {transcriptLoading ? (
          /* 加载中 */
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-blue-400 mb-2" />
              <p className="text-xs" style={{ color: 'var(--app-text-muted)' }}>{t('sessions.loadingText')}</p>
            </div>
          </div>
        ) : transcript.length === 0 ? (
          /* 无消息空状态 */
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageSquare size={22} style={{ color: 'var(--app-text-muted)', opacity: 0.25 }} />
            <p className="mt-2 text-xs" style={{ color: 'var(--app-text-muted)' }}>{t('sessions.noMessages')}</p>
            <p className="mt-0.5 text-[11px]" style={{ color: 'var(--app-text-muted)', opacity: 0.5 }}>{t('sessions.noMessagesHint')}</p>
          </div>
        ) : (
          /* 消息列表 */
          <div className="space-y-3">
            {transcript.map((msg, idx) => {
              const cfg = getRoleConfig(msg.role);
              const RoleIcon = cfg.icon;
              const isUser = msg.role === 'user';

              return (
                <div key={idx} className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
                  {/* 角色头像 */}
                  <div className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ backgroundColor: cfg.bg }}>
                    <RoleIcon size={14} style={{ color: cfg.color }} />
                  </div>
                  {/* 消息气泡 */}
                  <div className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${isUser ? 'rounded-tr-md' : 'rounded-tl-md'}`}
                    style={{
                      backgroundColor: cfg.bubbleBg,
                      color: 'var(--app-text)',
                      border: `1px solid ${cfg.bubbleBorder}`,
                    }}>
                    <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                    {msg.timestamp && (
                      <div className="mt-1 text-[10px] text-right" style={{ color: 'var(--app-text-muted)', opacity: 0.5 }}>
                        {msg.timestamp}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {/* 自动滚动锚点 */}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* ── 消息输入栏 ── */}
      <div className="px-3 py-2.5 border-t shrink-0" style={{ borderColor: 'var(--app-border)' }}>
        <div className="flex items-center gap-2">
          <input type="text" value={newMessage}
            onChange={(e) => onMessageChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
            placeholder={t('sessions.sendPlaceholder')}
            disabled={sending}
            className="flex-1 px-3.5 py-2 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-400/40"
            style={{ backgroundColor: 'var(--app-bg)', border: '1px solid var(--app-border)', color: 'var(--app-text)' }} />
          {/* 发送按钮：loading 时自动显示 spinner */}
          <AppButton
            variant="primary"
            size="sm"
            icon={<Send size={14} />}
            loading={sending}
            disabled={sending || !newMessage.trim()}
            onClick={onSend}
          >
            <span className="text-xs font-medium">
              {sending ? t('sessions.sending') : t('sessions.send')}
            </span>
          </AppButton>
        </div>
      </div>
    </div>
  );
};

export default SessionChatPanel;
