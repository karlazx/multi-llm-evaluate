-- 004_run_reasons.sql — 无输出原因标注 + 轮次失败原因
ALTER TABLE run_outputs ADD COLUMN IF NOT EXISTS no_output_reason TEXT;
ALTER TABLE eval_runs   ADD COLUMN IF NOT EXISTS fail_reason TEXT;
