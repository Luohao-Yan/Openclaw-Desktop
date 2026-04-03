import { useState } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';

/** UpdateBanner 组件 Props */
export interface UpdateBannerProps {
  /** 是否有新版本可用 */
  hasUpdate: boolean;
  /** 当前版本号 */
  currentVersion: string | null;
  /** 最新版本号 */
  latestVersion: string | null;
  /** 点击"立即更新"时的回调 */
  onUpdateClick: () => void;
}

/**
 * 版本更新顶部横幅组件
 * 当检测到新版本时，在主内容区域顶部显示红色横幅，
 * 展示版本信息并提供"立即更新"入口和关闭按钮。
 */
export function UpdateBanner({ hasUpdate, currentVersion, latestVersion, onUpdateClick }: UpdateBannerProps) {
  const { t } = useI18n();
  // 横幅关闭状态，会话级别，刷新后重置
  const [dismissed, setDismissed] = useState(false);

  // 无更新或已关闭时不渲染
  if (!hasUpdate || dismissed) {
    return null;
  }

  // 替换翻译文案中的版本号占位符
  const message = t('updateBanner.message')
    .replace('{latest}', latestVersion ?? '')
    .replace('{current}', currentVersion ?? '');

  /** 键盘事件处理：Enter 或 Space 触发点击 */
  const handleKeyDown = (callback: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      callback();
    }
  };

  return (
    <div
      className="relative w-full flex items-center justify-center px-4 py-2 text-sm"
      style={{ backgroundColor: '#DC2626', color: '#FFFFFF' }}
    >
      {/* 横幅内容区域：版本信息 + 立即更新链接 */}
      <div className="flex items-center gap-2">
        <span>{message}</span>
        <span
          role="button"
          tabIndex={0}
          className="underline cursor-pointer font-medium"
          onClick={onUpdateClick}
          onKeyDown={handleKeyDown(onUpdateClick)}
        >
          {t('updateBanner.updateNow')}
        </span>
      </div>

      {/* 关闭按钮，固定在右侧 */}
      <span
        role="button"
        tabIndex={0}
        className="absolute right-4 cursor-pointer"
        style={{ color: '#FFFFFF' }}
        aria-label={t('updateBanner.close')}
        onClick={() => setDismissed(true)}
        onKeyDown={handleKeyDown(() => setDismissed(true))}
      >
        <X size={16} />
      </span>
    </div>
  );
}

export default UpdateBanner;
