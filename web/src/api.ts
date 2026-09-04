// 与后端交互的类型 + 轻量 fetch 封装

export interface CaseRow {
  id: number;
  title: string;
  prompt: string;
  dimension: string | null;
  type: string;
  expected_answer: string | null;
  rubric: string | null;
  assertion_script: string | null;
  source: string;
  tags: string[] | null;
  status: string;
  version: number;
}

export interface ModelRow {
  id: number;
  name: string;
  display_name: string | null;
  provider: string | null;
  protocol: string;
  endpoint: string | null;
  api_key_masked: string;
  cost_input: number | null;
  cost_output: number | null;
  thinking: string;
  is_judge: boolean;
  status: string;
}

export interface EvalRun {
  id: number;
  name: string;
  case_ids: number[];
  model_ids: number[];
  status: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface Report {
  run_id: number;
  run_ids: number[];
  generated_at: string;
  ranking: Array<{ model_id: number; model_name: string; avg_score: number | null }>;
  dimensions: Array<{ dimension: string; model_id: number; model_name: string; avg_score: number | null }>;
  costs: Array<{ model_id: number; model_name: string; total_cost_usd: number | null; total_tokens: number | null; avg_latency_ms: number | null }>;
  details: Array<{
    case_id: number;
    case_title: string;
    dimension: string | null;
    model_id: number;
    model_name: string;
    score: number | null;
    reason: string | null;
    raw_output: string | null;
    latency_ms: number | null;
  }>;
}

export interface PairwiseRow {
  id: number;
  case_id: number;
  case_title: string;
  model_a_id: number;
  model_b_id: number;
  model_a_display: string;
  model_b_display: string;
  wins_a: number;
  wins_b: number;
  reason_ab: string | null;
  reason_ba: string | null;
}

export interface BlindOutput {
  case_id: number;
  model_id: number;
  raw_output: string | null;
  case_title: string;
  case_type: string;
}
export interface EloRow { model_id: number; model_name: string; elo: number; votes: number; }
export interface Calibration {
  agreement: number | null;
  comparable: number;
  total_votes: number;
  ai_avg: Array<{ id: number; name: string; ai_score: number }>;
  elo: EloRow[];
}

export interface RunOutput {
  id: number;
  run_id: number;
  case_id: number;
  model_id: number;
  raw_output: string | null;
  token_in: number | null;
  token_out: number | null;
  latency_ms: number | null;
  cost_usd: number | null;
  case_title: string;
  model_display: string | null;
  model_name: string;
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const hasBody = init?.body !== undefined && init?.body !== null;
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(hasBody ? { 'content-type': 'application/json' } : {}),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  cases: {
    list: () => req<CaseRow[]>('/api/cases'),
    create: (b: Partial<CaseRow>) => req<CaseRow>('/api/cases', { method: 'POST', body: JSON.stringify(b) }),
    import: (cases: Array<Record<string, unknown>>) =>
      req<{ inserted: number; failed: number; errors: Array<{ index: number; reason: string }> }>('/api/cases/import', { method: 'POST', body: JSON.stringify(cases) }),
    update: (id: number, b: Partial<CaseRow>) => req<CaseRow>(`/api/cases/${id}`, { method: 'PUT', body: JSON.stringify(b) }),
    archive: (id: number) => req<{ ok: boolean }>(`/api/cases/${id}`, { method: 'DELETE' }),
  },
  models: {
    list: () => req<ModelRow[]>('/api/models'),
    create: (b: Record<string, unknown>) => req<ModelRow>('/api/models', { method: 'POST', body: JSON.stringify(b) }),
    update: (id: number, b: Record<string, unknown>) => req<ModelRow>(`/api/models/${id}`, { method: 'PUT', body: JSON.stringify(b) }),
    archive: (id: number) => req<{ ok: boolean }>(`/api/models/${id}`, { method: 'DELETE' }),
    test: (id: number) => req<{ ok: boolean; message: string; latencyMs: number | null; sample?: string }>(`/api/models/${id}/test`, { method: 'POST' }),
  },
  evals: {
    list: () => req<EvalRun[]>('/api/evals'),
    get: (id: number) => req<EvalRun>(`/api/evals/${id}`),
    create: (b: { name?: string; case_ids: number[]; model_ids: number[] }) => req<EvalRun>('/api/evals', { method: 'POST', body: JSON.stringify(b) }),
    outputs: (id: number) => req<RunOutput[]>(`/api/evals/${id}/outputs`),
    report: (id: number) => req<Report>(`/api/evals/${id}/report`),
    exportMd: async (id: number) => (await fetch(`/api/evals/${id}/export`)).text(),
    exportPdfUrl: (id: number) => `/api/evals/${id}/export?format=pdf`,
    compare: (ids: number[]) => req<Report>(`/api/evals/compare?run_ids=${ids.join(',')}`),
    runPairwise: (id: number) => req<{ pairs: number; judged: number }>(`/api/evals/${id}/pairwise`, { method: 'POST' }),
    pairwise: (id: number) => req<PairwiseRow[]>(`/api/evals/${id}/pairwise`),
  },
  blind: {
    outputs: (runId: number) =>
      req<{ outputs: BlindOutput[]; models: Array<{ id: number; name: string }> }>(`/api/blind/${runId}/outputs`),
    vote: (b: { run_id: number; case_id: number; winner_model_id: number; loser_model_id: number }) =>
      req<{ id: number }>('/api/blind/votes', { method: 'POST', body: JSON.stringify(b) }),
    elo: (runId: number) => req<EloRow[]>(`/api/blind/${runId}/elo`),
    calibration: (runId: number) => req<Calibration>(`/api/blind/${runId}/calibration`),
  },
};
