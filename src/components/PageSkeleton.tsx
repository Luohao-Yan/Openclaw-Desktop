import React from 'react';

/**
 * 页面级骨架屏组件属性
 * @param lines - 骨架行数，默认 6
 * @param showHeader - 是否显示标题骨架，默认 true
 */
interface PageSkeletonProps {
  lines?: number;
  showHeader?: boolean;
}

/**
 * 页面级骨架屏占位组件
 * 复用全局 .skeleton CSS 类（定义在 src/index.css），
 * 在页面懒加载或数据未就绪时提供视觉占位。
 */
const PageSkeleton: React.FC<PageSkeletonProps> = ({
  lines = 6,
  showHeader = true,
}) => {
  return (
    <div className="p-6 space-y-4 animate-fade-in" role="status" aria-label="加载中">
      {/* 标题骨架 */}
      {showHeader && (
        <div className="skeleton h-8 w-1/3 mb-6" />
      )}

      {/* 内容行骨架 */}
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="skeleton h-4"
          /* 交替宽度，模拟真实文本排版 */
          style={{ width: i % 3 === 2 ? '60%' : i % 3 === 1 ? '80%' : '100%' }}
        />
      ))}
    </div>
  );
};

export default PageSkeleton;
