import React from 'react';
import { ChevronRight, Search, Sparkles } from 'lucide-react';
import AppIconButton from '../../components/AppIconButton';
import GlassCard from '../../components/GlassCard';
import { sectionAccentMap } from './constants';
import type { SettingsSection } from './types';

interface SettingsHomeViewProps {
  filteredSections: SettingsSection[];
  highlightedSections: SettingsSection[];
  hoveredQuickAction: string | null;
  isSearchExpanded: boolean;
  onOpenSection: (sectionId: string) => void;
  onQuickActionHover: (sectionId: string | null) => void;
  onSearchBlur: () => void;
  onSearchChange: (value: string) => void;
  onSearchExpand: () => void;
  searchTerm: string;
  sections: SettingsSection[];
}

const SettingsHomeView: React.FC<SettingsHomeViewProps> = ({
  filteredSections,
  highlightedSections,
  hoveredQuickAction,
  isSearchExpanded,
  onOpenSection,
  onQuickActionHover,
  onSearchBlur,
  onSearchChange,
  onSearchExpand,
  searchTerm,
  sections,
}) => {
  return (
    <div>
      <GlassCard
        variant="gradient"
        className="relative rounded-[28px] px-6 py-5"
        style={{
          background:
            'linear-gradient(135deg, rgba(96, 165, 250, 0.12) 0%, rgba(45, 212, 191, 0.08) 48%, rgba(255, 255, 255, 0.02) 100%)',
          backdropFilter: 'blur(18px)',
          border: 'none',
        }}
      >
        <div
          className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full blur-3xl"
          style={{ backgroundColor: 'rgba(96, 165, 250, 0.18)' }}
        />
        <div
          className="pointer-events-none absolute bottom-0 right-20 h-32 w-32 rounded-full blur-3xl"
          style={{ backgroundColor: 'rgba(45, 212, 191, 0.14)' }}
        />

        <div className="relative flex flex-col gap-5">
          <div className="flex items-start justify-between gap-4">
            <div className="max-w-2xl">
              <div
                className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium"
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  color: 'var(--app-text)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <Sparkles size={14} />
                Personalize your OpenClaw experience
              </div>

              <h1
                className="mt-2 text-3xl font-semibold leading-tight"
                style={{ color: 'var(--app-text)' }}
              >
                Settings
              </h1>
              <p
                className="mt-2 max-w-xl text-sm leading-7"
                style={{ color: 'var(--app-text-muted)' }}
              >
                用更轻松、直观的方式管理 OpenClaw 的桌面体验、连接方式和隐私偏好。
              </p>
            </div>

            <div
              className="relative flex h-11 items-center justify-end"
              onMouseEnter={onSearchExpand}
              onMouseLeave={onSearchBlur}
            >
              <div
                className={`absolute right-0 flex h-11 items-center overflow-hidden rounded-full transition-all duration-300 ${isSearchExpanded ? 'w-[320px] opacity-100' : 'w-11 opacity-0 pointer-events-none'}`}
                style={{
                  backgroundColor: 'var(--app-bg-elevated)',
                  border: '1px solid var(--app-border)',
                  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.10)',
                  backdropFilter: 'blur(12px)',
                }}
              >
                <Search
                  size={16}
                  className="ml-4 shrink-0"
                  style={{ color: 'var(--app-text-muted)' }}
                />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => onSearchChange(event.target.value)}
                  onFocus={onSearchExpand}
                  onBlur={onSearchBlur}
                  placeholder="搜索设置项..."
                  className="h-full flex-1 bg-transparent px-3 pr-4 text-sm focus:outline-none"
                  style={{ color: 'var(--app-text)' }}
                />
              </div>
              <AppIconButton
                tint="default"
                className="relative z-10 h-11 w-11 rounded-full"
                onMouseEnter={onSearchExpand}
                onFocus={onSearchExpand}
                aria-label="Search settings"
                style={{
                  background: 'var(--app-bg-elevated)',
                  border: '1px solid var(--app-border)',
                  color: 'var(--app-text)',
                  boxShadow: '0 8px 20px rgba(15, 23, 42, 0.10)',
                  backdropFilter: 'blur(12px)',
                }}
              >
                <Search size={18} />
              </AppIconButton>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap gap-2.5 text-sm">
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5"
              style={{
                backgroundColor: 'var(--app-bg-elevated)',
                color: 'var(--app-text)',
                boxShadow: '0 8px 20px rgba(15, 23, 42, 0.05)',
                backdropFilter: 'blur(10px)',
              }}
            >
              <span style={{ color: 'var(--app-text-muted)' }}>分类</span>
              <span className="font-semibold">{sections.length}</span>
            </div>
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5"
              style={{
                backgroundColor: 'var(--app-bg-elevated)',
                color: 'var(--app-text)',
                boxShadow: '0 8px 20px rgba(15, 23, 42, 0.05)',
                backdropFilter: 'blur(10px)',
              }}
            >
              <span style={{ color: 'var(--app-text-muted)' }}>结果</span>
              <span className="font-semibold">{filteredSections.length}</span>
            </div>
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5"
              style={{
                backgroundColor: 'var(--app-bg-elevated)',
                color: 'var(--app-text)',
                boxShadow: '0 8px 20px rgba(15, 23, 42, 0.05)',
                backdropFilter: 'blur(10px)',
              }}
            >
              <span style={{ color: 'var(--app-text-muted)' }}>高频</span>
              <span className="font-semibold truncate max-w-[120px]">
                {highlightedSections[0]?.name || '通用'}
              </span>
            </div>
          </div>
        </div>
      </GlassCard>

      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {filteredSections.map((section) => {
          const Icon = section.icon;
          const accent = sectionAccentMap[section.id] || sectionAccentMap.general;
          const isHighlighted = highlightedSections.some((item) => item.id === section.id);

          return (
            <GlassCard
              key={section.id}
              onClick={() => onOpenSection(section.id)}
              className="rounded-[20px] p-3.5 text-left"
              variant="default"
              style={{
                background: `linear-gradient(180deg, var(--app-bg-elevated) 0%, ${accent.bg} 100%)`,
                border: `1px solid ${isHighlighted ? accent.glow : 'var(--app-border)'}`,
                boxShadow: isHighlighted
                  ? `0 12px 26px ${accent.glow}`
                  : '0 8px 18px rgba(15, 23, 42, 0.06)',
              }}
            >
              <div className="flex min-h-[132px] h-full flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
                    style={{
                      backgroundColor: accent.bg,
                      color: accent.icon,
                      boxShadow: `0 8px 18px ${accent.glow}`,
                    }}
                  >
                    <Icon size={18} />
                  </div>

                  <div
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200"
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.06)',
                      color: accent.icon,
                      border: `1px solid ${accent.glow}`,
                    }}
                  >
                    <ChevronRight size={16} />
                  </div>
                </div>

                <div>
                  <div
                    className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium"
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.06)',
                      color: isHighlighted ? accent.icon : 'var(--app-text-muted)',
                    }}
                  >
                    {isHighlighted ? '热门入口' : '设置分类'}
                  </div>

                  <div
                    className="mt-2 text-[15px] font-semibold"
                    style={{ color: 'var(--app-text)' }}
                  >
                    {section.name}
                  </div>
                  <div
                    className="mt-1 text-[13px] leading-5 line-clamp-2"
                    style={{ color: 'var(--app-text-muted)' }}
                  >
                    {section.description}
                  </div>
                </div>

                <div className="mt-auto flex items-center justify-between gap-3 pt-0.5">
                  <div
                    className="text-[11px] font-medium uppercase tracking-[0.12em]"
                    style={{ color: 'var(--app-text-muted)' }}
                  >
                    Settings
                  </div>
                  <div className="text-xs font-semibold" style={{ color: accent.icon }}>
                    进入
                  </div>
                </div>
              </div>
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
};

export default SettingsHomeView;
