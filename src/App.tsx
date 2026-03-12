import { HashRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { I18nProvider } from './i18n/I18nContext';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Tasks from './pages/Tasks';
import Logs from './pages/Logs';
import Agents from './pages/Agents';
import AgentWorkspace from './pages/AgentWorkspace';
import Sessions from './pages/Sessions';
import Instances from './pages/Instances';
import Skills from './pages/Skills';
import TitleBar from './components/TitleBar';

function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <HashRouter>
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
                className="flex-1 overflow-auto min-h-full"
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
        </HashRouter>
      </I18nProvider>
    </ThemeProvider>
  );
}

export default App;