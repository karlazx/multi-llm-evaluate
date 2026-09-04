import { useEffect, useState } from 'react';
import { api, type CaseRow, type EvalRun, type ModelRow, type Report } from '../api';
import { Empty, Skeleton, StatCard, statusBadge } from '../ui/bits';

export default function DashboardPage({ go }: { go: (tab: string) => void }) {
  const [cases, setCases] = useState<CaseRow[] | null>(null);
  const [models, setModels] = useState<ModelRow[] | null>(null);
  const [runs, setRuns] = useState<EvalRun[] | null>(null);
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [c, m, r] = await Promise.all([api.cases.list(), api.models.list(), api.evals.list()]);
        setCases(c); setModels(m); setRuns(r);
        const done = r.find((x) => x.status === 'done');
        if (done) setReport(await api.evals.report(done.id));
      } catch { /* 由页面空态兜底 */ }
    })();
  }, []);

  const activeCases = cases?.filter((c) => c.status === 'active') ?? [];
  const activeModels = models?.filter((m) => m.status === 'active') ?? [];
  const doneRuns = runs?.filter((r) => r.status === 'done') ?? [];
  const failedRuns = runs?.filter((r) => r.status === 'failed') ?? [];

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>总览</h2>
          <div className="page-sub">用例驱动 · 多协议跑测 · 三级评估</div>
        </div>
        <button className="btn primary" onClick={() => go('evals')}>发起评测</button>
      </div>

      <div className="stat-grid">
        {cases ? (
          <StatCard label="活跃用例" value={activeCases.length} foot={`客观 ${activeCases.filter((c) => c.type === 'objective').length} · 代码 ${activeCases.filter((c) => c.type === 'code').length}`} />
        ) : <Skeleton height={92} />}
        {models ? (
          <StatCard label="接入模型" value={activeModels.length} foot={`${new Set(activeModels.map((m) => m.protocol)).size} 种协议`} />
        ) : <Skeleton height={92} />}
        {runs ? (
          <StatCard label="评测轮次" value={runs.length} foot={`完成 ${doneRuns.length}${failedRuns.length ? ` · 失败 ${failedRuns.length}` : ''}`} />
        ) : <Skeleton height={92} />}
        {report ? (
          <StatCard label="最新轮次榜首" value={report.ranking[0]?.model_name ?? '—'} foot={`平均分 ${report.ranking[0]?.avg_score ?? '—'}`} />
        ) : <Skeleton height={92} />}
      </div>

      <div className="card card-pad">
        <div className="row-split">
          <h3 style={{ margin: 0 }}>最近评测</h3>
          <button className="btn ghost sm" onClick={() => go('evals')}>查看全部 →</button>
        </div>
        {!runs ? (
          <div style={{ marginTop: 14 }}><Skeleton height={140} /></div>
        ) : runs.length === 0 ? (
          <Empty icon="🚀" title="还没有评测轮次" sub="去「发起评测」页勾选用例×模型跑第一轮" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>ID</th><th>名称</th><th>状态</th><th>用例×模型</th><th>时间</th></tr></thead>
              <tbody>
                {runs.slice(0, 5).map((r) => (
                  <tr key={r.id}>
                    <td className="mono">#{r.id}</td>
                    <td>{r.name}</td>
                    <td>{statusBadge(r.status)}</td>
                    <td>{r.case_ids.length} × {r.model_ids.length}</td>
                    <td className="text-muted">{r.started_at ? new Date(r.started_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card card-pad">
        <div className="row-split">
          <h3 style={{ margin: 0 }}>最新排行速览</h3>
          <button className="btn ghost sm" onClick={() => go('reports')}>完整报告 →</button>
        </div>
        {!report ? (
          <div style={{ marginTop: 14 }}><Skeleton height={120} /></div>
        ) : report.ranking.length === 0 ? (
          <Empty icon="📊" title="暂无排行数据" />
        ) : (
          <div style={{ marginTop: 14 }}>
            {report.ranking.map((r, i) => {
              const pct = Math.max(4, Number(r.avg_score ?? 0));
              return (
                <div key={r.model_id} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 220px 60px', alignItems: 'center', gap: 10, padding: '7px 0' }}>
                  <span className="text-muted">{['🥇', '🥈', '🥉'][i] ?? i + 1}</span>
                  <span>{r.model_name}</span>
                  <div className="progress"><div className="progress-bar" style={{ width: `${pct}%` }} /></div>
                  <span style={{ textAlign: 'right', fontWeight: 600 }}>{r.avg_score ?? '—'}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
