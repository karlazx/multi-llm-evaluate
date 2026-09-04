import { useState } from 'react';
import { ToastProvider } from './ui/toast';
import { useTheme } from './ui/theme';
import DashboardPage from './pages/DashboardPage';
import CasesPage from './pages/CasesPage';
import ModelsPage from './pages/ModelsPage';
import EvalsPage from './pages/EvalsPage';
import ReportsPage from './pages/ReportsPage';
import BlindPage from './pages/BlindPage';

type Tab = 'home' | 'cases' | 'models' | 'evals' | 'reports' | 'blind';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'home', label: '总览' },
  { key: 'cases', label: '用例库' },
  { key: 'models', label: '模型接入' },
  { key: 'evals', label: '发起评测' },
  { key: 'reports', label: '报告' },
  { key: 'blind', label: '人工盲评' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('home');
  const { theme, toggle } = useTheme();

  return (
    <ToastProvider>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <span className="brand-logo">M</span>
            multi-llm-evaluate
          </div>
          <nav className="tabs">
            {TABS.map((t) => (
              <button
                key={t.key}
                className={tab === t.key ? 'tab active' : 'tab'}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <button className="theme-toggle" onClick={toggle} title="切换主题">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </header>
        <main className="content">
          {tab === 'home' && <DashboardPage go={(t) => setTab(t as Tab)} />}
          {tab === 'cases' && <CasesPage />}
          {tab === 'models' && <ModelsPage />}
          {tab === 'evals' && <EvalsPage />}
          {tab === 'reports' && <ReportsPage />}
          {tab === 'blind' && <BlindPage />}
        </main>
      </div>
    </ToastProvider>
  );
}
