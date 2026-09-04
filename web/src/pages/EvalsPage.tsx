import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type CaseRow, type ModelRow, type EvalRun, type RunOutput } from '../api';
import { Drawer } from '../ui/Drawer';
import { useToast } from '../ui/toast';
import { Badge, Empty, Skeleton, statusBadge } from '../ui/bits';

export default function EvalsPage() {
  const toast = useToast();
  const [runs, setRuns] = useState<EvalRun[] | null>(null);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [models, setModels] = useState<ModelRow[]>([]);
  const [selCases, setSelCases] = useState<number[]>([]);
  const [selModels, setSelModels] = useState<number[]>([]);
  const [name, setName] = useState('');
  const [activeRun, setActiveRun] = useState<EvalRun | null>(null);
  const [outputs, setOutputs] = useState<RunOutput[]>([]);
  const [detail, setDetail] = useState<RunOutput | null>(null);
  const [launching, setLaunching] = useState(false);
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

  const toggle = (set: number[], v: number, f: (x: number[]) => void) => f(set.includes(v) ? set.filter((x) => x !== v) : [...set, v]);

  async function launch() {
    if (!selCases.length || !selModels.length) { toast('error', '至少选一个用例和一个模型'); return; }
    setLaunching(true);
    try {
      const run = await api.evals.create({ name: name || undefined, case_ids: selCases, model_ids: selModels });
      toast('success', `评测 #${run.id} 已发起`);
      setActiveRun(run);
      setOutputs([]);
      poll(run.id);
      await load();
    } catch (e) { toast('error', '发起失败：' + (e as Error).message); }
    finally { setLaunching(false); }
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

  /** 每个模型的进度：已完成用例数 / 本轮用例数 */
  const perModel = useMemo(() => {
    if (!activeRun) return [];
    return activeRun.model_ids.map((mid) => {
      const model = models.find((m) => m.id === mid);
      const doneCount = outputs.filter((o) => o.model_id === mid).length;
      return { id: mid, name: model?.display_name ?? model?.name ?? `#${mid}`, done: doneCount, total: activeRun.case_ids.length };
    });
  }, [activeRun, outputs, models]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>发起评测</h2>
          <div className="page-sub">勾选用例 × 模型，后台并发跑测，进度实时轮询</div>
        </div>
      </div>

      <div className="card card-pad">
        <h3>选择用例与模型</h3>
        <div className="field">
          <label className="field-label">轮次名</label>
          <input className="input" style={{ maxWidth: 320 }} placeholder="（可留空，自动编号）" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="form-grid">
          <div>
            <label className="field-label">用例（已选 {selCases.length}）</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {cases.map((c) => (
                <label key={c.id} className={`check ${selCases.includes(c.id) ? 'checked' : ''}`}>
                  <input type="checkbox" checked={selCases.includes(c.id)} onChange={() => toggle(selCases, c.id, setSelCases)} />
                  <Badge variant={c.type === 'objective' ? 'success' : c.type === 'code' ? 'primary' : undefined}>{c.type}</Badge>
                  <span>{c.title}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="field-label">模型（已选 {selModels.length}）</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {models.map((m) => (
                <label key={m.id} className={`check ${selModels.includes(m.id) ? 'checked' : ''}`}>
                  <input type="checkbox" checked={selModels.includes(m.id)} onChange={() => toggle(selModels, m.id, setSelModels)} />
                  <Badge variant={m.protocol === 'openai-v2' ? 'primary' : undefined}>{m.protocol}</Badge>
                  <span>{m.display_name ?? m.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="btn-row">
          <button className="btn primary" disabled={launching} onClick={launch}>{launching ? '发起中…' : `发起评测（${selCases.length} × ${selModels.length}）`}</button>
        </div>
      </div>

      {activeRun && (
        <div className="card card-pad">
          <div className="row-split">
            <h3 style={{ margin: 0 }}>轮次 #{activeRun.id}「{activeRun.name}」 {statusBadge(activeRun.status)}</h3>
            <span className="text-muted">产出 {outputs.length} / {total}</span>
          </div>
          <div style={{ margin: '14px 0' }}>
            <div className="progress"><div className="progress-bar" style={{ width: `${progress * 100}%` }} /></div>
          </div>
          {perModel.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10, marginBottom: 14 }}>
              {perModel.map((p) => {
                const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
                const st = p.done >= p.total && p.total > 0 ? 'done' : p.done > 0 ? 'running' : 'pending';
                return (
                  <div key={p.id} className="card card-pad" style={{ margin: 0, padding: 12 }}>
                    <div className="row-split">
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</span>
                      {statusBadge(st)}
                    </div>
                    <div className="hint-bar">{p.done}/{p.total} 用例完成</div>
                    <div style={{ marginTop: 6 }}><div className="progress"><div className="progress-bar" style={{ width: `${pct}%` }} /></div></div>
                  </div>
                );
              })}
            </div>
          )}
          {outputs.length > 0 ? (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>用例</th><th>模型</th><th>延迟</th><th>token in/out</th><th>成本</th><th>输出预览</th></tr></thead>
                <tbody>
                  {outputs.map((o) => (
                    <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => setDetail(o)}>
                      <td>{o.case_title}</td>
                      <td>{o.model_display ?? o.model_name}</td>
                      <td className="mono">{o.latency_ms ?? '—'}ms</td>
                      <td className="mono">{o.token_in ?? '—'} / {o.token_out ?? '—'}</td>
                      <td className="mono">{o.cost_usd != null ? `$${Number(o.cost_usd).toFixed(6)}` : '—'}</td>
                      <td className="text-muted" style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {o.raw_output ? o.raw_output.slice(0, 60) : '（无输出）'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : activeRun.status === 'running' ? (
            <div style={{ padding: '8px 0' }}><Skeleton height={40} /><div style={{ height: 8 }} /><Skeleton height={40} /></div>
          ) : null}
        </div>
      )}

      <div className="card">
        <div className="row-split" style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ margin: 0 }}>历史轮次</h3>
        </div>
        {!runs ? (
          <div style={{ padding: 16 }}><Skeleton height={40} /></div>
        ) : runs.length === 0 ? (
          <Empty icon="🕘" title="暂无历史轮次" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>ID</th><th>名称</th><th>状态</th><th>用例×模型</th><th>开始</th><th>结束</th><th>操作</th></tr></thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">#{r.id}</td>
                    <td>{r.name}</td>
                    <td>{statusBadge(r.status)}</td>
                    <td>{r.case_ids.length} × {r.model_ids.length}</td>
                    <td className="text-muted">{r.started_at ? new Date(r.started_at).toLocaleTimeString() : '—'}</td>
                    <td className="text-muted">{r.finished_at ? new Date(r.finished_at).toLocaleTimeString() : '—'}</td>
                    <td><button className="btn sm ghost" onClick={() => view(r)}>查看</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detail && (
        <Drawer title={`${detail.case_title} · ${detail.model_display ?? detail.model_name}`} onClose={() => setDetail(null)}>
          <dl className="kv">
            <dt>延迟</dt><dd>{detail.latency_ms ?? '—'}ms</dd>
            <dt>token</dt><dd>in {detail.token_in ?? '—'} · out {detail.token_out ?? '—'}</dd>
            <dt>成本</dt><dd>{detail.cost_usd != null ? `$${Number(detail.cost_usd).toFixed(6)}` : '—'}</dd>
          </dl>
          <div className="field" style={{ marginTop: 16 }}>
            <label className="field-label">原始输出</label>
            <div className="pre-block">{detail.raw_output ?? '（无输出）'}</div>
          </div>
        </Drawer>
      )}
    </div>
  );
}
