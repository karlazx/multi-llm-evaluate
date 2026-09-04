import { useEffect, useState } from 'react';
import { api, type BlindOutput, type Calibration, type EloRow, type EvalRun } from '../api';
import { useToast } from '../ui/toast';
import { Badge, Empty, Skeleton } from '../ui/bits';

interface Pair {
  case_id: number;
  case_title: string;
  case_type: string;
  a: BlindOutput;
  b: BlindOutput;
}

/** 从模型输出里抽取可渲染的 HTML（去 markdown 围栏 / 思考前缀） */
function extractHtml(raw: string | null): string {
  if (!raw) return '';
  const fence = raw.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1];
  const idx = raw.search(/<!DOCTYPE|<html/i);
  return idx >= 0 ? raw.slice(idx) : raw;
}

export default function BlindPage() {
  const toast = useToast();
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [runId, setRunId] = useState<number | null>(null);
  const [mode, setMode] = useState<'sample' | 'full'>('sample');
  const [outputs, setOutputs] = useState<BlindOutput[]>([]);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [idx, setIdx] = useState(0);
  const [elo, setElo] = useState<EloRow[]>([]);
  const [calib, setCalib] = useState<Calibration | null>(null);
  const [viewMode, setViewMode] = useState<'text' | 'render'>('text');
  const [voting, setVoting] = useState(false);

  useEffect(() => { void api.evals.list().then(setRuns); }, []);

  async function load(run: number, m: 'sample' | 'full') {
    setRunId(run);
    setMode(m);
    const data = await api.blind.outputs(run);
    setOutputs(data.outputs);

    const byCase = new Map<number, BlindOutput[]>();
    for (const o of data.outputs) {
      if (!byCase.has(o.case_id)) byCase.set(o.case_id, []);
      byCase.get(o.case_id)!.push(o);
    }
    const allPairs: Pair[] = [];
    for (const [, list] of byCase) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const swap = Math.random() < 0.5;
          allPairs.push({
            case_id: list[i].case_id,
            case_title: list[i].case_title,
            case_type: list[i].case_type,
            a: swap ? list[j] : list[i],
            b: swap ? list[i] : list[j],
          });
        }
      }
    }
    const sampled = m === 'full' ? allPairs : Object.values(byCase).map((l) => allPairs.find((p) => p.case_id === l[0].case_id)!).filter(Boolean);
    setPairs(sampled);
    setIdx(0);
    setElo(await api.blind.elo(run));
    setCalib(await api.blind.calibration(run));
  }

  const pair = pairs[idx];
  const finished = pairs.length > 0 && idx >= pairs.length;

  async function vote(winner: BlindOutput, loser: BlindOutput) {
    if (!runId || !pair || voting) return;
    setVoting(true);
    try {
      await api.blind.vote({ run_id: runId, case_id: pair.case_id, winner_model_id: winner.model_id, loser_model_id: loser.model_id });
      toast('success', '投票已记录');
      setElo(await api.blind.elo(runId));
      setCalib(await api.blind.calibration(runId));
      setIdx((i) => i + 1);
    } catch (e) { toast('error', '投票失败：' + (e as Error).message); }
    finally { setVoting(false); }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>人工盲评</h2>
          <div className="page-sub">匿名双栏对比 · 投票计 ELO · AI vs 人工一致性校准</div>
        </div>
      </div>

      <div className="card card-pad">
        <div className="row-split">
          <div className="field" style={{ marginBottom: 0, flex: 1, maxWidth: 320 }}>
            <label className="field-label">选择轮次</label>
            <select className="select" value={runId ?? ''} onChange={(e) => load(Number(e.target.value), mode)}>
              <option value="">（选择）</option>
              {runs.map((r) => <option key={r.id} value={r.id}>#{r.id} {r.name}（{r.status}）</option>)}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="field-label">模式</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className={mode === 'sample' ? 'btn primary sm' : 'btn sm'} onClick={() => runId && load(runId, 'sample')}>抽样校准</button>
              <button className={mode === 'full' ? 'btn primary sm' : 'btn sm'} onClick={() => runId && load(runId, 'full')}>全量人工</button>
            </div>
          </div>
        </div>
      </div>

      {!runId ? (
        <div className="card"><Empty icon="🕶️" title="选择一个轮次开始盲评" /></div>
      ) : finished ? (
        <div className="card"><Empty icon="🎉" title="本轮盲评已全部投完" sub="可查看下方 ELO 排名与校准面板" /></div>
      ) : pair ? (
        <div className="card card-pad">
          <div className="row-split">
            <h3 style={{ margin: 0 }}>盲评 {idx + 1}/{pairs.length} · 用例「{pair.case_title}」</h3>
            {pair.case_type === 'code' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className={viewMode === 'text' ? 'btn sm primary' : 'btn sm'} onClick={() => setViewMode('text')}>原文</button>
                <button className={viewMode === 'render' ? 'btn sm primary' : 'btn sm'} onClick={() => setViewMode('render')}>渲染预览</button>
              </div>
            )}
          </div>
          <div className="blind-grid" style={{ marginTop: 14 }}>
            {(['a', 'b'] as const).map((key) => {
              const o = pair[key];
              const other = key === 'a' ? pair.b : pair.a;
              const html = extractHtml(o.raw_output);
              return (
                <div className="blind-card" key={key}>
                  <div className="blind-head">
                    <span className="tag">模型 {key.toUpperCase()}</span>
                    <Badge>匿名</Badge>
                  </div>
                  {viewMode === 'render' && pair.case_type === 'code' && html ? (
                    <iframe className="blind-frame" title={`模型 ${key.toUpperCase()} 预览`} sandbox="allow-scripts" srcDoc={html} />
                  ) : (
                    <div className="blind-out">{o.raw_output ? o.raw_output.slice(0, 1800) : '（无输出）'}</div>
                  )}
                  <div className="blind-actions">
                    <button className="btn primary" disabled={voting} onClick={() => vote(o, other)}>投 {key.toUpperCase()}</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="card"><Skeleton height={220} /></div>
      )}

      {(elo.length > 0 || calib) && (
        <div className="chart-grid" style={{ marginTop: 16 }}>
          <div className="card card-pad">
            <h3>ELO 排名</h3>
            {elo.length === 0 ? <Empty icon="🗳️" title="还没有投票" /> : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>名次</th><th>模型</th><th>ELO</th><th>投票数</th></tr></thead>
                  <tbody>
                    {elo.map((r, i) => (
                      <tr key={r.model_id}>
                        <td>{['🥇', '🥈', '🥉'][i] ?? i + 1}</td>
                        <td>{r.model_name}</td>
                        <td style={{ fontWeight: 600 }}>{Math.round(r.elo)}</td>
                        <td>{r.votes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="card card-pad">
            <h3>AI vs 人工一致性</h3>
            {!calib ? <Skeleton height={140} /> : (
              <>
                <div className="stat" style={{ marginBottom: 12 }}>
                  <div className="stat-label">方向一致率</div>
                  <div className="stat-value">{calib.agreement != null ? `${(calib.agreement * 100).toFixed(0)}%` : '—'}</div>
                  <div className="stat-foot">{calib.comparable} 对可比 / 共 {calib.total_votes} 票</div>
                </div>
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>模型</th><th>AI 平均分</th><th>人工 ELO</th></tr></thead>
                    <tbody>
                      {calib.ai_avg.map((r) => {
                        const e = calib.elo.find((x) => x.model_id === r.id);
                        return (
                          <tr key={r.id}>
                            <td>{r.name}</td>
                            <td>{r.ai_score}</td>
                            <td>{e ? Math.round(e.elo) : 1500}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
