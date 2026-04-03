import { useState } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';

/** 桌面应用更新横幅 Props */
export interface DesktopUpdateBannerProps {
  /** 是否有新版本 */
  hasUpdate: boolean;
  /** 当前桌面应用版本 */
  currentVersion: string | null;
  /** 最新版本 */
  latestVersion: string | null;
  /** 下载链接 */
  downloadUrl: string | null;
}

/**
 * 桌面应用更新横幅组件
 * 当检测到 GitHub 上有新版本时，显示蓝色横幅提醒用户下载更新。
 */
export function DesktopUpdateBanner({
  hasUpdate,
  currentVersion,
  latestVersion,
  downloadUrl,
}: DesktopUpdateBannerProps) {
  const { t } = useI18n();
  // 横幅关闭状态，会话级别
  const [dismissed, setDismissed] = useState(false);

  // 无更新或已关闭时不渲染
  if (!hasUpdate || dismissed) {
    return null;
  }

  // 替换翻译文案中的版本号占位符
  const message = t('desktopUpdate.message')
    .replace('{latest}', latestVersion ?? '')
    .replace('{current}', currentVersion ?? '');

  /** 键盘事件处理 */
  const handleKeyDown = (callback: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      callback();
    }
  };

  /** 打开下载链接 */
  const handleDownload = () => {
    if (downloadUrl) {
      window.open(downloadUrl, '_blank');
    }
  };

  return (
    <div
      className="relative w-full flex items-center justify-center px-4 py-2 text-sm"
      style={{ backgroundColor: '#2563EB', color: '#FFFFFF' }}
    >
      {/* 横幅内容：版本信息 + 下载链接 */}
      <div className="flex items-center gap-2">
        <span>{message}</span>
        <span
          role="button"
          tabIndex={0}
          className="underline cursor-pointer font-medium"
          onClick={handleDownload}
          onKeyDown={handleKeyDown(handleDownload)}
        >
          {t('desktopUpdate.download')}
        </span>
      </div>

      {/* 关闭按钮 */}
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

export default DesktopUpdateBanner;
