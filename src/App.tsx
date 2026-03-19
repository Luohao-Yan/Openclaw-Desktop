import React from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import DesktopRuntimeProvider from './contexts/DesktopRuntimeContext';
import { SetupFlowProvider, useSetupFlow } from './contexts/SetupFlowContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { I18nProvider } from './i18n/I18nContext';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Tasks from './pages/Tasks';
import Logs from './pages/Logs';
import Agents from './pages/Agents';
import AgentWorkspace from './pages/AgentWorkspace';
import Sessions from './pages/sessions';
import Instances from './pages/Instances';
import Skills from './pages/Skills';
import TitleBar from './components/TitleBar';
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
import { SetupChannelsPage } from './pages/setup/SetupChannelsPage';
import { SetupCreateAgentPage } from './pages/setup/SetupCreateAgentPage';
import { SetupBindChannelsPage } from './pages/setup/SetupBindChannelsPage';

const AppLoadingScreen: React.FC = () => {
  return (
    <div
      className="flex min-h-screen items-center justify-center"
      style={{
        backgroundColor: 'var(--app-bg)',
        color: 'var(--app-text)',
      }}
    >
      <div className="rounded-2xl border px-6 py-4 text-sm" style={{ borderColor: 'var(--app-border)' }}>
        正在加载初始化状态...
      </div>
    </div>
  );
};

const MainAppLayout: React.FC = () => {
  return (
    <div
      className="flex flex-col h-screen"
      style={{
        backgroundColor: 'var(--app-bg)',
        color: 'var(--app-text)',
      }}
    >
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main
          className="flex-1 overflow-auto min-h-full relative"
          style={{ backgroundColor: 'var(--app-bg)', color: 'var(--app-text)' }}
        >
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
          </Routes>
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
      {/* 渠道绑定步骤：位于配置确认之后、创建 Agent 之前 */}
      <Route path="/setup/local/channels" element={<SetupChannelsPage />} />
      {/* 创建 Agent 步骤：位于渠道配置之后、绑定渠道之前 */}
      <Route path="/setup/local/create-agent" element={<SetupCreateAgentPage />} />
      {/* Agent-Channel 绑定步骤：位于创建 Agent 之后、最终验证之前 */}
      <Route path="/setup/local/bind-channels" element={<SetupBindChannelsPage />} />
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