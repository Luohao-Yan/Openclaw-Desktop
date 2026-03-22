import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { translations } from './translations';

type Language = 'en' | 'zh';

/** 所有合法的翻译 key 类型，供子组件 props 使用 */
export type TranslationKey = keyof typeof translations.en;

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextType>({
  language: 'zh',
  setLanguage: () => {},
  t: (key) => key,
});

export function useI18n() {
  return useContext(I18nContext);
}

interface I18nProviderProps {
  children: ReactNode;
}

export function I18nProvider({ children }: I18nProviderProps) {
  const [language, setLanguage] = useState<Language>('zh');

  // 加载保存的语言设置
  useEffect(() => {
    const loadLanguage = async () => {
      try {
        if (window.electronAPI?.settingsGet) {
          const result = await window.electronAPI.settingsGet();
          if (result.success && result.settings) {
            const settings = result.settings as any;
            if (settings.language && settings.language !== 'system') {
              setLanguage(settings.language as Language);
            }
          }
        }
      } catch (error) {
        console.error('Failed to load language:', error);
      }
    };
    loadLanguage();
  }, []);

  // 保存语言设置
  const saveLanguage = async (lang: Language) => {
    try {
      if (window.electronAPI?.settingsSet) {
        await window.electronAPI.settingsSet({ language: lang });
      }
    } catch (error) {
      console.error('Failed to save language:', error);
    }
  };

  const handleSetLanguage = (lang: Language) => {
    setLanguage(lang);
    saveLanguage(lang);
  };

  const t = (key: keyof typeof translations.en): string => {
    return translations[language][key] || key;
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage: handleSetLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
}