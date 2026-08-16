import { useEffect, useState } from 'react';
import { api, type EvalRun, type Report } from '../api';

export default function ReportsPage() {
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');

  async function loadRuns() {
    setRuns(await api.evals.list());
  }
  useEffect(() => { void loadRuns(); }, []);

  async function open(id: number) {
    setSelected(id);
    setError('');
    try {
      setReport(await api.evals.report(id));
    } catch (e) { setError((e as Error).message); }
  }

  const modelNames = report ? Array.from(new Set(report.ranking.map((r) => r.model_name))) : [];
  const dimensions = report ? Array.from(new Set(report.dimensions.map((d) => d.dimension))) : [];

  return (
    <div>
      <div className="page-head"><h2>评测报告</h2></div>
      {error && <div className="alert">{error}</div>}

      <div className="panel">
        <label>选择轮次
          <select value={selected ?? ''} onChange={(e) => open(Number(e.target.value))}>
            <option value="">（选择）</option>
            {runs.map((r) => <option key={r.id} value={r.id}>#{r.id} {r.name}（{r.status}）</option>)}
          </select>
        </label>
      </div>

      {report && (
        <>
          <div className="panel">
            <h3>① 总分排行</h3>
            <table className="table">
              <thead><tr><th>名次</th><th>模型</th><th>平均分（0-100）</th></tr></thead>
              <tbody>
                {report.ranking.map((r, i) => (
                  <tr key={r.model_id}>
                    <td>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td>
                    <td>{r.model_name}</td>
                    <td>{r.avg_score ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel">
            <h3>② 分维度得分</h3>
            <table className="table">
              <thead><tr><th>维度</th>{modelNames.map((n) => <th key={n}>{n}</th>)}</tr></thead>
              <tbody>
                {dimensions.map((d) => (
                  <tr key={d}>
                    <td>{d}</td>
                    {modelNames.map((n) => {
                      const row = report.dimensions.find((x) => x.dimension === d && x.model_name === n);
                      return <td key={n}>{row?.avg_score ?? '—'}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel">
            <h3>③ 成本 / token / 耗时看板</h3>
            <table className="table">
              <thead><tr><th>模型</th><th>总成本</th><th>总 token</th><th>平均延迟</th></tr></thead>
              <tbody>
                {report.costs.map((c) => (
                  <tr key={c.model_id}>
                    <td>{c.model_name}</td>
                    <td>{c.total_cost_usd != null ? `$${Number(c.total_cost_usd).toFixed(6)}` : '—'}</td>
                    <td>{c.total_tokens ?? '—'}</td>
                    <td>{c.avg_latency_ms != null ? `${c.avg_latency_ms}ms` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel">
            <h3>④ 单用例穿透</h3>
            <table className="table">
              <thead><tr><th>用例</th><th>维度</th><th>模型</th><th>得分</th><th>判分理由 / 输出预览</th></tr></thead>
              <tbody>
                {report.details.map((d) => (
                  <tr key={`${d.case_id}-${d.model_id}`}>
                    <td>{d.case_title}</td>
                    <td>{d.dimension ?? '-'}</td>
                    <td>{d.model_name}</td>
                    <td>{d.score ?? '—'}</td>
                    <td className="preview" title={d.reason ?? ''}>
                      {d.reason ?? (d.raw_output ? d.raw_output.slice(0, 80) : '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
