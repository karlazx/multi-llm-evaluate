import { useEffect, useRef, useState } from 'react';
import { api, type CaseRow, type ModelRow, type EvalRun, type RunOutput } from '../api';

export default function EvalsPage() {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [models, setModels] = useState<ModelRow[]>([]);
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [selCases, setSelCases] = useState<number[]>([]);
  const [selModels, setSelModels] = useState<number[]>([]);
  const [name, setName] = useState('');
  const [activeRun, setActiveRun] = useState<EvalRun | null>(null);
  const [outputs, setOutputs] = useState<RunOutput[]>([]);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function load() {
    const [c, m, r] = await Promise.all([api.cases.list(), api.models.list(), api.evals.list()]);
    setCases(c.filter((x) => x.status === 'active'));
    setModels(m.filter((x) => x.status === 'active'));
    setRuns(r);
  }
  useEffect(() => {
    void load();
    return () => { if (timer.current) clearInterval(timer.current); };
  }, []);

  function toggle(set: number[], v: number): number[] {
    return set.includes(v) ? set.filter((x) => x !== v) : [...set, v];
  }

  async function launch() {
    if (!selCases.length || !selModels.length) { setError('至少选一个用例和一个模型'); return; }
    setError('');
    try {
      const run = await api.evals.create({ name: name || undefined, case_ids: selCases, model_ids: selModels });
      setActiveRun(run);
      poll(run.id);
      await load();
    } catch (e) { setError((e as Error).message); }
  }

  function poll(id: number) {
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(async () => {
      try {
        const run = await api.evals.get(id);
        setActiveRun(run);
        setOutputs(await api.evals.outputs(id));
        if (run.status === 'done' || run.status === 'failed') {
          if (timer.current) clearInterval(timer.current);
          await load();
        }
      } catch { /* 忽略单次轮询失败 */ }
    }, 1500);
  }

  async function view(run: EvalRun) {
    setActiveRun(run);
    setOutputs(await api.evals.outputs(run.id));
  }

  const total = activeRun ? activeRun.case_ids.length * activeRun.model_ids.length : 0;
  const progress = activeRun && total ? Math.min(1, outputs.length / total) : 0;

  return (
    <div>
      <div className="page-head"><h2>发起评测</h2></div>
      {error && <div className="alert">{error}</div>}

      <div className="panel">
        <h3>选择用例与模型</h3>
        <label>轮次名 <input value={name} onChange={(e) => setName(e.target.value)} placeholder="（可留空）" /></label>
        <div className="two-col">
          <div>
            <h4>用例（{selCases.length} 选中）</h4>
            {cases.map((c) => (
              <label key={c.id} className="check">
                <input type="checkbox" checked={selCases.includes(c.id)} onChange={() => setSelCases(toggle(selCases, c.id))} />
                <span className="badge">{c.type}</span> {c.title}
              </label>
            ))}
          </div>
          <div>
            <h4>模型（{selModels.length} 选中）</h4>
            {models.map((m) => (
              <label key={m.id} className="check">
                <input type="checkbox" checked={selModels.includes(m.id)} onChange={() => setSelModels(toggle(selModels, m.id))} />
                <span className="badge">{m.protocol}</span> {m.display_name ?? m.name}
              </label>
            ))}
          </div>
        </div>
        <div className="row">
          <button className="btn primary" onClick={launch}>发起评测</button>
        </div>
      </div>

      {activeRun && (
        <div className="panel">
          <h3>轮次 #{activeRun.id}「{activeRun.name}」 <span className="badge">{activeRun.status}</span></h3>
          {activeRun.status === 'running' && (
            <div className="progress">
              <div className="progress-bar" style={{ width: `${progress * 100}%` }} />
            </div>
          )}
          <div className="muted">产出 {outputs.length} / {total}</div>
          <table className="table">
            <thead><tr><th>用例</th><th>模型</th><th>延迟</th><th>token in/out</th><th>成本</th><th>输出预览</th></tr></thead>
            <tbody>
              {outputs.map((o) => (
                <tr key={o.id}>
                  <td>{o.case_title}</td>
                  <td>{o.model_display ?? o.model_name}</td>
                  <td>{o.latency_ms ?? '-'}ms</td>
                  <td>{o.token_in ?? '-'} / {o.token_out ?? '-'}</td>
                  <td>{o.cost_usd != null ? `$${Number(o.cost_usd).toFixed(6)}` : '—'}</td>
                  <td className="preview">{o.raw_output ? o.raw_output.slice(0, 80) : '（无输出）'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3>历史轮次</h3>
      <table className="table">
        <thead><tr><th>ID</th><th>名称</th><th>状态</th><th>开始</th><th>结束</th><th>操作</th></tr></thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id}>
              <td>{r.id}</td>
              <td>{r.name}</td>
              <td><span className="badge">{r.status}</span></td>
              <td>{r.started_at ? new Date(r.started_at).toLocaleTimeString() : '-'}</td>
              <td>{r.finished_at ? new Date(r.finished_at).toLocaleTimeString() : '-'}</td>
              <td><button className="btn sm" onClick={() => view(r)}>查看</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
