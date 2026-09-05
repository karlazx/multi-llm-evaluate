import type { CSSProperties, ReactNode } from 'react';

export function Badge({ variant, children }: { variant?: 'primary' | 'success' | 'warning' | 'danger'; children: ReactNode }) {
  return <span className={`badge ${variant ?? ''}`}>{children}</span>;
}

/** 状态 → 徽章变体 */
export function statusBadge(status: string) {
  const map: Record<string, 'success' | 'warning' | 'danger' | 'primary' | undefined> = {
    done: 'success', active: 'success', running: 'primary', pending: 'warning', failed: 'danger', stopped: 'warning', archived: undefined,
  };
  return <Badge variant={map[status]}>{status}</Badge>;
}

export function Skeleton({ height = 16, style }: { height?: number; style?: CSSProperties }) {
  return <div className="skeleton" style={{ height, ...style }} />;
}

export function Empty({ icon = '📭', title, sub }: { icon?: string; title: string; sub?: string }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <div className="empty-title">{title}</div>
      {sub && <div className="empty-sub">{sub}</div>}
    </div>
  );
}

export function StatCard({ label, value, foot }: { label: string; value: ReactNode; foot?: ReactNode }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {foot && <div className="stat-foot">{foot}</div>}
    </div>
  );
}

/** 简单分页器 */
export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  const nums: number[] = [];
  for (let i = Math.max(1, page - 2); i <= Math.min(pages, page + 2); i++) nums.push(i);
  return (
    <div className="pages">
      <button className="page-btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹</button>
      {nums[0] > 1 && <span className="page-btn" style={{ border: 'none', background: 'none' }}>…</span>}
      {nums.map((n) => (
        <button key={n} className={`page-btn ${n === page ? 'active' : ''}`} onClick={() => onPage(n)}>{n}</button>
      ))}
      {nums[nums.length - 1] < pages && <span className="page-btn" style={{ border: 'none', background: 'none' }}>…</span>}
      <button className="page-btn" disabled={page >= pages} onClick={() => onPage(page + 1)}>›</button>
    </div>
  );
}
