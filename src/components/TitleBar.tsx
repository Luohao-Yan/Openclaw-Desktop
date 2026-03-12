import React from 'react';

const TitleBar: React.FC = () => {
  const appIconSrc = `${import.meta.env.BASE_URL}app-icon.svg`;

  // macOS 使用系统自带的红绿灯按钮，不需要自定义窗口控制按钮
  // 只需要显示标题和拖拽区域
  // 标准 macOS 标题栏高度通常为 28px，包含红绿灯按钮区域
  // 使用精确的 padding-left 确保红绿灯按钮区域有足够空间
  // 调整垂直居中对齐，使红绿灯按钮在视觉上垂直居中

  return (
    <div
      className="flex items-center justify-center h-8 border-b drag-region select-none"
      style={{
        backgroundColor: 'var(--app-bg-elevated)',
        borderColor: 'var(--app-border)',
        color: 'var(--app-text)',
      }}
    >
      {/* macOS 红绿灯按钮区域约 70-80px，添加足够 padding-left */}
      <div className="flex h-full items-center justify-center px-[80px] pb-[1px] w-full">
        <div className="flex items-center gap-2 leading-none">
          <div className="flex h-5 w-5 items-center justify-center">
            <img src={appIconSrc} alt="OpenClaw Desktop" className="w-4 h-4" draggable="false" />
          </div>
          <div>
            <h1 className="text-xs font-semibold leading-none">OpenClaw Desktop</h1>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TitleBar;