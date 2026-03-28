import React from 'react';
import { ArrowLeft } from 'lucide-react';
import AppButton from '../../components/AppButton';
import { sectionAccentMap } from './constants';
import type { SettingsSection } from './types';

interface SettingsDetailViewProps {
  activeSection: SettingsSection | undefined;
  onBack: () => void;
}

const SettingsDetailView: React.FC<SettingsDetailViewProps> = ({
  activeSection,
  onBack,
}) => {
  if (!activeSection) {
    return null;
  }

  const ActiveComponent = activeSection.component;
  const accent = sectionAccentMap[activeSection.id] || sectionAccentMap.general;
  const ActiveIcon = activeSection.icon;

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4 flex items-center gap-3 shrink-0 relative z-10">
        <AppButton
          variant="secondary"
          onClick={onBack}
          icon={<ArrowLeft size={16} />}
        >
          返回设置
        </AppButton>

        <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
          Settings / {activeSection.name}
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto rounded-[24px] border"
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.02)',
          borderColor: 'var(--app-border)',
        }}
      >
        <div className="h-full px-5 py-5 lg:px-6">
          {ActiveComponent ? (
            <ActiveComponent />
          ) : (
            <div className="flex min-h-[360px] items-center justify-center">
              <div className="max-w-md text-center">
                <div
                  className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: accent.bg }}
                >
                  <div style={{ color: accent.icon }}>
                    <ActiveIcon size={28} />
                  </div>
                </div>
                <h3
                  className="text-xl font-semibold"
                  style={{ color: 'var(--app-text)' }}
                >
                  即将上线
                </h3>
                <p
                  className="mt-3 text-sm leading-7"
                  style={{ color: 'var(--app-text-muted)' }}
                >
                  {activeSection.name}
                  {' '}
                  相关设置正在整理中，后续会以更完整、更易用的方式开放给你。
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsDetailView;
