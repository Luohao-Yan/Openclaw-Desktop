import React, { useState, useEffect } from 'react';
import { useDesktopRuntime } from '../../contexts/DesktopRuntimeContext';
import { useI18n } from '../../i18n/I18nContext';
import { 
  User, 
  Camera, 
  Upload, 
  Globe, 
  Save, 
  X,
  Check,
  Palette,
  Image as ImageIcon,
  RefreshCw
} from 'lucide-react';

interface UserProfile {
  name?: string;
  email?: string;
  avatarUrl?: string;
  avatarType?: 'default' | 'gravatar' | 'custom';
  gravatarEmail?: string;
  theme?: 'light' | 'dark' | 'system';
}

const UserProfileSettings: React.FC = () => {
  const { runtimeInfo } = useDesktopRuntime();
  const { t } = useI18n();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [gravatarEmail, setGravatarEmail] = useState('');
  const [showAvatarPreview, setShowAvatarPreview] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const accountName = runtimeInfo?.userName?.trim() || t('openclawDesktop');

  // 加载用户配置
  useEffect(() => {
    const loadUserProfile = async () => {
      try {
        setIsLoading(true);
        const result = await window.electronAPI?.settingsGet?.();
        if (result?.success && result.settings?.userProfile) {
          setUserProfile(result.settings.userProfile as UserProfile);
          if (result.settings.userProfile.gravatarEmail) {
            setGravatarEmail(result.settings.userProfile.gravatarEmail);
          }
        } else {
          // 创建默认配置
          const defaultProfile: UserProfile = {
            name: accountName,
            avatarType: 'default',
            theme: 'system'
          };
          setUserProfile(defaultProfile);
        }
      } catch (error) {
        console.error('Failed to load user profile:', error);
        setSaveMessage({ type: 'error', text: t('loadProfileError') || 'Failed to load profile' });
      } finally {
        setIsLoading(false);
      }
    };
    loadUserProfile();
  }, [accountName, t]);

  // 保存用户配置
  const saveUserProfile = async (profile: UserProfile) => {
    try {
      setIsSaving(true);
      if (window.electronAPI?.settingsSet) {
        await window.electronAPI.settingsSet({
          userProfile: profile
        });
      }
      setUserProfile(profile);
      setSaveMessage({ type: 'success', text: t('profileSaved') || 'Profile saved successfully' });
      
      // 3秒后清除消息
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error) {
      console.error('Failed to save user profile:', error);
      setSaveMessage({ type: 'error', text: t('saveProfileError') || 'Failed to save profile' });
    } finally {
      setIsSaving(false);
    }
  };

  // 处理表单提交
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const updatedProfile: UserProfile = {
      ...userProfile!,
      name: accountName, // 使用运行时信息中的名字
    };
    
    await saveUserProfile(updatedProfile);
  };

  // 设置 Gravatar 头像
  const handleSetGravatar = async () => {
    if (!gravatarEmail.trim()) {
      setSaveMessage({ type: 'error', text: t('enterEmailForGravatar') || 'Please enter email for Gravatar' });
      return;
    }

    const updatedProfile: UserProfile = {
      ...userProfile!,
      avatarType: 'gravatar',
      gravatarEmail: gravatarEmail.trim(),
      avatarUrl: `https://www.gravatar.com/avatar/${gravatarEmail.trim().toLowerCase().replace(/\s/g, '')}?s=200&d=identicon`
    };
    
    await saveUserProfile(updatedProfile);
  };

  // 重置为默认头像
  const handleResetToDefault = async () => {
    const updatedProfile: UserProfile = {
      ...userProfile!,
      avatarType: 'default',
      gravatarEmail: undefined,
      avatarUrl: undefined
    };
    
    await saveUserProfile(updatedProfile);
    setGravatarEmail('');
  };

  // 获取当前头像预览
  const getAvatarPreview = () => {
    if (userProfile?.avatarType === 'gravatar' && userProfile.gravatarEmail) {
      return `https://www.gravatar.com/avatar/${userProfile.gravatarEmail.trim().toLowerCase().replace(/\s/g, '')}?s=200&d=identicon`;
    }
    if (userProfile?.avatarType === 'custom' && userProfile.avatarUrl) {
      return userProfile.avatarUrl;
    }
    return null;
  };

  // 生成默认头像渐变
  const generateDefaultAvatar = (name: string) => {
    const colors = [
      ['#00B4FF', '#00E08E'],
      ['#8B5CF6', '#EC4899'],
      ['#F59E0B', '#10B981'],
      ['#EF4444', '#FBBF24'],
      ['#3B82F6', '#8B5CF6'],
    ];
    
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const colorIndex = hash % colors.length;
    
    return `linear-gradient(135deg, ${colors[colorIndex][0]} 0%, ${colors[colorIndex][1]} 100%)`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent" />
        <span className="ml-2" style={{ color: 'var(--app-text-muted)' }}>
          {t('common.loading')}
        </span>
      </div>
    );
  }

  const avatarPreview = getAvatarPreview();
  const defaultAvatarStyle = generateDefaultAvatar(accountName);
  const avatarInitials = accountName.slice(0, 2).toUpperCase();

  return (
    <div className="space-y-6">
      {/* 保存消息 */}
      {saveMessage && (
        <div className={`rounded-lg border p-4 ${saveMessage.type === 'success' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-center">
            {saveMessage.type === 'success' ? (
              <Check className="h-5 w-5 text-green-600 mr-2" />
            ) : (
              <X className="h-5 w-5 text-red-600 mr-2" />
            )}
            <span className={saveMessage.type === 'success' ? 'text-green-800' : 'text-red-800'}>
              {saveMessage.text}
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧：头像设置 */}
        <div className="lg:col-span-1 space-y-6">
          {/* 头像预览卡片 */}
          <div className="rounded-xl border p-6" style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-bg-elevated)' }}>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--app-text)' }}>
              <Palette size={18} />
              {t('avatarPreview') || 'Avatar Preview'}
            </h3>
            
            <div className="flex flex-col items-center space-y-4">
              {/* 头像预览 */}
              <div className="relative">
                <div
                  className="h-32 w-32 rounded-2xl flex items-center justify-center text-3xl font-bold text-white shadow-xl transition-transform duration-300 hover:scale-105"
                  style={avatarPreview ? { backgroundImage: `url(${avatarPreview})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: defaultAvatarStyle }}
                  onClick={() => setShowAvatarPreview(!showAvatarPreview)}
                >
                  {!avatarPreview && avatarInitials}
                </div>
                
                {/* 头像边框效果 */}
                <div className="absolute inset-0 rounded-2xl border-2 border-white/20 pointer-events-none" />
              </div>

              {/* 头像信息 */}
              <div className="text-center">
                <div className="font-semibold" style={{ color: 'var(--app-text)' }}>
                  {accountName}
                </div>
                <div className="text-sm mt-1" style={{ color: 'var(--app-text-muted)' }}>
                  {userProfile?.avatarType === 'default' && (t('defaultAvatar') || 'Default Avatar')}
                  {userProfile?.avatarType === 'gravatar' && (t('gravatarAvatar') || 'Gravatar Avatar')}
                  {userProfile?.avatarType === 'custom' && (t('customAvatar') || 'Custom Avatar')}
                </div>
              </div>
            </div>
          </div>

          {/* 快速操作 */}
          <div className="rounded-xl border p-6" style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-bg-elevated)' }}>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--app-text)' }}>
              <RefreshCw size={18} />
              {t('quickActions') || 'Quick Actions'}
            </h3>
            
            <div className="space-y-3">
              <button
                onClick={handleResetToDefault}
                className="w-full flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-all duration-200 cursor-pointer hover:scale-[1.02]"
                style={{
                  borderColor: 'var(--app-border)',
                  color: 'var(--app-text)',
                  backgroundColor: 'var(--app-bg-tertiary)',
                }}
              >
                <ImageIcon size={16} />
                {t('resetToDefault') || 'Reset to Default'}
              </button>

              <button
                onClick={() => window.open('https://gravatar.com', '_blank')}
                className="w-full flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-all duration-200 cursor-pointer hover:scale-[1.02]"
                style={{
                  borderColor: 'var(--app-border)',
                  color: 'var(--app-text)',
                  backgroundColor: 'var(--app-bg-tertiary)',
                }}
              >
                <Globe size={16} />
                {t('manageGravatar') || 'Manage Gravatar'}
              </button>
            </div>
          </div>
        </div>

        {/* 右侧：设置表单 */}
        <div className="lg:col-span-2 space-y-6">
          {/* 基本信息卡片 */}
          <div className="rounded-xl border p-6" style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-bg-elevated)' }}>
            <h3 className="text-lg font-semibold mb-6 flex items-center gap-2" style={{ color: 'var(--app-text)' }}>
              <User size={18} />
              {t('basicInformation') || 'Basic Information'}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--app-text)' }}>
                  {t('userName') || 'User Name'}
                </label>
                <input
                  type="text"
                  value={accountName}
                  disabled
                  className="w-full rounded-lg border px-3 py-2 text-sm transition-colors"
                  style={{
                    backgroundColor: 'var(--app-bg-tertiary)',
                    borderColor: 'var(--app-border)',
                    color: 'var(--app-text-muted)',
                    cursor: 'not-allowed',
                  }}
                />
                <p className="mt-1 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                  {t('nameFromRuntime') || 'Name is loaded from OpenClaw runtime'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--app-text)' }}>
                  {t('email') || 'Email Address'}
                </label>
                <input
                  type="email"
                  value={userProfile?.email || ''}
                  onChange={(e) => setUserProfile({ ...userProfile!, email: e.target.value })}
                  placeholder="user@example.com"
                  className="w-full rounded-lg border px-3 py-2 text-sm transition-colors"
                  style={{
                    backgroundColor: 'var(--app-bg-tertiary)',
                    borderColor: 'var(--app-border)',
                    color: 'var(--app-text)',
                  }}
                />
                <p className="mt-1 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                  {t('emailForGravatar') || 'Used for Gravatar integration and notifications'}
                </p>
              </div>
            </div>
          </div>

          {/* 头像设置卡片 */}
          <div className="rounded-xl border p-6" style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-bg-elevated)' }}>
            <h3 className="text-lg font-semibold mb-6 flex items-center gap-2" style={{ color: 'var(--app-text)' }}>
              <Camera size={18} />
              {t('avatarSettings') || 'Avatar Settings'}
            </h3>
            
            <div className="space-y-6">
              {/* Gravatar 设置 */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Globe size={16} style={{ color: 'var(--app-text-muted)' }} />
                  <h4 className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
                    {t('gravatarIntegration') || 'Gravatar Integration'}
                  </h4>
                </div>
                
                <div className="space-y-3">
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
                      className="rounded-lg border px-4 py-2 text-sm font-medium transition-all duration-200 cursor-pointer hover:scale-105"
                      style={{
                        backgroundColor: 'var(--tech-cyan)',
                        borderColor: 'var(--tech-cyan)',
                        color: 'white',
                      }}
                    >
                      {t('setGravatar') || 'Set Gravatar'}
                    </button>
                  </div>
                  
                  <p className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
                    {t('gravatarDescription') || 'Gravatar is a free service that lets you use the same avatar across different websites'}
                  </p>
                </div>
              </div>

              {/* 头像类型选择 */}
              <div>
                <h4 className="text-sm font-medium mb-3" style={{ color: 'var(--app-text)' }}>
                  {t('avatarType') || 'Avatar Type'}
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* 默认头像选项 */}
                  <button
                    onClick={handleResetToDefault}
                    className={`rounded-lg border p-4 text-left transition-all duration-200 cursor-pointer hover:scale-[1.02] ${
                      userProfile?.avatarType === 'default' ? 'ring-2 ring-tech-cyan' : ''
                    }`}
                    style={{
                      borderColor: userProfile?.avatarType === 'default' ? 'var(--tech-cyan)' : 'var(--app-border)',
                      backgroundColor: userProfile?.avatarType === 'default' ? 'rgba(0, 180, 255, 0.1)' : 'var(--app-bg-tertiary)',
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl flex items-center justify-center text-white font-bold"
                        style={{ background: defaultAvatarStyle }}>
                        {avatarInitials}
                      </div>
                      <div>
                        <div className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
                          {t('defaultAvatar') || 'Default'}
                        </div>
                        <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
                          {t('initialLetters') || 'Initial letters'}
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* Gravatar 选项 */}
                  <button
                    onClick={() => userProfile?.gravatarEmail && handleSetGravatar()}
                    className={`rounded-lg border p-4 text-left transition-all duration-200 cursor-pointer hover:scale-[1.02] ${
                      userProfile?.avatarType === 'gravatar' ? 'ring-2 ring-tech-cyan' : ''
                    }`}
                    style={{
                      borderColor: userProfile?.avatarType === 'gravatar' ? 'var(--tech-cyan)' : 'var(--app-border)',
                      backgroundColor: userProfile?.avatarType === 'gravatar' ? 'rgba(0, 180, 255, 0.1)' : 'var(--app-bg-tertiary)',
                    }}
                    disabled={!userProfile?.gravatarEmail}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-purple-500 to-pink-500">
                        <Globe size={20} className="text-white" />
                      </div>
                      <div>
                        <div className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
                          {t('gravatar') || 'Gravatar'}
                        </div>
                        <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
                          {userProfile?.gravatarEmail || t('notSet') || 'Not set'}
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* 自定义头像选项 */}
                  <div
                    className={`rounded-lg border p-4 text-left transition-all duration-200 ${
                      userProfile?.avatarType === 'custom' ? 'ring-2 ring-tech-cyan' : ''
                    }`}
                    style={{
                      borderColor: userProfile?.avatarType === 'custom' ? 'var(--tech-cyan)' : 'var(--app-border)',
                      backgroundColor: userProfile?.avatarType === 'custom' ? 'rgba(0, 180, 255, 0.1)' : 'var(--app-bg-tertiary)',
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-orange-500 to-yellow-500">
                        <Upload size={20} className="text-white" />
                      </div>
                      <div>
                        <div className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
                          {t('custom') || 'Custom'}
                        </div>
                        <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
                          {t('uploadImage') || 'Upload image'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 保存按钮 */}
          <div className="flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={isSaving}
              className="flex items-center gap-2 rounded-lg border px-6 py-3 text-sm font-medium transition-all duration-200 cursor-pointer hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'var(--tech-cyan)',
                borderColor: 'var(--tech-cyan)',
                color: 'white',
              }}
            >
              {isSaving ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  {t('saving') || 'Saving...'}
                </>
              ) : (
                <>
                  <Save size={16} />
                  {t('saveProfile') || 'Save Profile'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserProfileSettings;