import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Power, 
  Minimize2, 
  Sun, 
  Moon, 
  Monitor, 
  Globe, 
  Bell, 
  Menu,
  AlertCircle,
  Check
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';

interface GeneralSettings {
  autoStart: boolean;
  startMinimized: boolean;
  appearance: 'system' | 'light' | 'dark';
  glassEffect: boolean;
  language: string;
  showTrayIcon: boolean;
  trayIconAction: 'openWindow' | 'showMenu';
}

const SettingsGeneral: React.FC = () => {
  const { setLanguage } = useI18n();
  const [settings, setSettings] = useState<GeneralSettings>({
    autoStart: false,
    startMinimized: false,
    appearance: 'system',
    glassEffect: true,
    language: 'system',
    showTrayIcon: true,
    trayIconAction: 'openWindow'
  });
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [availableLanguages] = useState([
    { code: 'system', name: 'Follow System', nativeName: '跟随系统' },
    { code: 'en', name: 'English', nativeName: 'English' },
    { code: 'zh', name: 'Chinese', nativeName: '简体中文' },
    { code: 'ja', name: 'Japanese', nativeName: '日本語' }
  ]);

  // 加载设置
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const result = await window.electronAPI.settingsGet();
      if (result.success && result.settings) {
        const savedSettings = result.settings as Partial<GeneralSettings>;
        setSettings(prev => ({
          ...prev,
          ...savedSettings
        }));
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const saveSettings = async (updates: Partial<GeneralSettings>) => {
    try {
      setIsSaving(true);
      const newSettings = { ...settings, ...updates };
      
      // 调用settingsSet API
      const result = await window.electronAPI.settingsSet(newSettings);
      
      if (result.success) {
        setSettings(newSettings);
        setMessage('Settings saved successfully!');
        
        // 应用语言设置
        if (updates.language && updates.language !== 'system') {
          setLanguage(updates.language as 'en' | 'zh');
        }
        
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage(`Error saving settings: ${result.error}`);
      }
    } catch (error: any) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSettingChange = (key: keyof GeneralSettings, value: any) => {
    const updates = { [key]: value };
    setSettings(prev => ({ ...prev, ...updates }));
    saveSettings(updates);
  };

  const handleResetSettings = () => {
    const defaultSettings: GeneralSettings = {
      autoStart: false,
      startMinimized: false,
      appearance: 'system',
      glassEffect: true,
      language: 'system',
      showTrayIcon: true,
      trayIconAction: 'openWindow'
    };
    setSettings(defaultSettings);
    saveSettings(defaultSettings);
  };

  const appearanceOptions = [
    { value: 'system', label: 'Follow System', icon: Monitor },
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon }
  ];

  const trayActionOptions = [
    { value: 'openWindow', label: 'Open Main Window' },
    { value: 'showMenu', label: 'Show Quick Menu' }
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 头部 */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--app-text)' }}>General Settings</h1>
          <p style={{ color: 'var(--app-text-muted)' }}>Application preferences and startup behavior</p>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={handleResetSettings}
            className="px-4 py-2 rounded-lg"
            style={{ backgroundColor: 'var(--app-bg-subtle)', color: 'var(--app-text)', border: '1px solid var(--app-border)' }}
          >
            Reset to Defaults
          </button>
        </div>
      </div>

      {message && (
        <div className={`mb-6 p-3 rounded-lg ${message.includes('Error') ? 'bg-red-900/30 border border-red-700 text-red-300' : 'bg-green-900/30 border border-green-700 text-green-300'}`}>
          {message}
        </div>
      )}

      {/* 主内容区 */}
      <div className="flex-1 overflow-y-auto pr-1">
        {/* 启动设置分组 */}
        <div className="rounded-lg p-6 border mb-6" style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)' }}>
          <div className="flex items-center gap-3 mb-4">
            <Power size={24} />
            <h2 className="text-xl font-semibold" style={{ color: 'var(--app-text)' }}>Startup Settings</h2>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg" style={{ backgroundColor: 'var(--app-bg-subtle)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(0, 180, 255, 0.1)' }}>
                  <Power size={20} className="text-tech-cyan" />
                </div>
                <div>
                  <h3 className="font-medium" style={{ color: 'var(--app-text)' }}>Auto-start on System Login</h3>
                  <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>Launch OpenClaw automatically when you log into your computer</p>
                </div>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.autoStart}
                  onChange={(e) => handleSettingChange('autoStart', e.target.checked)}
                  className="sr-only"
                />
                <div className={`switch-thumb ${settings.autoStart ? 'translate-x-5' : ''}`} />
              </label>
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg" style={{ backgroundColor: 'var(--app-bg-subtle)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(0, 224, 142, 0.1)' }}>
                  <Minimize2 size={20} className="text-tech-green" />
                </div>
                <div>
                  <h3 className="font-medium" style={{ color: 'var(--app-text)' }}>Start Minimized to Tray</h3>
                  <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>Launch application without showing the main window, only tray icon</p>
                </div>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.startMinimized}
                  onChange={(e) => handleSettingChange('startMinimized', e.target.checked)}
                  className="sr-only"
                  disabled={!settings.showTrayIcon}
                />
                <div className={`switch-thumb ${settings.startMinimized ? 'translate-x-5' : ''} ${!settings.showTrayIcon ? 'opacity-50' : ''}`} />
              </label>
            </div>

            {!settings.showTrayIcon && settings.startMinimized && (
              <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <div className="flex items-start gap-2">
                  <AlertCircle size={16} className="text-yellow-500 mt-0.5" />
                  <p className="text-sm text-yellow-400">
                    Start minimized requires tray icon to be enabled. Please enable tray icon first.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 外观设置分组 */}
        <div className="rounded-lg p-6 border mb-6" style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)' }}>
          <div className="flex items-center gap-3 mb-4">
            <Monitor size={24} />
            <h2 className="text-xl font-semibold" style={{ color: 'var(--app-text)' }}>Appearance</h2>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg" style={{ backgroundColor: 'var(--app-bg-subtle)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(168, 85, 247, 0.1)' }}>
                  <Settings size={20} className="text-purple-500" />
                </div>
                <div>
                  <h3 className="font-medium" style={{ color: 'var(--app-text)' }}>Appearance Mode</h3>
                  <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>Choose between light, dark, or follow system theme</p>
                </div>
              </div>
              
              <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: 'var(--app-segment-bg)' }}>
                {appearanceOptions.map(option => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.value}
                      onClick={() => handleSettingChange('appearance', option.value)}
                      className="flex items-center gap-2 px-3 py-2 rounded-md transition-all duration-200"
                      style={settings.appearance === option.value
                        ? {
                            backgroundColor: 'var(--app-segment-active-bg)',
                            color: option.value === 'light' ? '#10B981' : 
                                   option.value === 'dark' ? '#00B4FF' : 
                                   '#00D0B6',
                          }
                        : {
                            color: 'var(--app-text-muted)',
                          }}
                    >
                      <Icon size={16} />
                      <span className="text-sm">{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg" style={{ backgroundColor: 'var(--app-bg-subtle)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)' }}>
                  <div className="w-6 h-6 rounded-md bg-gradient-to-br from-blue-400 to-cyan-400"></div>
                </div>
                <div>
                  <h3 className="font-medium" style={{ color: 'var(--app-text)' }}>Glass Effect (Acrylic)</h3>
                  <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>Enable translucent glass-like effects for windows and panels</p>
                </div>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.glassEffect}
                  onChange={(e) => handleSettingChange('glassEffect', e.target.checked)}
                  className="sr-only"
                />
                <div className={`switch-thumb ${settings.glassEffect ? 'translate-x-5' : ''}`} />
              </label>
            </div>
          </div>
        </div>

        {/* 语言与状态栏设置分组 */}
        <div className="rounded-lg p-6 border mb-6" style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)' }}>
          <div className="flex items-center gap-3 mb-4">
            <Globe size={24} />
            <h2 className="text-xl font-semibold" style={{ color: 'var(--app-text)' }}>Language & Tray</h2>
          </div>
          
          <div className="space-y-4">
            <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--app-bg-subtle)' }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)' }}>
                  <Globe size={20} className="text-green-500" />
                </div>
                <div>
                  <h3 className="font-medium" style={{ color: 'var(--app-text)' }}>Language</h3>
                  <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>Choose your preferred language for the application interface</p>
                </div>
              </div>
              
              <select
                value={settings.language}
                onChange={(e) => handleSettingChange('language', e.target.value)}
                className="w-full px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-tech-cyan"
                style={{ backgroundColor: 'var(--app-bg-elevated)', border: '1px solid var(--app-border)', color: 'var(--app-text)' }}
              >
                {availableLanguages.map(lang => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name} ({lang.nativeName})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg" style={{ backgroundColor: 'var(--app-bg-subtle)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)' }}>
                  <Bell size={20} className="text-yellow-500" />
                </div>
                <div>
                  <h3 className="font-medium" style={{ color: 'var(--app-text)' }}>Show Tray Icon</h3>
                  <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>Display icon in system tray (menu bar on macOS)</p>
                </div>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.showTrayIcon}
                  onChange={(e) => handleSettingChange('showTrayIcon', e.target.checked)}
                  className="sr-only"
                />
                <div className={`switch-thumb ${settings.showTrayIcon ? 'translate-x-5' : ''}`} />
              </label>
            </div>

            {settings.showTrayIcon && (
              <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--app-bg-subtle)' }}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(139, 92, 246, 0.1)' }}>
                    <Menu size={20} className="text-purple-500" />
                  </div>
                  <div>
                    <h3 className="font-medium" style={{ color: 'var(--app-text)' }}>Tray Icon Click Action</h3>
                    <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>What happens when you click the tray icon</p>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  {trayActionOptions.map(option => (
                    <button
                      key={option.value}
                      onClick={() => handleSettingChange('trayIconAction', option.value)}
                      className={`flex-1 px-4 py-3 rounded-lg border transition-all duration-200 ${
                        settings.trayIconAction === option.value
                          ? 'border-tech-cyan bg-tech-cyan/10'
                          : 'border-transparent hover:border-tech-cyan/30'
                      }`}
                      style={{ 
                        backgroundColor: settings.trayIconAction === option.value 
                          ? 'var(--app-active-bg)' 
                          : 'var(--app-bg-elevated)',
                        color: 'var(--app-text)'
                      }}
                    >
                      <div className="text-left">
                        <div className="font-medium">{option.label}</div>
                        {settings.trayIconAction === option.value && (
                          <div className="flex items-center gap-1 mt-1 text-xs text-tech-cyan">
                            <Check size={12} />
                            <span>Selected</span>
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 性能提示 */}
        <div className="rounded-lg p-4 border" style={{ backgroundColor: 'rgba(59, 130, 246, 0.05)', borderColor: 'rgba(59, 130, 246, 0.2)' }}>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)' }}>
              <AlertCircle size={16} className="text-blue-500" />
            </div>
            <div>
              <h4 className="font-medium text-sm" style={{ color: 'var(--app-text)' }}>Performance Tips</h4>
              <ul className="text-xs space-y-1 mt-2" style={{ color: 'var(--app-text-muted)' }}>
                <li>• Glass effect may increase GPU usage on older hardware</li>
                <li>• Auto-start adds a login item that may slightly increase boot time</li>
                <li>• Starting minimized can help if you use OpenClaw as a background service</li>
                <li>• Changes may require restarting the application to take full effect</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsGeneral;