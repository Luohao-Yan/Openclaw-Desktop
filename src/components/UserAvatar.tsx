import React, { useState, useRef, useEffect } from 'react';
import { useDesktopRuntime } from '../contexts/DesktopRuntimeContext';
import { useI18n } from '../i18n/I18nContext';
import { 
  User, 
  Settings, 
  LogOut, 
  UserCircle, 
  Upload, 
  Globe, 
  Check, 
  X, 
  Camera,
  ChevronDown
} from 'lucide-react';

interface UserAvatarProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showDropdown?: boolean;
  onMenuClick?: (action: string) => void;
}

interface UserProfile {
  name?: string;
  email?: string;
  avatarUrl?: string;
  avatarType?: 'default' | 'gravatar' | 'custom';
  gravatarEmail?: string;
  theme?: 'light' | 'dark' | 'system';
}

const UserAvatar: React.FC<UserAvatarProps> = ({ 
  className = '', 
  size = 'md',
  showDropdown = true,
  onMenuClick
}) => {
  const { runtimeInfo } = useDesktopRuntime();
  const { t } = useI18n();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showAvatarOptions, setShowAvatarOptions] = useState(false);
  const [gravatarEmail, setGravatarEmail] = useState('');
  const [isGravatarLoading, setIsGravatarLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const accountName = runtimeInfo?.userName?.trim() || t('openclawDesktop');
  const avatarText = accountName.slice(0, 2).toUpperCase();

  // 尺寸映射
  const sizeClasses = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-12 w-12 text-base'
  };

  // 加载用户配置
  useEffect(() => {
    const loadUserProfile = async () => {
      try {
        const savedProfile = await window.electronAPI?.settingsGet?.();
        if (savedProfile?.success && savedProfile.settings?.userProfile) {
          setUserProfile(savedProfile.settings.userProfile as UserProfile);
        }
      } catch (error) {
        console.error('Failed to load user profile:', error);
      }
    };
    loadUserProfile();
  }, []);

  // 保存用户配置
  const saveUserProfile = async (profile: UserProfile) => {
    try {
      if (window.electronAPI?.settingsSet) {
        await window.electronAPI.settingsSet({
          userProfile: profile
        });
      }
    } catch (error) {
      console.error('Failed to save user profile:', error);
    }
  };

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
        setShowAvatarOptions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 获取 Gravatar 头像 URL
  const getGravatarUrl = (email: string, size: number = 200) => {
    const trimmedEmail = email.trim().toLowerCase();
    
    // 使用简单的 MD5 哈希函数
    const md5 = (str: string): string => {
      let hash = '';
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash += ((char >> 4) & 0xf).toString(16) + (char & 0xf).toString(16);
      }
      return hash;
    };
    
    const hash = md5(trimmedEmail);
    return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=identicon`;
  };

  // 验证 Gravatar 是否存在
  const checkGravatarExists = async (email: string): Promise<boolean> => {
    try {
      const url = getGravatarUrl(email, 1);
      const response = await fetch(url, { method: 'HEAD' });
      return response.ok && response.headers.get('content-length') !== '0';
    } catch (error) {
      console.error('Failed to check Gravatar:', error);
      return false;
    }
  };

  // 设置 Gravatar 头像
  const handleSetGravatar = async () => {
    if (!gravatarEmail.trim()) return;

    setIsGravatarLoading(true);
    try {
      const exists = await checkGravatarExists(gravatarEmail);
      if (exists) {
        const newProfile: UserProfile = {
          name: accountName,
          email: gravatarEmail,
          avatarUrl: getGravatarUrl(gravatarEmail),
          avatarType: 'gravatar',
          gravatarEmail: gravatarEmail
        };
        setUserProfile(newProfile);
        await saveUserProfile(newProfile);
        setShowAvatarOptions(false);
        setGravatarEmail('');
      } else {
        alert(t('gravatarNotFound') || 'Gravatar not found for this email');
      }
    } catch (error) {
      console.error('Failed to set Gravatar:', error);
      alert(t('gravatarError') || 'Error setting Gravatar');
    } finally {
      setIsGravatarLoading(false);
    }
  };

  // 处理文件上传
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // 验证文件类型
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      alert(t('invalidImageType') || 'Please upload a valid image (JPEG, PNG, GIF, WebP)');
      return;
    }

    // 验证文件大小 (最大 2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert(t('imageTooLarge') || 'Image must be less than 2MB');
      return;
    }

    setIsUploading(true);
    try {
      // 读取文件为 base64
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result as string;
        
        const newProfile: UserProfile = {
          name: accountName,
          avatarUrl: base64String,
          avatarType: 'custom'
        };
        setUserProfile(newProfile);
        await saveUserProfile(newProfile);
        setShowAvatarOptions(false);
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Failed to upload image:', error);
      alert(t('uploadError') || 'Failed to upload image');
      setIsUploading(false);
    }
  };

  // 重置为默认头像
  const handleResetToDefault = async () => {
    const newProfile: UserProfile = {
      name: accountName,
      avatarType: 'default'
    };
    setUserProfile(newProfile);
    await saveUserProfile(newProfile);
    setShowAvatarOptions(false);
  };

  // 获取当前头像 URL
  const getAvatarUrl = () => {
    if (userProfile?.avatarType === 'gravatar' && userProfile.avatarUrl) {
      return userProfile.avatarUrl;
    }
    if (userProfile?.avatarType === 'custom' && userProfile.avatarUrl) {
      return userProfile.avatarUrl;
    }
    return null;
  };

  // 生成渐变背景色
  const generateGradient = (name: string) => {
    const colors = [
      ['#00B4FF', '#00E08E'], // 科技蓝绿
      ['#8B5CF6', '#EC4899'], // 紫色到粉色
      ['#F59E0B', '#10B981'], // 橙色到绿色
      ['#EF4444', '#FBBF24'], // 红色到黄色
      ['#3B82F6', '#8B5CF6'], // 蓝色到紫色
    ];
    
    // 根据名字生成一致的索引
    const hash = name.split('').reduce((acc, char) => {
      return acc + char.charCodeAt(0);
    }, 0);
    const colorIndex = hash % colors.length;
    
    return `linear-gradient(135deg, ${colors[colorIndex][0]} 0%, ${colors[colorIndex][1]} 100%)`;
  };

  // 处理菜单点击
  const handleMenuAction = (action: string) => {
    setIsMenuOpen(false);
    if (onMenuClick) {
      onMenuClick(action);
    }
    
    switch (action) {
      case 'profile':
        // 打开个人资料页面
        console.log('Open profile page');
        break;
      case 'settings':
        // 打开设置页面
        console.log('Open settings page');
        break;
      case 'logout':
        // 退出登录
        console.log('Logout');
        break;
    }
  };

  const avatarUrl = getAvatarUrl();
  const gradientBackground = generateGradient(accountName);

  return (
    <div className={`relative ${className}`} ref={menuRef}>
      {/* 头像按钮 */}
      <button
        onClick={() => showDropdown && setIsMenuOpen(!isMenuOpen)}
        className={`
          group relative flex items-center justify-center rounded-2xl
          transition-all duration-300 ease-out cursor-pointer
          hover:scale-105 active:scale-95
          ${sizeClasses[size]}
          ${showDropdown ? 'hover:shadow-glow-cyan' : ''}
        `}
        style={
          avatarUrl
            ? { backgroundImage: `url(${avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : { background: gradientBackground }
        }
        title={accountName}
      >
        {!avatarUrl && (
          <span className="font-bold text-white drop-shadow-md">
            {avatarText}
          </span>
        )}
        
        {/* 头像边框效果 */}
        <div className="absolute inset-0 rounded-2xl border-2 border-white/20 transition-all duration-300 group-hover:border-white/40" />
        
        {/* 悬浮效果 */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/0 to-white/0 transition-all duration-300 group-hover:from-white/10 group-hover:to-white/5" />
        
        {/* 点击指示器（仅在显示下拉菜单时） */}
        {showDropdown && (
          <div className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-br from-tech-cyan to-tech-green p-0.5">
            <ChevronDown size={10} className="text-white transition-transform duration-200" 
              style={{ transform: isMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
          </div>
        )}
      </button>

      {/* 用户菜单 */}
      {isMenuOpen && showDropdown && (
        <div className="absolute bottom-full right-0 mb-2 w-64 rounded-xl border shadow-2xl animate-fade-in-up z-50"
          style={{
            backgroundColor: 'var(--app-bg-elevated)',
            borderColor: 'var(--app-border)',
          }}>
          {/* 用户信息头部 */}
          <div className="border-b p-4" style={{ borderColor: 'var(--app-border)' }}>
            <div className="flex items-center gap-3">
              <div className={`relative ${sizeClasses.md}`}
                style={
                  avatarUrl
                    ? { backgroundImage: `url(${avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                    : { background: gradientBackground }
                }>
                {!avatarUrl && (
                  <span className="flex h-full w-full items-center justify-center font-bold text-white">
                    {avatarText}
                  </span>
                )}
                <div className="absolute inset-0 rounded-2xl border-2 border-white/20" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold" style={{ color: 'var(--app-text)' }}>
                  {accountName}
                </div>
                <div className="truncate text-sm mt-1" style={{ color: 'var(--app-text-muted)' }}>
                  {runtimeInfo?.userName?.trim() ? t('desktopClient') : t('openclawDesktop')}
                </div>
              </div>
            </div>
          </div>

          {/* 菜单项 */}
          <div className="py-1">
            <button
              onClick={() => setShowAvatarOptions(!showAvatarOptions)}
              className="flex w-full items-center gap-3 px-4 py-3 text-sm transition-colors cursor-pointer hover:bg-opacity-10"
              style={{ color: 'var(--app-text-muted)' }}
            >
              <UserCircle size={16} />
              {t('changeAvatar') || 'Change Avatar'}
              <ChevronDown size={14} className="ml-auto transition-transform" 
                style={{ transform: showAvatarOptions ? 'rotate(180deg)' : 'rotate(0deg)' }} />
            </button>

            <button
              onClick={() => handleMenuAction('profile')}
              className="flex w-full items-center gap-3 px-4 py-3 text-sm transition-colors cursor-pointer hover:bg-opacity-10"
              style={{ color: 'var(--app-text-muted)' }}
            >
              <User size={16} />
              {t('profile') || 'Profile'}
            </button>

            <button
              onClick={() => handleMenuAction('settings')}
              className="flex w-full items-center gap-3 px-4 py-3 text-sm transition-colors cursor-pointer hover:bg-opacity-10"
              style={{ color: 'var(--app-text-muted)' }}
            >
              <Settings size={16} />
              {t('settings') || 'Settings'}
            </button>
          </div>

          {/* 分割线 */}
          <div className="border-t py-1" style={{ borderColor: 'var(--app-border)' }}>
            <button
              onClick={() => handleMenuAction('logout')}
              className="flex w-full items-center gap-3 px-4 py-3 text-sm transition-colors cursor-pointer hover:bg-opacity-10"
              style={{ color: '#EF4444' }}
            >
              <LogOut size={16} />
              {t('logout') || 'Logout'}
            </button>
          </div>
        </div>
      )}

      {/* 头像选项菜单 */}
      {showAvatarOptions && (
        <div className="absolute bottom-full right-0 mb-2 w-64 rounded-xl border shadow-2xl animate-fade-in-up z-50"
          style={{
            backgroundColor: 'var(--app-bg-elevated)',
            borderColor: 'var(--app-border)',
          }}>
          <div className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--app-text)' }}>
                {t('avatarOptions') || 'Avatar Options'}
              </h3>
              <button
                onClick={() => setShowAvatarOptions(false)}
                className="rounded-lg p-1 transition-colors cursor-pointer hover:bg-opacity-10"
                style={{ color: 'var(--app-text-muted)' }}
              >
                <X size={16} />
              </button>
            </div>

            {/* 默认头像选项 */}
            <button
              onClick={handleResetToDefault}
              className="flex w-full items-center justify-between rounded-lg border p-3 mb-2 transition-all duration-200 cursor-pointer hover:scale-[1.02]"
              style={{
                borderColor: userProfile?.avatarType === 'default' ? 'var(--tech-cyan)' : 'var(--app-border)',
                backgroundColor: userProfile?.avatarType === 'default' ? 'rgba(0, 180, 255, 0.1)' : 'transparent',
              }}
            >
              <div className="flex items-center gap-3">
                <div className={`flex items-center justify-center rounded-xl ${sizeClasses.sm}`}
                  style={{ background: gradientBackground }}>
                  <span className="font-bold text-white text-xs">
                    {avatarText}
                  </span>
                </div>
                <div>
                  <div className="text-sm font-medium text-left" style={{ color: 'var(--app-text)' }}>
                    {t('defaultAvatar') || 'Default Avatar'}
                  </div>
                  <div className="text-xs text-left" style={{ color: 'var(--app-text-muted)' }}>
                    {t('initialLetters') || 'Initial letters with gradient'}
                  </div>
                </div>
              </div>
              {userProfile?.avatarType === 'default' && (
                <Check size={16} className="text-tech-cyan" />
              )}
            </button>

            {/* Gravatar 选项 */}
            <div className="mb-2">
              <div className="flex items-center gap-2 mb-2">
                <Globe size={14} style={{ color: 'var(--app-text-muted)' }} />
                <div className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
                  {t('gravatarAvatar') || 'Gravatar Avatar'}
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={gravatarEmail}
                  onChange={(e) => setGravatarEmail(e.target.value)}
                  placeholder={t('enterEmailForGravatar') || 'Enter email for Gravatar'}
                  className="flex-1 rounded-lg border px-3 py-2 text-sm transition-colors"
                  style={{
                    backgroundColor: 'var(--app-bg-tertiary)',
                    borderColor: 'var(--app-border)',
                    color: 'var(--app-text)',
                  }}
                />
                <button
                  onClick={handleSetGravatar}
                  disabled={!gravatarEmail.trim() || isGravatarLoading}
                  className="rounded-lg border px-3 py-2 text-sm font-medium transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105"
                  style={{
                    backgroundColor: 'var(--tech-cyan)',
                    borderColor: 'var(--tech-cyan)',
                    color: 'white',
                  }}
                >
                  {isGravatarLoading ? '...' : t('set') || 'Set'}
                </button>
              </div>
              <div className="mt-1 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                {t('gravatarDescription') || 'Use your Gravatar profile picture'}
              </div>
            </div>

            {/* 自定义上传选项 */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Upload size={14} style={{ color: 'var(--app-text-muted)' }} />
                <div className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
                  {t('customAvatar') || 'Custom Avatar'}
                </div>
              </div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 transition-all duration-200 cursor-pointer hover:scale-[1.02] hover:border-solid"
                style={{
                  borderColor: 'var(--app-border)',
                  color: 'var(--app-text-muted)',
                }}
              >
                {isUploading ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    <span>{t('uploading') || 'Uploading...'}</span>
                  </>
                ) : (
                  <>
                    <Camera size={16} />
                    <span>{t('uploadImage') || 'Upload Image (max 2MB)'}</span>
                  </>
                )}
              </button>
              <div className="mt-1 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                {t('supportedFormats') || 'JPEG, PNG, GIF, WebP'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserAvatar;