import React from 'react';
import type {
  DesktopRuntimeCapabilities,
  DesktopRuntimeInfo,
} from '../types/desktopRuntime';

interface DesktopRuntimeContextValue {
  capabilities: DesktopRuntimeCapabilities | null;
  hasRuntimeContract: boolean;
  isLoading: boolean;
  refreshRuntime: () => Promise<void>;
  repairCapabilityAvailable: boolean;
  requiresRestartForLatestFeatures: boolean;
  runtimeInfo: DesktopRuntimeInfo | null;
}

const DesktopRuntimeContext = React.createContext<DesktopRuntimeContextValue | undefined>(undefined);

const DesktopRuntimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [runtimeInfo, setRuntimeInfo] = React.useState<DesktopRuntimeInfo | null>(null);
  const [capabilities, setCapabilities] = React.useState<DesktopRuntimeCapabilities | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const refreshRuntime = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const [nextRuntimeInfo, nextCapabilities] = await Promise.all([
        typeof window.electronAPI?.runtimeInfo === 'function'
          ? window.electronAPI.runtimeInfo()
          : Promise.resolve(null),
        typeof window.electronAPI?.getCapabilities === 'function'
          ? window.electronAPI.getCapabilities()
          : Promise.resolve(null),
      ]);

      // 使用类型断言确保 nextRuntimeInfo 被识别为正确的类型
      setRuntimeInfo(nextRuntimeInfo as DesktopRuntimeInfo | null);
      setCapabilities(nextCapabilities);
    } catch (error) {
      console.error('Failed to refresh desktop runtime:', error);
      setRuntimeInfo(null);
      setCapabilities(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refreshRuntime();
    // 添加定时刷新，同时确保清理
    const intervalId = setInterval(() => {
      void refreshRuntime();
    }, 60000); // 每分钟刷新一次
    // 清理函数
    return () => {
      clearInterval(intervalId);
    };
  }, [refreshRuntime]);

  const value = React.useMemo<DesktopRuntimeContextValue>(() => {
    const hasRuntimeContract = Boolean(runtimeInfo || capabilities);
    const repairCapabilityAvailable = Boolean(capabilities?.gateway?.repairCompatibility);
    const requiresRestartForLatestFeatures = hasRuntimeContract && !repairCapabilityAvailable;

    return {
      capabilities,
      hasRuntimeContract,
      isLoading,
      refreshRuntime,
      repairCapabilityAvailable,
      requiresRestartForLatestFeatures,
      runtimeInfo,
    };
  }, [capabilities, isLoading, refreshRuntime, runtimeInfo]);

  return (
    <DesktopRuntimeContext.Provider value={value}>
      {children}
    </DesktopRuntimeContext.Provider>
  );
};

export const useDesktopRuntime = (): DesktopRuntimeContextValue => {
  const context = React.useContext(DesktopRuntimeContext);
  if (!context) {
    throw new Error('useDesktopRuntime must be used within DesktopRuntimeProvider');
  }
  return context;
};

export type { DesktopRuntimeCapabilities, DesktopRuntimeInfo };

export default DesktopRuntimeProvider;
