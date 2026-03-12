import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Settings as SettingsIcon,
  MessageSquare,
  Mic,
  Folder,
  Puzzle,
  Bell,
  Shield,
  Info,
  Cpu,
  FileText,
  Search
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import SettingsGeneral from './SettingsGeneral';

interface SettingsSection {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ size?: number }>;
  component?: React.ComponentType;
  translateKey: string;
}

const Settings: React.FC = () => {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const [activeSection, setActiveSection] = useState<string>('general');
  const [searchTerm, setSearchTerm] = useState('');

  const sections: SettingsSection[] = [
    { 
      id: 'general', 
      name: t('settings.general'), 
      description: t('settings.generalDescription'), 
      icon: SettingsIcon,
      component: SettingsGeneral,
      translateKey: 'general'
    },
    { 
      id: 'channels', 
      name: t('settings.channels'), 
      description: t('settings.channelsDescription'), 
      icon: MessageSquare,
      translateKey: 'channels'
    },
    { 
      id: 'voice', 
      name: t('settings.voice'), 
      description: t('settings.voiceDescription'), 
      icon: Mic,
      translateKey: 'voice'
    },
    { 
      id: 'config', 
      name: t('settings.config'), 
      description: t('settings.configDescription'), 
      icon: Folder,
      translateKey: 'config'
    },
    { 
      id: 'extensions', 
      name: t('settings.extensions'), 
      description: t('settings.extensionsDescription'), 
      icon: Puzzle,
      translateKey: 'extensions'
    },
    { 
      id: 'notifications', 
      name: t('settings.notifications'), 
      description: t('settings.notificationsDescription'), 
      icon: Bell,
      translateKey: 'notifications'
    },
    { 
      id: 'privacy', 
      name: t('settings.privacy'), 
      description: t('settings.privacyDescription'), 
      icon: Shield,
      translateKey: 'privacy'
    },
    { 
      id: 'about', 
      name: t('settings.about'), 
      description: t('settings.aboutDescription'), 
      icon: Info,
      translateKey: 'about'
    },
    { 
      id: 'advanced', 
      name: t('settings.advanced'), 
      description: t('settings.advancedDescription'), 
      icon: Cpu,
      translateKey: 'advanced'
    },
    { 
      id: 'logs', 
      name: t('settings.logs'), 
      description: t('settings.logsDescription'), 
      icon: FileText,
      translateKey: 'logs'
    },
  ];

  const filteredSections = sections.filter(section => 
    section.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    section.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeSectionData = sections.find(s => s.id === activeSection);

  useEffect(() => {
    const requestedSection = searchParams.get('section');
    if (!requestedSection) {
      return;
    }

    const matchedSection = sections.find((section) => section.id === requestedSection);
    if (matchedSection) {
      setActiveSection(matchedSection.id);
    }
  }, [searchParams, sections]);

  return (
    <div className="flex flex-col h-full p-6 overflow-hidden">
      {/* 头部 */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--app-text)' }}>Settings</h1>
          <p style={{ color: 'var(--app-text-muted)' }}>Configure OpenClaw Desktop to your preferences</p>
        </div>
      </div>

      {/* 搜索框 */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2" size={18} style={{ color: 'var(--app-text-muted)' }} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search settings..."
            className="w-full pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-tech-cyan"
            style={{ backgroundColor: 'var(--app-bg-elevated)', border: '1px solid var(--app-border)', color: 'var(--app-text)' }}
          />
        </div>
      </div>

      <div className="flex flex-1 gap-6 min-h-0 overflow-hidden">
        {/* 左侧导航 */}
        <div className="w-64 shrink-0 rounded-lg border h-full overflow-y-auto" style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)' }}>
          <div className="p-4 border-b" style={{ borderColor: 'var(--app-border)' }}>
            <h3 className="font-semibold text-sm" style={{ color: 'var(--app-text-muted)' }}>SETTINGS CATEGORIES</h3>
          </div>
          
          <div className="p-2">
            {filteredSections.map(section => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;
              
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className="w-full text-left px-3 py-3 rounded-lg transition-all duration-200 flex items-center gap-3 mb-1"
                  style={isActive
                    ? {
                        background: 'var(--app-active-bg)',
                        color: 'var(--app-active-text)',
                        border: '1px solid var(--app-active-border)',
                      }
                    : {
                        color: 'var(--app-text)',
                      }}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" 
                    style={isActive
                      ? { backgroundColor: 'rgba(255, 255, 255, 0.1)' }
                      : { backgroundColor: 'var(--app-bg-subtle)' }}>
                    <Icon size={18} />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{section.name}</div>
                    <div className="text-xs truncate" style={{ color: isActive ? 'var(--app-active-text)' : 'var(--app-text-muted)' }}>
                      {section.description}
                    </div>
                  </div>
                  
                  {isActive && (
                    <div className="w-2 h-2 rounded-full bg-tech-cyan flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 右侧内容区 */}
        <div className="flex-1 min-w-0 h-full overflow-y-auto pr-1">
          {activeSectionData ? (
            <div className="rounded-lg border h-full overflow-hidden" style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)' }}>
              <div className="p-6 border-b" style={{ borderColor: 'var(--app-border)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(0, 180, 255, 0.1)' }}>
                    <div style={{ color: '#00B4FF' }}>
                      <activeSectionData.icon size={20} />
                    </div>
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold" style={{ color: 'var(--app-text)' }}>{activeSectionData.name}</h2>
                    <p style={{ color: 'var(--app-text-muted)' }}>{activeSectionData.description}</p>
                  </div>
                </div>
              </div>
              
              <div className="p-6">
                {activeSectionData.component ? (
                  <activeSectionData.component />
                ) : (
                  <div className="text-center py-12">
                    <div className="mx-auto mb-4 flex justify-center">
                      <activeSectionData.icon size={48} />
                    </div>
                    <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--app-text)' }}>Coming Soon</h3>
                    <p style={{ color: 'var(--app-text-muted)' }}>
                      {activeSectionData.name} settings are under development
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border h-full flex items-center justify-center" style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)' }}>
              <div className="text-center p-8">
                <div className="mx-auto mb-4 flex justify-center">
                  <SettingsIcon size={48} />
                </div>
                <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--app-text)' }}>Select a Setting Category</h3>
                <p style={{ color: 'var(--app-text-muted)' }}>
                  Choose from the left sidebar to configure specific settings
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;