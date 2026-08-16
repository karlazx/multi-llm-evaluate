import { useEffect, useMemo, useState } from 'react';
import { api, type BlindOutput, type Calibration, type EloRow, type EvalRun } from '../api';

interface Pair {
  case_id: number;
  case_title: string;
  case_type: string;
  a: BlindOutput; // 匿名 A
  b: BlindOutput; // 匿名 B
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
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [runId, setRunId] = useState<number | null>(null);
  const [mode, setMode] = useState<'sample' | 'full'>('sample');
  const [outputs, setOutputs] = useState<BlindOutput[]>([]);
  const [modelNames, setModelNames] = useState<Record<number, string>>({});
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [idx, setIdx] = useState(0);
  const [elo, setElo] = useState<EloRow[]>([]);
  const [calib, setCalib] = useState<Calibration | null>(null);
  const [preview, setPreview] = useState<BlindOutput | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { void api.evals.list().then(setRuns); }, []);

  async function load(run: number, m: 'sample' | 'full') {
    setRunId(run);
    setError('');
    const data = await api.blind.outputs(run);
    setOutputs(data.outputs);
    setModelNames(Object.fromEntries(data.models.map((x) => [x.id, x.name])));

    // 按用例分组，生成匿名对
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
    // 抽样模式：每个用例最多 1 对
    const sampled = m === 'full' ? allPairs : Object.values(byCase).map((l) => allPairs.find((p) => p.case_id === l[0].case_id)!).filter(Boolean);
    setPairs(sampled);
    setIdx(0);
    setElo(await api.blind.elo(run));
    setCalib(await api.blind.calibration(run));
  }

  const pair = pairs[idx];

  async function vote(winner: BlindOutput, loser: BlindOutput) {
    if (!runId || !pair) return;
    try {
      await api.blind.vote({
        run_id: runId,
        case_id: pair.case_id,
        winner_model_id: winner.model_id,
        loser_model_id: loser.model_id,
      });
      setElo(await api.blind.elo(runId));
      setCalib(await api.blind.calibration(runId));
      setIdx((i) => Math.min(i + 1, pairs.length - 1));
    } catch (e) { setError((e as Error).message); }
  }

  const done = idx >= pairs.length - 1;

  return (
    <div>
      <div className="page-head"><h2>人工盲评</h2></div>
      {error && <div className="alert">{error}</div>}

      <div className="panel">
        <label>选择轮次
          <select value={runId ?? ''} onChange={(e) => load(Number(e.target.value), mode)}>
            <option value="">（选择）</option>
            {runs.map((r) => <option key={r.id} value={r.id}>#{r.id} {r.name}（{r.status}）</option>)}
          </select>
        </label>
        <div className="row">
          <button className={mode === 'sample' ? 'btn primary' : 'btn'} onClick={() => runId && load(runId, 'sample')}>抽样校准</button>
          <button className={mode === 'full' ? 'btn primary' : 'btn'} onClick={() => runId && load(runId, 'full')}>全量人工</button>
        </div>
      </div>

      {pair && (
        <div className="panel">
          <h3>盲评 #{idx + 1}/{pairs.length} · 用例「{pair.case_title}」</h3>
          <div className="two-col">
            {(['a', 'b'] as const).map((key) => {
              const o = pair[key];
              const isCode = pair.case_type === 'code';
              return (
                <div className="blind-card" key={key}>
                  <div className="blind-label">模型 {key.toUpperCase()}</div>
                  {isCode && (
                    <button className="btn sm" onClick={() => setPreview(preview === o ? null : o)}>
                      {preview === o ? '收起预览' : '预览 HTML'}
                    </button>
                  )}
                  <pre className="blind-out">{o.raw_output ? o.raw_output.slice(0, 1200) : '（无输出）'}</pre>
                  <button className="btn primary" onClick={() => vote(o, key === 'a' ? pair.b : pair.a)}>
                    投 {key.toUpperCase()}
                  </button>
                </div>
              );
            })}
          </div>
          {done && <div className="muted">本轮盲评已全部投完，可查看下方 ELO 与校准。</div>}
        </div>
      )}

      {preview && (
        <div className="panel">
          <h3>产物预览（沙箱 iframe）</h3>
          <iframe
            title="artifact-preview"
            className="preview-frame"
            sandbox="allow-scripts"
            srcDoc={extractHtml(preview.raw_output)}
          />
        </div>
      )}

      {elo.length > 0 && (
        <div className="panel">
          <h3>ELO 排名</h3>
          <table className="table">
            <thead><tr><th>名次</th><th>模型</th><th>ELO</th><th>投票数</th></tr></thead>
            <tbody>
              {elo.map((r, i) => (
                <tr key={r.model_id}>
                  <td>{i + 1}</td>
                  <td>{r.model_name}</td>
                  <td>{Math.round(r.elo)}</td>
                  <td>{r.votes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {calib && (
        <div className="panel">
          <h3>AI vs 人工一致性</h3>
          <div className="muted">
            一致性：{calib.agreement != null ? `${(calib.agreement * 100).toFixed(0)}%` : '（暂无）'}（{calib.comparable} 对可比 / 共 {calib.total_votes} 票）
          </div>
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
      )}
    </div>
  );
}
