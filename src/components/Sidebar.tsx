import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BarChart, Settings, ClipboardList, FileText, Sun, Moon, Monitor, ChevronLeft, ChevronRight, User, MessageSquare, Server, BookOpen } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useI18n } from '../i18n/I18nContext';

const Sidebar: React.FC = () => {
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(220);
  
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
    { path: '/', label: t('dashboard'), icon: BarChart },
    { path: '/instances', label: t('instances'), icon: Server },
    { path: '/sessions', label: t('sessions'), icon: MessageSquare },
    { path: '/agents', label: t('agents'), icon: User },
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

  return (
    <aside 
      className="h-full flex flex-col transition-all duration-300 ease-out border-r"
      style={{
        width: collapsed ? 72 : sidebarWidth,
        backgroundColor: 'var(--app-bg-elevated)',
        borderColor: 'var(--app-border)',
        color: 'var(--app-text)',
      }}
    >
      {/* 导航菜单 */}
      <nav className="flex-1 p-3 pt-4">
        <div className="space-y-1">
          {menuItems.map((item) => {
            const isActive = isMenuItemActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`
                  group flex items-center gap-3 px-3 py-2.5 rounded-xl
                  transition-all duration-200 ease-out cursor-pointer
                  ${isActive 
                    ? 'border hover:scale-[1.01]' 
                    : 'hover:scale-[1.02]'
                  }
                  ${collapsed ? 'justify-center' : ''}
                `}
                style={isActive
                  ? {
                      background: 'var(--app-active-bg)',
                      borderColor: 'var(--app-active-border)',
                      color: 'var(--app-active-text)',
                    }
                  : {
                      color: 'var(--app-text-muted)',
                    }}
                title={collapsed ? item.label : undefined}
              >
                {/* 左侧高亮条 - 选中状态 */}
                {isActive && (
                  <div className="absolute left-0 w-1 h-8 bg-gradient-to-b from-tech-cyan to-tech-green rounded-r-full" />
                )}
                
                {/* 图标 */}
                <item.icon 
                  size={20} 
                  className={`flex-shrink-0 transition-transform duration-200 
                              ${isActive ? 'text-tech-cyan' : 'group-hover:scale-110'}`}
                />
                
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
                className="flex-1 flex items-center justify-center p-2 rounded-md transition-all duration-200 cursor-pointer"
                style={theme === 'light'
                  ? {
                      backgroundColor: 'var(--app-segment-active-bg)',
                      color: '#10B981',
                    }
                  : {
                      color: 'var(--app-text-muted)',
                    }}
                title={t('light')}
              >
                <Sun size={16} />
              </button>
              <button
                onClick={() => setTheme('dark')}
                className="flex-1 flex items-center justify-center p-2 rounded-md transition-all duration-200 cursor-pointer"
                style={theme === 'dark'
                  ? {
                      backgroundColor: 'var(--app-segment-active-bg)',
                      color: '#00B4FF',
                    }
                  : {
                      color: 'var(--app-text-muted)',
                    }}
                title={t('dark')}
              >
                <Moon size={16} />
              </button>
              <button
                onClick={() => setTheme('system')}
                className="flex-1 flex items-center justify-center p-2 rounded-md transition-all duration-200 cursor-pointer"
                style={theme === 'system'
                  ? {
                      backgroundColor: 'var(--app-segment-active-bg)',
                      color: '#00D0B6',
                    }
                  : {
                      color: 'var(--app-text-muted)',
                    }}
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
              className="p-2 rounded-lg transition-all duration-200 cursor-pointer"
              style={theme === 'light'
                ? {
                    backgroundColor: 'var(--app-segment-active-bg)',
                    color: '#10B981',
                  }
                : {
                    color: 'var(--app-text-muted)',
                  }}
              title={t('light')}
            >
              <Sun size={16} />
            </button>
            <button
              onClick={() => setTheme('dark')}
              className="p-2 rounded-lg transition-all duration-200 cursor-pointer"
              style={theme === 'dark'
                ? {
                    backgroundColor: 'var(--app-segment-active-bg)',
                    color: '#00B4FF',
                  }
                : {
                    color: 'var(--app-text-muted)',
                  }}
              title={t('dark')}
            >
              <Moon size={16} />
            </button>
            <button
              onClick={() => setTheme('system')}
              className="p-2 rounded-lg transition-all duration-200 cursor-pointer"
              style={theme === 'system'
                ? {
                    backgroundColor: 'var(--app-segment-active-bg)',
                    color: '#00D0B6',
                  }
                : {
                    color: 'var(--app-text-muted)',
                  }}
              title={t('system')}
            >
              <Monitor size={16} />
            </button>
          </div>
        )}
        
        {/* 用户信息 */}
        {!collapsed && (
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-tech-cyan to-tech-green 
                          flex items-center justify-center flex-shrink-0">
              <User size={14} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate" style={{ color: 'var(--app-text)' }}>{t('user')}</div>
              <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>{t('version')}</div>
            </div>
          </div>
        )}
        
        {/* 折叠/展开按钮 */}
        <button
          onClick={handleToggleCollapse}
          className={`
            p-2 rounded-lg text-zinc-500 
            hover:bg-white/10 hover:text-white hover:scale-105
            flex items-center justify-center w-full
            transition-all duration-200 cursor-pointer
          `}
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