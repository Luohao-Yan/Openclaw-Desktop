import React from 'react';

const TitleBar: React.FC = () => {
  // macOS 使用系统自带的红绿灯按钮，不需要自定义窗口控制按钮
  // 只需要显示标题和拖拽区域
  // 标准 macOS 标题栏高度通常为 28px，包含红绿灯按钮区域
  // 使用精确的 padding-left 确保红绿灯按钮区域有足够空间
  // 调整垂直居中对齐，使红绿灯按钮在视觉上垂直居中

  return (
    <div
      className="flex items-center justify-center h-[28px] border-b drag-region select-none"
      style={{
        backgroundColor: 'var(--app-bg-elevated)',
        borderColor: 'var(--app-border)',
        color: 'var(--app-text)',
      }}
    >
      {/* macOS 红绿灯按钮区域约 70-80px，添加足够 padding-left */}
      <div className="flex items-center justify-center px-[80px] w-full">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 flex items-center justify-center">
            <svg className="w-4 h-4 text-blue-400" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="currentColor"/>
            </svg>
          </div>
          <div>
            <h1 className="font-semibold text-xs">OpenClaw Desktop</h1>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TitleBar;