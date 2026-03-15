/**
 * 会话统计卡片组件
 * 展示总会话数、活跃会话、关联智能体、存储数 4 张渐变卡片
 */
import React from 'react';
import type { StatCardData } from './types';

interface SessionStatCardsProps {
  /** 卡片数据数组 */
  cards: StatCardData[];
}

/** 4 列渐变统计卡片网格 */
const SessionStatCards: React.FC<SessionStatCardsProps> = ({ cards }) => (
  <div className="grid grid-cols-4 gap-3 mb-4">
    {cards.map((card) => {
      const Icon = card.icon;
      return (
        <div key={card.key}
          className="relative overflow-hidden rounded-2xl border p-4 transition-all duration-200 hover:scale-[1.02]"
          style={{ background: card.gradient, borderColor: `${card.accent}22` }}>
          {/* 装饰性光晕 */}
          <div className="pointer-events-none absolute -right-4 -top-4 h-20 w-20 rounded-full blur-2xl"
            style={{ backgroundColor: `${card.accent}18` }} />
          <div className="relative flex items-center gap-3">
            {/* 图标容器 */}
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl"
              style={{ backgroundColor: `${card.accent}1f`, color: card.accent }}>
              <Icon size={20} />
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.12em]" style={{ color: 'var(--app-text-muted)' }}>
                {card.label}
              </div>
              <div className="mt-1 text-2xl font-semibold" style={{ color: 'var(--app-text)' }}>
                {card.value}
              </div>
            </div>
          </div>
        </div>
      );
    })}
  </div>
);

export default SessionStatCards;
