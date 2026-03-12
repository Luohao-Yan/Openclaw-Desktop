import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

const getResolvedTheme = (theme: Theme) => {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }

  return theme;
};

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'system',
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');

  // 初始化时加载用户设置
  useEffect(() => {
    const loadTheme = async () => {
      try {
        if (window.electronAPI?.settingsGet) {
          const result = await window.electronAPI.settingsGet();
          if (result.success && result.settings && result.settings.theme) {
            setThemeState(result.settings.theme as Theme);
          }
        }
      } catch (error) {
        console.error('Failed to load theme:', error);
      }
    };
    loadTheme();
  }, []);

  // 保存主题到设置
  const setTheme = async (newTheme: Theme) => {
    setThemeState(newTheme);

    try {
      if (window.electronAPI?.settingsSet) {
        await window.electronAPI.settingsSet({ theme: newTheme });
      }
    } catch (error) {
      console.error('Failed to save theme:', error);
    }
  };

  // 应用主题 CSS class
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const themeValue = getResolvedTheme(theme);

    html.setAttribute('data-theme', themeValue);
    html.setAttribute('data-color-mode', themeValue);
    body.setAttribute('data-theme', themeValue);
  }, [theme]);

  // 监听系统主题变化
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      const html = document.documentElement;
      const body = document.body;
      const themeValue = mediaQuery.matches ? 'dark' : 'light';

      html.setAttribute('data-theme', themeValue);
      html.setAttribute('data-color-mode', themeValue);
      body.setAttribute('data-theme', themeValue);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);