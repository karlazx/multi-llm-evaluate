import { useEffect, useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api, type EvalRun, type Report } from '../api';
import { useToast } from '../ui/toast';
import { Empty, Skeleton } from '../ui/bits';

const PALETTE = ['#6366f1', '#0ea5e9', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6'];

export default function ReportsPage() {
  const toast = useToast();
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { void api.evals.list().then(setRuns); }, []);

  async function open(id: number) {
    setSelected(id);
    setLoading(true);
    try { setReport(await api.evals.report(id)); }
    catch (e) { toast('error', '加载报告失败：' + (e as Error).message); }
    finally { setLoading(false); }
  }

  function toggleCompare(id: number) {
    setCompareIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function compare() {
    if (compareIds.length < 2) { toast('error', '至少选 2 个轮次对比'); return; }
    setLoading(true);
    try { setReport(await api.evals.compare(compareIds)); }
    catch (e) { toast('error', '对比失败：' + (e as Error).message); }
    finally { setLoading(false); }
  }

  async function exportMd() {
    if (!selected) return;
    const md = await api.evals.exportMd(selected);
    const blob = new Blob([md], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `report-run-${selected}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('success', 'Markdown 已导出');
  }

  // 图表数据
  const rankingData = useMemo(
    () => (report?.ranking ?? []).map((r) => ({ name: r.model_name, score: Number(r.avg_score ?? 0) })),
    [report],
  );
  const dimensionData = useMemo(() => {
    if (!report) return [];
    const dims = Array.from(new Set(report.dimensions.map((d) => d.dimension)));
    return dims.map((dim) => {
      const row: Record<string, string | number> = { dimension: dim };
      for (const m of new Set(report.dimensions.map((d) => d.model_name))) {
        const cell = report.dimensions.find((x) => x.dimension === dim && x.model_name === m);
        row[m] = Number(cell?.avg_score ?? 0);
      }
      return row;
    });
  }, [report]);
  const modelNames = useMemo(() => Array.from(new Set((report?.ranking ?? []).map((r) => r.model_name))), [report]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>评测报告</h2>
          <div className="page-sub">总分排行 · 分维度 · 成本看板 · 单用例穿透</div>
        </div>
        {selected && report && <button className="btn primary" onClick={exportMd}>导出 Markdown</button>}
      </div>

      <div className="card card-pad">
        <div className="form-grid">
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="field-label">选择轮次</label>
            <select className="select" value={selected ?? ''} onChange={(e) => open(Number(e.target.value))}>
              <option value="">（选择）</option>
              {runs.map((r) => <option key={r.id} value={r.id}>#{r.id} {r.name}（{r.status}）</option>)}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="field-label">增量评测：跨轮次对比（勾选 {compareIds.length} 个）</label>
            <div className="radio-row">
              {runs.slice(0, 6).map((r) => (
                <label key={r.id} className={`check ${compareIds.includes(r.id) ? 'checked' : ''}`}>
                  <input type="checkbox" checked={compareIds.includes(r.id)} onChange={() => toggleCompare(r.id)} />
                  #{r.id}
                </label>
              ))}
              <button className="btn sm" onClick={compare}>对比</button>
            </div>
          </div>
        </div>
      </div>

      {loading && <div className="card card-pad"><Skeleton height={200} /></div>}

      {!report && !loading ? (
        <div className="card"><Empty icon="📊" title="选择一个轮次查看报告" /></div>
      ) : report && !loading ? (
        <>
          <div className="chart-grid">
            <div className="card card-pad">
              <h3>① 总分排行</h3>
              {rankingData.length === 0 ? <Empty icon="📭" title="暂无排行" /> : (
                <div className="chart-box">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={rankingData} layout="vertical" margin={{ left: 12, right: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                      <XAxis type="number" domain={[0, 100]} tick={{ fill: 'var(--text-3)', fontSize: 12 }} />
                      <YAxis type="category" dataKey="name" width={150} tick={{ fill: 'var(--text-2)', fontSize: 12 }} />
                      <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} />
                      <Bar dataKey="score" name="平均分" fill={PALETTE[0]} radius={[0, 6, 6, 0]} barSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
            <div className="card card-pad">
              <h3>② 分维度得分</h3>
              {dimensionData.length === 0 ? <Empty icon="📭" title="暂无维度数据" /> : (
                <div className="chart-box">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dimensionData} margin={{ left: 0, right: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="dimension" tick={{ fill: 'var(--text-2)', fontSize: 12 }} />
                      <YAxis domain={[0, 100]} tick={{ fill: 'var(--text-3)', fontSize: 12 }} />
                      <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {modelNames.map((n, i) => (
                        <Bar key={n} dataKey={n} fill={PALETTE[i % PALETTE.length]} radius={[4, 4, 0, 0]} barSize={18} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          <div className="card card-pad">
            <h3>③ 成本 / token / 耗时看板</h3>
            <div className="stat-grid" style={{ marginBottom: 0 }}>
              {report.costs.map((c) => (
                <div className="stat" key={c.model_id}>
                  <div className="stat-label">{c.model_name}</div>
                  <div className="stat-value" style={{ fontSize: 20 }}>
                    {c.total_cost_usd != null ? `$${Number(c.total_cost_usd).toFixed(4)}` : '—'}
                  </div>
                  <div className="stat-foot">tokens {c.total_tokens ?? '—'} · 均延迟 {c.avg_latency_ms != null ? `${c.avg_latency_ms}ms` : '—'}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}><h3 style={{ margin: 0 }}>④ 单用例穿透</h3></div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>用例</th><th>维度</th><th>模型</th><th>得分</th><th>判分理由</th></tr></thead>
                <tbody>
                  {report.details.map((d) => (
                    <tr key={`${d.case_id}-${d.model_id}`}>
                      <td>{d.case_title}</td>
                      <td>{d.dimension ?? '—'}</td>
                      <td>{d.model_name}</td>
                      <td style={{ fontWeight: 600 }}>{d.score != null ? Number(d.score).toFixed(1) : '—'}</td>
                      <td className="text-muted" style={{ maxWidth: 420 }} title={d.reason ?? ''}>
                        {d.reason ?? (d.raw_output ? d.raw_output.slice(0, 80) : '—')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
