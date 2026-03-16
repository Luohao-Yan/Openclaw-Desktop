// ============================================================================
// VirtualChannelList — 虚拟滚动渠道列表
// 仅渲染视口内可见的渠道卡片，避免大量 DOM 节点导致的性能问题。
// 不引入额外依赖（如 react-window），保持轻量实现。
// @see 需求 3.5 — 渠道列表使用虚拟滚动
// ============================================================================

import React from 'react';
import type { ChannelAddResult, ChannelConfig } from '../../types/setup';

// ============================================================================
// 类型定义
// ============================================================================

export interface VirtualChannelListProps {
  /** 渠道配置列表 */
  configs: ChannelConfig[];
  /** CLI 添加结果列表 */
  addResults: ChannelAddResult[];
  /** 容器可见高度（px） */
  height: number;
  /** 每个渠道卡片的基础高度（px），折叠状态 */
  itemHeight: number;
  /** 切换渠道启用/禁用 */
  onToggle: (key: string, enabled: boolean) => void;
  /** 修改渠道字段值 */
  onFieldChange: (key: string, fieldId: string, value: string) => void;
  /** 测试渠道连接 */
  onTest: (key: string) => void;
  /** 渲染单个渠道卡片的函数 */
  renderItem: (config: ChannelConfig, addResult?: ChannelAddResult) => React.ReactNode;
  /** 上下缓冲区大小（额外渲染的项数），默认 2 */
  bufferSize?: number;
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 计算展开状态下的渠道卡片高度。
 * 展开后高度 = 基础高度 + 字段数 * 字段行高 + 额外间距
 */
const getExpandedHeight = (config: ChannelConfig, baseHeight: number): number => {
  if (!config.enabled) return baseHeight;
  // 每个字段约 56px（label + input），CLI 提示约 40px，测试按钮区约 44px
  const fieldCount = config.fields.length;
  const cliHintHeight = config.cliHint ? 40 : 0;
  const testButtonHeight = config.fields.some((f) => f.type !== 'info') ? 44 : 0;
  return baseHeight + fieldCount * 56 + cliHintHeight + testButtonHeight + 16; // 16px padding
};

/**
 * 计算每个渠道卡片的实际高度（考虑展开状态）。
 */
const getItemHeights = (configs: ChannelConfig[], baseHeight: number): number[] =>
  configs.map((config) => getExpandedHeight(config, baseHeight));

/**
 * 计算累积高度数组，用于快速定位。
 * cumulativeHeights[i] = 前 i 个元素的总高度
 */
const getCumulativeHeights = (heights: number[]): number[] => {
  const cumulative: number[] = [0];
  for (let i = 0; i < heights.length; i++) {
    cumulative.push(cumulative[i] + heights[i]);
  }
  return cumulative;
};

/**
 * 二分查找：找到第一个累积高度 >= scrollTop 的索引。
 */
const findStartIndex = (cumulativeHeights: number[], scrollTop: number): number => {
  let lo = 0;
  let hi = cumulativeHeights.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (cumulativeHeights[mid] < scrollTop) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return Math.max(0, lo - 1);
};

// ============================================================================
// VirtualChannelList 主组件
// ============================================================================

/**
 * 虚拟滚动渠道列表 — 仅渲染视口内可见的渠道卡片。
 *
 * 实现原理：
 * 1. 计算所有卡片的累积高度（考虑展开/折叠状态）
 * 2. 监听滚动事件，根据 scrollTop 计算可见范围
 * 3. 仅渲染可见范围 + 缓冲区内的卡片
 * 4. 使用绝对定位 + transform 定位每个卡片
 *
 * 渲染数量上界: Math.ceil(height / itemHeight) + bufferSize * 2
 */
const VirtualChannelList: React.FC<VirtualChannelListProps> = ({
  configs,
  addResults,
  height,
  itemHeight,
  renderItem,
  bufferSize = 2,
}) => {
  /** 滚动容器引用 */
  const containerRef = React.useRef<HTMLDivElement>(null);
  /** 当前滚动位置 */
  const [scrollTop, setScrollTop] = React.useState(0);

  /** 处理滚动事件 */
  const handleScroll = React.useCallback(() => {
    if (containerRef.current) {
      setScrollTop(containerRef.current.scrollTop);
    }
  }, []);

  // 计算每个卡片的实际高度和累积高度
  const itemHeights = React.useMemo(
    () => getItemHeights(configs, itemHeight),
    [configs, itemHeight],
  );
  const cumulativeHeights = React.useMemo(
    () => getCumulativeHeights(itemHeights),
    [itemHeights],
  );

  /** 所有卡片的总高度 */
  const totalHeight = cumulativeHeights[cumulativeHeights.length - 1] || 0;

  // 计算可见范围
  const startIdx = Math.max(0, findStartIndex(cumulativeHeights, scrollTop) - bufferSize);
  const visibleEnd = scrollTop + height;
  let endIdx = startIdx;
  while (endIdx < configs.length && cumulativeHeights[endIdx] < visibleEnd) {
    endIdx++;
  }
  endIdx = Math.min(configs.length, endIdx + bufferSize);

  /** 可见范围内的渠道配置 */
  const visibleItems = configs.slice(startIdx, endIdx);

  /** 根据 channelKey 查找添加结果 */
  const getAddResult = (key: string) =>
    addResults.find((r) => r.channelKey === key);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="overflow-y-auto -mx-1 px-1"
      style={{ height, position: 'relative' }}
    >
      {/* 撑开总高度的占位容器 */}
      <div style={{ height: totalHeight, position: 'relative' }}>
        {visibleItems.map((config, i) => {
          const actualIndex = startIdx + i;
          const top = cumulativeHeights[actualIndex];
          return (
            <div
              key={config.key}
              style={{
                position: 'absolute',
                top,
                left: 0,
                right: 0,
                height: itemHeights[actualIndex],
              }}
            >
              {renderItem(config, getAddResult(config.key))}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default VirtualChannelList;

/** 导出辅助函数供属性测试使用 */
export { getExpandedHeight, getItemHeights, getCumulativeHeights, findStartIndex };
