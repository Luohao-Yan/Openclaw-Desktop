import React, { Suspense, useRef, useEffect } from 'react';
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom';
import DesktopRuntimeProvider from './contexts/DesktopRuntimeContext';
import { SetupFlowProvider, useSetupFlow } from './contexts/SetupFlowContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { I18nProvider } from './i18n/I18nContext';
import Sidebar from './components/Sidebar';
import TitleBar from './components/TitleBar';
import GlobalLoading from './components/GlobalLoading';
import PageSkeleton from './components/PageSkeleton';

// 页面级组件使用 React.lazy 懒加载，仅在用户导航到对应路由时加载
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Settings = React.lazy(() => import('./pages/Settings'));
const Tasks = React.lazy(() => import('./pages/Tasks'));
const Logs = React.lazy(() => import('./pages/Logs'));
const Agents = React.lazy(() => import('./pages/Agents'));
const AgentWorkspace = React.lazy(() => import('./pages/AgentWorkspace'));
const Sessions = React.lazy(() => import('./pages/sessions'));
const Instances = React.lazy(() => import('./pages/Instances'));
const Skills = React.lazy(() => import('./pages/Skills'));
const Help = React.lazy(() => import('./pages/Help'));
import {
  SetupCompletePage,
  SetupLocalCheckPage,
  SetupLocalConfigurePage,
  SetupLocalConfirmExistingPage,
  SetupLocalEnvironmentPage,
  SetupLocalInstallGuidePage,
  SetupLocalIntroPage,
  SetupLocalVerifyPage,
  SetupRemoteConfigPage,
  SetupRemoteIntroPage,
  SetupRemoteVerifyPage,
  SetupWelcomePage,
} from './pages/setup/SetupPages';
// Bug 2 修复：移除独立的 channels / create-agent / bind-channels 页面导入
// 这些步骤已内嵌到 SetupLocalInstallGuidePage 的子步骤中

/** 应用初始化加载屏 —— 使用全局 Loading 组件 */
const AppLoadingScreen: React.FC = () => (
  <div
    className="flex min-h-screen items-center justify-center"
    style={{ backgroundColor: 'var(--app-bg)' }}
  >
    <GlobalLoading visible text="正在初始化" overlay={false} size="lg" />
  </div>
);

/**
 * ScrollToTop 组件：监听路由 pathname 变化，自动将 <main> 滚动容器重置到顶部
 * 解决 HashRouter 下路由切换时页面保留前一页面滚动位置的问题
 */
const ScrollToTop: React.FC<{ mainRef: React.RefObject<HTMLElement | null> }> = ({ mainRef }) => {
  const { pathname } = useLocation();

  useEffect(() => {
    // 当路由 pathname 变化时，将滚动容器的 scrollTop 重置为 0
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [pathname, mainRef]);

  // 该组件不渲染任何 UI 元素
  return null;
};

const MainAppLayout: React.FC = () => {
  // 创建 ref 引用 <main> 滚动容器，供 ScrollToTop 组件使用
  const mainRef = useRef<HTMLElement>(null);

  return (
    <div
      className="flex flex-col h-screen"
      style={{
        backgroundColor: 'var(--app-bg)',
        color: 'var(--app-text)',
      }}
    >
      {/* macOS hiddenInset 标题栏：为红绿灯按钮留出拖拽区域 */}
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main
          ref={mainRef}
          className="flex-1 overflow-auto min-h-full relative"
          style={{ backgroundColor: 'var(--app-bg)', color: 'var(--app-text)' }}
        >
          {/* 路由切换时自动重置滚动位置到顶部 */}
          <ScrollToTop mainRef={mainRef} />
          {/* 懒加载页面使用 Suspense 包裹，加载期间显示骨架屏占位 */}
          <Suspense fallback={<PageSkeleton />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/tasks" element={<Tasks />} />
              <Route path="/logs" element={<Logs />} />
              <Route path="/agents" element={<Agents />} />
              <Route path="/agent-workspace/:agentId" element={<AgentWorkspace />} />
              <Route path="/sessions" element={<Sessions />} />
              <Route path="/instances" element={<Instances />} />
              <Route path="/skills" element={<Skills />} />
              <Route path="/help" element={<Help />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
};

const SetupRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/setup/welcome" element={<SetupWelcomePage />} />
      <Route path="/setup/local/intro" element={<SetupLocalIntroPage />} />
      <Route path="/setup/local/environment" element={<SetupLocalEnvironmentPage />} />
      <Route path="/setup/local/check" element={<SetupLocalCheckPage />} />
      <Route path="/setup/local/confirm-existing" element={<SetupLocalConfirmExistingPage />} />
      <Route path="/setup/local/install-guide" element={<SetupLocalInstallGuidePage />} />
      <Route path="/setup/local/configure" element={<SetupLocalConfigurePage />} />
      {/* Bug 2 修复：移除 channels / create-agent / bind-channels 路由
          这些步骤已内嵌到 install-guide 页面的子步骤中，
          保留独立路由会导致浏览器后退时进入重复/混乱的页面 */}
      <Route path="/setup/local/verify" element={<SetupLocalVerifyPage />} />
      <Route path="/setup/remote/intro" element={<SetupRemoteIntroPage />} />
      <Route path="/setup/remote/config" element={<SetupRemoteConfigPage />} />
      <Route path="/setup/remote/verify" element={<SetupRemoteVerifyPage />} />
      <Route path="/setup/complete" element={<SetupCompletePage />} />
      <Route path="*" element={<SetupWelcomePage />} />
    </Routes>
  );
};

const AppRouter: React.FC = () => {
  const {
    hasCompletedSetup,
    isBootstrapping,
  } = useSetupFlow();

  if (isBootstrapping) {
    return <AppLoadingScreen />;
  }

  return hasCompletedSetup ? <MainAppLayout /> : <SetupRoutes />;
};

function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <DesktopRuntimeProvider>
          <HashRouter>
            <SetupFlowProvider>
              <AppRouter />
            </SetupFlowProvider>
          </HashRouter>
        </DesktopRuntimeProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}

export default App;