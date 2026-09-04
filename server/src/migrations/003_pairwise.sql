-- 003_pairwise.sql — AI 裁判 pairwise 位置交换消偏结果
CREATE TABLE IF NOT EXISTS pairwise_results (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT NOT NULL REFERENCES eval_runs(id) ON DELETE CASCADE,
  case_id BIGINT NOT NULL REFERENCES cases(id),
  model_a_id BIGINT NOT NULL REFERENCES models(id),
  model_b_id BIGINT NOT NULL REFERENCES models(id),
  wins_a NUMERIC(3,1) DEFAULT 0,   -- 两次对评中 A 胜出次数（tie 各计 0.5）
  wins_b NUMERIC(3,1) DEFAULT 0,
  reason_ab TEXT,                  -- A 在前一轮的理由
  reason_ba TEXT,                  -- 位置交换后一轮的理由
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (run_id, case_id, model_a_id, model_b_id)
);
