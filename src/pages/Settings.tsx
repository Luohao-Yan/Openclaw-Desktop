import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import RuntimeUpdateNotice from '../components/RuntimeUpdateNotice';
import { useDesktopRuntime } from '../contexts/DesktopRuntimeContext';
import SettingsDetailView from './settings/SettingsDetailView';
import SettingsHomeView from './settings/SettingsHomeView';
import { useSettingsSections } from './settings/sections';

const Settings: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    repairCapabilityAvailable,
    runtimeInfo,
  } = useDesktopRuntime();
  const [activeSection, setActiveSection] = useState<string>('general');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [hoveredQuickAction, setHoveredQuickAction] = useState<string | null>(null);

  const sections = useSettingsSections();

  const filteredSections = sections.filter(section => 
    section.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    section.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const requestedSection = searchParams.get('section');
  const activeSectionData = sections.find(s => s.id === activeSection);
  const highlightedSections = filteredSections.slice(0, 3);
  const isDetailView = Boolean(requestedSection && activeSectionData);

  useEffect(() => {
    if (!requestedSection) {
      return;
    }

    const matchedSection = sections.find((section) => section.id === requestedSection);
    if (matchedSection) {
      setActiveSection(matchedSection.id);
    }
  }, [searchParams, sections]);

  const openSection = (sectionId: string) => {
    setActiveSection(sectionId);
    setSearchParams({ section: sectionId });
  };

  const backToSettingsHome = () => {
    setSearchParams({});
  };

  const clearSearchIfCollapsed = () => {
    if (!searchTerm.trim()) {
      setIsSearchExpanded(false);
    }
  };

  return (
    /* 页面内容区域：使用 page-content 统一内边距 --space-6 */
    <div className={`flex flex-col page-content ${isDetailView ? 'h-full overflow-hidden' : 'h-full overflow-y-auto'}`}>
      {!repairCapabilityAvailable && runtimeInfo && (
        <RuntimeUpdateNotice className="mb-4 shrink-0" runtimeInfo={runtimeInfo} />
      )}

      {!isDetailView ? (
        <SettingsHomeView
          sections={sections}
          filteredSections={filteredSections}
          highlightedSections={highlightedSections}
          searchTerm={searchTerm}
          isSearchExpanded={isSearchExpanded}
          hoveredQuickAction={hoveredQuickAction}
          onOpenSection={openSection}
          onSearchChange={setSearchTerm}
          onSearchExpand={() => setIsSearchExpanded(true)}
          onSearchBlur={clearSearchIfCollapsed}
          onQuickActionHover={setHoveredQuickAction}
        />
      ) : (
        // detail view 撑满剩余高度，内部自行滚动
        <div className="flex-1 min-h-0">
          <SettingsDetailView
            activeSection={activeSectionData}
            onBack={backToSettingsHome}
          />
        </div>
      )}
    </div>
  );
};

export default Settings;