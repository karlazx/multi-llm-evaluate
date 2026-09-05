import { useEffect, useState } from 'react';
import { api, type BlindOutput, type Calibration, type EloRow, type EvalRun } from '../api';
import { useToast } from '../ui/toast';
import { ConfirmDialog } from '../ui/Modal';
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
  const [loading, setLoading] = useState(false);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [idx, setIdx] = useState(0);
  const [elo, setElo] = useState<EloRow[]>([]);
  const [calib, setCalib] = useState<Calibration | null>(null);
  const [viewMode, setViewMode] = useState<'text' | 'render'>('text');
  const [voting, setVoting] = useState(false);
  const [askClear, setAskClear] = useState(false);

  useEffect(() => { void api.evals.list().then(setRuns); }, []);

  async function load(run: number, m: 'sample' | 'full') {
    setRunId(run);
    setMode(m);
    setLoading(true);
    try {
      const data = await api.blind.outputs(run);
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
      const sampled = m === 'full' ? allPairs : Array.from(byCase.keys()).map((cid) => allPairs.find((p) => p.case_id === cid)).filter((p): p is Pair => !!p);
      setPairs(sampled);
      setIdx(0);
      setElo(await api.blind.elo(run));
      setCalib(await api.blind.calibration(run));
      toast('info', `已切换为${m === 'sample' ? '抽样校准' : '全量人工'}模式，共 ${sampled.length} 组对比`);
    } catch (e) {
      toast('error', '加载失败：' + (e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function refreshStats() {
    if (!runId) return;
    setElo(await api.blind.elo(runId));
    setCalib(await api.blind.calibration(runId));
  }

  async function vote(winner: BlindOutput | null, loser?: BlindOutput) {
    if (!runId || !pair || voting) return;
    setVoting(true);
    try {
      if (winner === null) {
        await api.blind.vote({ run_id: runId, case_id: pair.case_id, winner_model_id: null });
        toast('success', '已记录：都不合格（不计入 ELO）');
      } else {
        await api.blind.vote({ run_id: runId, case_id: pair.case_id, winner_model_id: winner.model_id, loser_model_id: loser!.model_id });
        toast('success', '投票已记录');
      }
      await refreshStats();
      setIdx((i) => i + 1);
    } catch (e) { toast('error', '投票失败：' + (e as Error).message); }
    finally { setVoting(false); }
  }

  async function clearVotes() {
    if (!runId) return;
    try {
      const r = await api.blind.clearVotes(runId);
      toast('success', `已清空 ${r.deleted} 票，重新开始盲评`);
      setAskClear(false);
      await load(runId, mode);
    } catch (e) { toast('error', '清空失败：' + (e as Error).message); }
  }

  const pair = pairs[idx];
  const finished = pairs.length > 0 && idx >= pairs.length;
  const hasVotes = !!calib && (calib.total_votes + calib.abstain) > 0;

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>人工盲评</h2>
          <div className="page-sub">匿名双栏对比 · 投票计 ELO（弃权不计分）· AI vs 人工一致性校准</div>
        </div>
      </div>

      <div className="card card-pad">
        <div className="row-split">
          <div className="field" style={{ marginBottom: 0, flex: 1, maxWidth: 320 }}>
            <label className="field-label">选择轮次</label>
            <select className="select" value={runId ?? ''} onChange={(e) => { if (e.target.value) load(Number(e.target.value), mode); }}>
              <option value="">（选择）</option>
              {runs.map((r) => <option key={r.id} value={r.id}>#{r.id} {r.name}（{r.status}）</option>)}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="field-label">模式</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className={mode === 'sample' ? 'btn primary sm' : 'btn sm'} disabled={!runId} onClick={() => runId && load(runId, 'sample')}>抽样校准</button>
              <button className={mode === 'full' ? 'btn primary sm' : 'btn sm'} disabled={!runId} onClick={() => runId && load(runId, 'full')}>全量人工</button>
              {runId && hasVotes && <button className="btn sm danger" onClick={() => setAskClear(true)}>清空投票重来</button>}
            </div>
          </div>
        </div>
        {!runId && <div className="hint-bar">先选择轮次，模式按钮才可用</div>}
      </div>

      {runId && loading && <div className="card card-pad"><Skeleton height={220} /></div>}

      {runId && !loading && pairs.length === 0 && (
        <div className="card"><Empty icon="🕶️" title="该轮次没有可盲评的对比组" sub="需要本轮 ≥2 个模型且都有产出（跑测完成后才会出现对比数据）" /></div>
      )}

      {runId && !loading && finished && (
        <div className="card"><Empty icon="🎉" title="本轮盲评已全部投完" sub="可查看下方 ELO 排名与校准面板，或点「清空投票重来」" /></div>
      )}

      {pair && (
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
              const empty = !o.raw_output || String(o.raw_output).trim() === '';
              return (
                <div className="blind-card" key={key}>
                  <div className="blind-head">
                    <span className="tag">模型 {key.toUpperCase()}</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {empty && <Badge variant="danger">无输出</Badge>}
                      <Badge>匿名</Badge>
                    </div>
                  </div>
                  {viewMode === 'render' && pair.case_type === 'code' && html ? (
                    <iframe className="blind-frame" title={`模型 ${key.toUpperCase()} 预览`} sandbox="allow-scripts" srcDoc={html} />
                  ) : (
                    <div className="blind-out">{empty ? '（该模型无输出）' : o.raw_output!.slice(0, 1800)}</div>
                  )}
                  <div className="blind-actions">
                    <button className="btn primary" disabled={voting} onClick={() => vote(o, other)}>投 {key.toUpperCase()}</button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="row-split" style={{ marginTop: 14 }}>
            <span className="hint-bar">两边都不满意？投「都不合格」——记录弃权，不计入 ELO。</span>
            <button className="btn danger" disabled={voting} onClick={() => vote(null)}>都不合格</button>
          </div>
        </div>
      )}

      {hasVotes && (
        <div className="chart-grid" style={{ marginTop: 16 }}>
          <div className="card card-pad">
            <h3>ELO 排名</h3>
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
          </div>
          <div className="card card-pad">
            <h3>AI vs 人工一致性</h3>
            {calib && (
              <>
                <div className="stat" style={{ marginBottom: 12 }}>
                  <div className="stat-label">方向一致率</div>
                  <div className="stat-value">{calib.agreement != null ? `${(calib.agreement * 100).toFixed(0)}%` : '—'}</div>
                  <div className="stat-foot">{calib.comparable} 对可比 · {calib.total_votes} 有效票 · {calib.abstain} 弃权（都不合格）</div>
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

      {askClear && (
        <ConfirmDialog
          title="清空本轮投票"
          message="将删除该轮次全部人工盲评投票（ELO 与一致率会重算），确定继续？"
          confirmText="清空并重来"
          danger
          onConfirm={clearVotes}
          onCancel={() => setAskClear(false)}
        />
      )}
    </div>
  );
}
