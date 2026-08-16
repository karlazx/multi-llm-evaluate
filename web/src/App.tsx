import { useState } from 'react';
import CasesPage from './pages/CasesPage';
import ModelsPage from './pages/ModelsPage';
import EvalsPage from './pages/EvalsPage';
import ReportsPage from './pages/ReportsPage';
import BlindPage from './pages/BlindPage';

type Tab = 'cases' | 'models' | 'evals' | 'reports' | 'blind';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'cases', label: '用例库' },
  { key: 'models', label: '模型接入' },
  { key: 'evals', label: '发起评测' },
  { key: 'reports', label: '报告' },
  { key: 'blind', label: '人工盲评' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('cases');

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">multi-llm-evaluate</div>
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
      </header>
      <main className="content">
        {tab === 'cases' && <CasesPage />}
        {tab === 'models' && <ModelsPage />}
        {tab === 'evals' && <EvalsPage />}
        {tab === 'reports' && <ReportsPage />}
        {tab === 'blind' && <BlindPage />}
      </main>
    </div>
  );
}
