-- 002_reports_unique.sql — 每个 run 一份报告（归档唯一，支持 upsert）
ALTER TABLE reports ADD CONSTRAINT reports_run_id_key UNIQUE (run_id);
