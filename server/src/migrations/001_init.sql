-- 001_init.sql — 初始 schema（基于开发任务包 §5，扩展 per-model cost 与 thinking 配置）

-- 用例
CREATE TABLE IF NOT EXISTS cases (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  dimension TEXT,                -- 代码|写作|推理|长文本|工具调用|多模态|其他
  type TEXT,                     -- objective | subjective | code
  expected_answer TEXT,
  rubric TEXT,
  assertion_script TEXT,
  source TEXT DEFAULT 'self',    -- self | public
  tags TEXT[],
  status TEXT DEFAULT 'active',
  version INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 模型接入
CREATE TABLE IF NOT EXISTS models (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,            -- API 模型名，如 deepseek-v4-flash / openai/gpt-4o-mini
  display_name TEXT,
  provider TEXT,                 -- deepseek | openai | anthropic | relay(胜算云) ...
  protocol TEXT NOT NULL,        -- openai-v1 | openai-v2 | anthropic
  endpoint TEXT,                 -- base URL
  api_key_enc TEXT,              -- AES-256-GCM 加密存储
  model_name TEXT,               -- 别名，兼容旧字段（通常 = name）
  cost_input NUMERIC(12,6),      -- USD / 1M input tokens
  cost_output NUMERIC(12,6),     -- USD / 1M output tokens
  thinking TEXT DEFAULT 'disabled', -- disabled | enabled | adaptive（推理开关）
  default_params JSONB DEFAULT '{}'::jsonb, -- 透传参数（如 thinking struct / temperature）
  is_judge BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 评测轮次
CREATE TABLE IF NOT EXISTS eval_runs (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  case_ids BIGINT[],             -- 选用例
  model_ids BIGINT[],            -- 选模型
  judge_model_id BIGINT,
  status TEXT DEFAULT 'pending', -- pending | running | done | failed
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  config_json JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 跑测原始产出（全量落盘快照 + 关键指标列）
CREATE TABLE IF NOT EXISTS run_outputs (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT NOT NULL REFERENCES eval_runs(id) ON DELETE CASCADE,
  case_id BIGINT NOT NULL REFERENCES cases(id),
  model_id BIGINT NOT NULL REFERENCES models(id),
  raw_output TEXT,
  token_in INT,
  token_out INT,
  latency_ms INT,
  cost_usd NUMERIC(12,6),
  snapshot_json JSONB,           -- 完整 promptfoo 结果对象
  created_at TIMESTAMPTZ DEFAULT now()
);

-- AI 裁判得分（M2 用）
CREATE TABLE IF NOT EXISTS judge_scores (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT NOT NULL REFERENCES eval_runs(id) ON DELETE CASCADE,
  case_id BIGINT NOT NULL REFERENCES cases(id),
  model_id BIGINT NOT NULL REFERENCES models(id),
  score NUMERIC(5,2),
  rubric_text TEXT,
  reason TEXT,
  position INT
);

-- 人工盲评投票（M3 用）
CREATE TABLE IF NOT EXISTS blind_votes (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT NOT NULL REFERENCES eval_runs(id) ON DELETE CASCADE,
  case_id BIGINT NOT NULL REFERENCES cases(id),
  winner_model_id BIGINT,
  loser_model_id BIGINT,
  voter TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 报告归档（M2 用）
CREATE TABLE IF NOT EXISTS reports (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT NOT NULL REFERENCES eval_runs(id) ON DELETE CASCADE,
  ranking_json JSONB,
  dimension_json JSONB,
  generated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_run_outputs_run ON run_outputs(run_id);
CREATE INDEX IF NOT EXISTS idx_run_outputs_model ON run_outputs(model_id);
