import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Icon } from '@iconify/react';
import { Settings, ClipboardList, FileText, Sun, Moon, Monitor, ChevronLeft, ChevronRight, MessageSquare, Server, BookOpen } from 'lucide-react';
import { useDesktopRuntime } from '../contexts/DesktopRuntimeContext';
import { useTheme } from '../contexts/ThemeContext';
import { useI18n } from '../i18n/I18nContext';
import UserAvatar from './UserAvatar';

 const dashboardIcon = {
   body: '<g fill="none" stroke="currentColor" stroke-width="1"><path stroke-width="1.5" d="M2.5 12c0-4.478 0-6.717 1.391-8.109C5.282 2.5 7.521 2.5 12 2.5c4.478 0 6.718 0 8.109 1.391S21.5 7.521 21.5 12c0 4.478 0 6.718-1.391 8.109S16.479 21.5 12 21.5c-4.478 0-6.718 0-8.109-1.391S2.5 16.479 2.5 12Z"/><path stroke-linejoin="round" stroke-width="1.5" d="M2.5 9h19"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 6h.009M11 6h.009"/><path stroke-linecap="round" stroke-width="1.5" d="M17 17a5 5 0 0 0-10 0"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m12.707 15.293l-1.414 1.414"/></g>',
   width: 24,
   height: 24,
 };

 const aiUserIcon = {
   body: '<g fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M13 3.002Q12.295 3 11.5 3C7.022 3 4.782 3 3.391 4.391S2 8.021 2 12.5c0 4.478 0 6.718 1.391 8.109S7.021 22 11.5 22c4.478 0 6.718 0 8.109-1.391S21 16.979 21 12.5q0-.795-.002-1.5"/><path stroke-linejoin="round" d="m18.5 2l.258.697c.338.914.507 1.371.84 1.704c.334.334.791.503 1.705.841L22 5.5l-.697.258c-.914.338-1.371.507-1.704.84c-.334.334-.503.791-.841 1.705L18.5 9l-.258-.697c-.338-.914-.507-1.371-.84-1.704c-.334-.334-.791-.503-1.705-.841L15 5.5l.697-.258c.914-.338 1.371-.507 1.704-.84c.334-.334.503-.791.841-1.705z"/><path stroke-linecap="round" d="M7 17.5c2.332-2.442 6.643-2.557 9 0M13.995 10c0 1.38-1.12 2.5-2.503 2.5A2.5 2.5 0 0 1 8.988 10c0-1.38 1.12-2.5 2.504-2.5a2.5 2.5 0 0 1 2.503 2.5Z"/></g>',
   width: 24,
   height: 24,
 };

const Sidebar: React.FC = () => {
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  const { runtimeInfo } = useDesktopRuntime();
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(220);
  const [hoveredMenuItem, setHoveredMenuItem] = useState<string | null>(null);
  const appVersionLabel = runtimeInfo?.appVersionLabel
    || `v${runtimeInfo?.appVersion || '0.0.0'}`;
  const isPreviewVersion = runtimeInfo?.channel === 'preview'
    || /preview/i.test(runtimeInfo?.appVersion || '');
  const accountName = runtimeInfo?.userName?.trim() || t('openclawDesktop');
  const accountSubtitle = runtimeInfo?.userName?.trim()
    ? t('desktopClient')
    : t('openclawDesktop');
  
  // 加载侧边栏设置
  useEffect(() => {
    const loadSidebarSettings = async () => {
      try {
        const result = await window.electronAPI.settingsGet();
        if (result.success && result.settings) {
          if (result.settings.sidebarCollapsed !== undefined) {
            setCollapsed(result.settings.sidebarCollapsed);
          }
          if (result.settings.sidebarWidth !== undefined) {
            setSidebarWidth(result.settings.sidebarWidth);
          }
        }
      } catch (error) {
        console.error('Failed to load sidebar settings:', error);
      }
    };
    loadSidebarSettings();
  }, []);
  
  // 保存侧边栏设置
  const saveSidebarSettings = async (newCollapsed: boolean, newWidth: number) => {
    try {
      if (window.electronAPI?.settingsSet) {
        await window.electronAPI.settingsSet({
          sidebarCollapsed: newCollapsed,
          sidebarWidth: newWidth,
        });
      }
    } catch (error) {
      console.error('Failed to save sidebar settings:', error);
    }
  };
  
  const handleToggleCollapse = () => {
    const newCollapsed = !collapsed;
    setCollapsed(newCollapsed);
    saveSidebarSettings(newCollapsed, sidebarWidth);
  };
  
  
  
  const menuItems = [
    { path: '/', label: t('dashboard'), iconData: dashboardIcon },
    { path: '/instances', label: t('instances'), icon: Server },
    { path: '/sessions', label: t('sessions'), icon: MessageSquare },
    { path: '/agents', label: t('agents'), iconData: aiUserIcon },
    { path: '/skills', label: t('skills'), icon: BookOpen },
    { path: '/settings', label: t('config'), icon: Settings },
    { path: '/tasks', label: t('tasks'), icon: ClipboardList },
    { path: '/logs', label: t('logs'), icon: FileText },
  ];

  const isMenuItemActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }

    if (path === '/agents') {
      return location.pathname === '/agents'
        || location.pathname.startsWith('/agent-workspace/');
    }

    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  const getThemeToggleStyle = (
    option: 'light' | 'dark' | 'system',
  ): React.CSSProperties => {
    const activeColorMap = {
      light: '#F59E0B',
      dark: '#6366F1',
      system: '#00B4FF',
    } as const;

    if (theme === option) {
      return {
        background: 'var(--app-segment-tab-active-bg)',
        border: '1px solid var(--app-segment-tab-active-border)',
        boxShadow: 'var(--app-segment-tab-active-shadow)',
        color: activeColorMap[option],
      };
    }

    return {
      backgroundColor: 'transparent',
      border: '1px solid transparent',
      color: 'var(--app-segment-tab-inactive-text)',
    };
  };

  return (
    <aside 
      className="relative z-30 h-full flex flex-col overflow-visible transition-all duration-300 ease-out border-r"
      style={{
        width: collapsed ? 72 : sidebarWidth,
        backgroundColor: 'var(--app-bg-elevated)',
        borderColor: 'var(--app-border)',
        color: 'var(--app-text)',
      }}
    >
      {/* 导航菜单 */}
      <nav className="flex-1 overflow-visible p-3 pt-4">
        <div className="space-y-1 overflow-visible">
          {menuItems.map((item) => {
            const isActive = isMenuItemActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`
                  group relative flex items-center gap-3 px-3 py-2.5 rounded-xl border
                  transition-all duration-200 ease-out cursor-pointer
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-0
                  ${isActive 
                    ? 'hover:scale-[1.01]' 
                    : 'hover:scale-[1.02]'
                  }
                  ${collapsed ? 'justify-center' : ''}
                `}
                style={isActive
                  ? {
                      background: 'var(--app-active-bg)',
                      borderColor: 'var(--app-active-border)',
                      color: 'var(--app-active-text)',
                      boxShadow: '0 0 0 2px transparent',
                    }
                  : {
                      borderColor: 'transparent',
                      color: 'var(--app-text-muted)',
                      boxShadow: '0 0 0 2px transparent',
                    }}
                aria-label={item.label}
                title={collapsed ? item.label : undefined}
                onMouseEnter={() => setHoveredMenuItem(item.path)}
                onMouseLeave={() => setHoveredMenuItem((current) => current === item.path ? null : current)}
                onFocus={() => setHoveredMenuItem(item.path)}
                onBlur={() => setHoveredMenuItem((current) => current === item.path ? null : current)}
                onMouseDown={(event) => {
                  event.currentTarget.style.outline = 'none';
                  event.currentTarget.style.boxShadow = '0 0 0 2px transparent';
                }}
                onFocusCapture={(event) => {
                  event.currentTarget.style.outline = 'none';
                  event.currentTarget.style.boxShadow = '0 0 0 2px var(--app-active-border)';
                }}
                onBlurCapture={(event) => {
                  event.currentTarget.style.outline = 'none';
                  event.currentTarget.style.boxShadow = '0 0 0 2px transparent';
                }}
              >
                {/* 左侧高亮条 - 选中状态 */}
                {isActive && (
                  <div className="absolute left-0 w-1 h-8 bg-gradient-to-b from-tech-cyan to-tech-green rounded-r-full" />
                )}
                
                {/* 图标 */}
                {item.iconData ? (
                  <Icon
                    icon={item.iconData}
                    width={20}
                    height={20}
                    className={`flex-shrink-0 transition-transform duration-200 ${isActive ? 'text-tech-cyan' : 'group-hover:scale-110'}`}
                  />
                ) : item.icon ? (
                  <item.icon 
                    size={20} 
                    className={`flex-shrink-0 transition-transform duration-200 
                              ${isActive ? 'text-tech-cyan' : 'group-hover:scale-110'}`}
                  />
                ) : null}
                
                {/* 文字 */}
                {!collapsed && (
                  <span className={`font-medium text-sm truncate transition-colors
                    ${isActive ? '' : ''}`}
                    style={isActive
                      ? { color: 'var(--app-active-text)' }
                      : { color: 'var(--app-text-muted)' }}
                  >
                    {item.label}
                  </span>
                )}

                {collapsed && hoveredMenuItem === item.path && (
                  <div
                    className="pointer-events-none absolute left-full top-1/2 z-[100] ml-3 -translate-y-1/2 rounded-lg border px-3 py-1.5 text-xs font-medium whitespace-nowrap shadow-lg"
                    style={{
                      backgroundColor: 'var(--app-bg-elevated)',
                      borderColor: 'var(--app-border)',
                      color: isActive
                        ? 'var(--app-active-text)'
                        : 'var(--app-text)',
                    }}
                  >
                    {item.label}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </nav>
      
      {/* 底部区域 */}
      <div className={`
        p-4 border-t
        ${collapsed ? 'space-y-3' : 'space-y-4'}
      `}
      style={{ borderColor: 'var(--app-border)' }}>
        {/* 主题切换 - 使用三个图标按钮并排 */}
        {!collapsed && (
          <div className="w-full">
            <div className="text-xs mb-2 font-medium px-1 truncate" style={{ color: 'var(--app-text-muted)' }}>{t('theme')}</div>
            <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: 'var(--app-segment-bg)' }}>
              <button
                onClick={() => setTheme('light')}
                className="flex-1 flex items-center justify-center rounded-md border p-2 transition-all duration-200 cursor-pointer"
                style={getThemeToggleStyle('light')}
                title={t('light')}
              >
                <Sun size={16} />
              </button>
              <button
                onClick={() => setTheme('dark')}
                className="flex-1 flex items-center justify-center rounded-md border p-2 transition-all duration-200 cursor-pointer"
                style={getThemeToggleStyle('dark')}
                title={t('dark')}
              >
                <Moon size={16} />
              </button>
              <button
                onClick={() => setTheme('system')}
                className="flex-1 flex items-center justify-center rounded-md border p-2 transition-all duration-200 cursor-pointer"
                style={getThemeToggleStyle('system')}
                title={t('system')}
              >
                <Monitor size={16} />
              </button>
            </div>
          </div>
        )}

        {/* 折叠状态下的小型主题切换 */}
        {collapsed && (
          <div className="flex flex-col gap-2 items-center">
            <button
              onClick={() => setTheme('light')}
              className="rounded-lg border p-2 transition-all duration-200 cursor-pointer"
              style={getThemeToggleStyle('light')}
              title={t('light')}
            >
              <Sun size={16} />
            </button>
            <button
              onClick={() => setTheme('dark')}
              className="rounded-lg border p-2 transition-all duration-200 cursor-pointer"
              style={getThemeToggleStyle('dark')}
              title={t('dark')}
            >
              <Moon size={16} />
            </button>
            <button
              onClick={() => setTheme('system')}
              className="rounded-lg border p-2 transition-all duration-200 cursor-pointer"
              style={getThemeToggleStyle('system')}
              title={t('system')}
            >
              <Monitor size={16} />
            </button>
          </div>
        )}
        
        {/* 身份信息 */}
        {!collapsed && (
          <div
            className="rounded-2xl border p-3"
            style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)',
              borderColor: 'var(--app-border)',
              boxShadow: '0 10px 30px rgba(0, 0, 0, 0.18)',
            }}
          >
            <div className="flex items-start gap-3">
              <UserAvatar 
                size="md" 
                showDropdown={true}
                onMenuClick={(action) => {
                  console.log('User menu action:', action);
                  // 这里可以处理菜单点击事件
                }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold" style={{ color: 'var(--app-text)' }}>
                      {accountName}
                    </div>
                    <div className="mt-0.5 truncate text-xs" style={{ color: 'var(--app-text-muted)' }}>
                      {accountSubtitle}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 版本号卡片：上下分栏布局 */}
        {!collapsed && (
          <div
            className="rounded-xl border overflow-hidden"
            style={{
              backgroundColor: 'rgba(255,255,255,0.02)',
              borderColor: 'var(--app-border)',
            }}
          >
            {/* 上栏：VERSION 标签 */}
            <div className="px-3 py-1.5 border-b" style={{ borderColor: 'var(--app-border)' }}>
              <div className="text-[10px] font-medium uppercase tracking-[0.08em]" style={{ color: 'var(--app-text-muted)' }}>
                {t('version')}
              </div>
            </div>

            {/* 下栏：版本号和徽章 */}
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="truncate text-sm font-medium" style={{ color: 'var(--app-text)' }}>
                {appVersionLabel}
              </div>
              {isPreviewVersion && (
                <span
                  className="inline-flex flex-shrink-0 items-center rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]"
                  style={{
                    backgroundColor: 'rgba(0, 180, 255, 0.12)',
                    borderColor: 'rgba(0, 180, 255, 0.28)',
                    color: '#00B4FF',
                  }}
                >
                  {t('previewBadge')}
                </span>
              )}
            </div>
          </div>
        )}
        
        {/* 折叠/展开按钮 */}
        <button
          onClick={handleToggleCollapse}
          className={`
            p-2 rounded-lg hover:scale-105
            flex items-center justify-center w-full
            transition-all duration-200 cursor-pointer
          `}
          style={{
            color: 'var(--app-text-muted)',
            backgroundColor: 'transparent',
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.backgroundColor = 'var(--app-hover)';
            event.currentTarget.style.color = 'var(--app-text)';
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.backgroundColor = 'transparent';
            event.currentTarget.style.color = 'var(--app-text-muted)';
          }}
          title={collapsed ? t('expandSidebar') : t('collapseSidebar')}
        >
          {collapsed ? (
            <ChevronRight size={18} className="transition-transform duration-200" />
          ) : (
            <ChevronLeft size={18} className="transition-transform duration-200" />
          )}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;