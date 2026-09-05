import { useEffect, useMemo, useState } from 'react';
import { api, type CaseRow } from '../api';
import { Drawer } from '../ui/Drawer';
import { ConfirmDialog } from '../ui/Modal';
import { useToast } from '../ui/toast';
import { Badge, Empty, Pager, Skeleton } from '../ui/bits';

const DIMENSIONS = ['代码', '写作', '推理', '长文本', '工具调用', '多模态', '其他'];
const TYPES = [
  { value: 'objective', label: 'objective（客观）' },
  { value: 'subjective', label: 'subjective（主观）' },
  { value: 'code', label: 'code（代码）' },
];
const PAGE_SIZE = 10;

type FormState = { title: string; prompt: string; dimension: string; type: string; expected_answer: string; rubric: string };
const empty: FormState = { title: '', prompt: '', dimension: '', type: 'subjective', expected_answer: '', rubric: '' };

export default function CasesPage() {
  const toast = useToast();
  const [rows, setRows] = useState<CaseRow[] | null>(null);
  const [q, setQ] = useState('');
  const [fDim, setFDim] = useState('');
  const [fType, setFType] = useState('');
  const [fStatus, setFStatus] = useState('active');
  const [sort, setSort] = useState<{ key: keyof CaseRow; asc: boolean }>({ key: 'id', asc: true });
  const [page, setPage] = useState(1);

  // 抽屉状态
  const [editing, setEditing] = useState<CaseRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<CaseRow | null>(null);
  const [toArchive, setToArchive] = useState<CaseRow | null>(null);
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState('');
  const [importErr, setImportErr] = useState('');
  const [importingBusy, setImportingBusy] = useState(false);

  async function load() {
    try { setRows(await api.cases.list(fStatus === 'all' ? undefined : fStatus)); }
    catch (e) { toast('error', '加载失败：' + (e as Error).message); setRows([]); }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [fStatus]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const kw = q.trim().toLowerCase();
    const list = rows.filter((c) =>
      (!kw || c.title.toLowerCase().includes(kw) || c.prompt.toLowerCase().includes(kw)) &&
      (!fDim || c.dimension === fDim) &&
      (!fType || c.type === fType),
    );
    list.sort((a, b) => {
      const av = a[sort.key] ?? ''; const bv = b[sort.key] ?? '';
      const cmp = String(av).localeCompare(String(bv), 'zh');
      return sort.asc ? cmp : -cmp;
    });
    return list;
  }, [rows, q, fDim, fType, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function openCreate() { setEditing(null); setCreating(true); setForm(empty); setErrors({}); }
  function openEdit(c: CaseRow) {
    setCreating(false); setEditing(c); setErrors({});
    setForm({
      title: c.title, prompt: c.prompt, dimension: c.dimension ?? '', type: c.type,
      expected_answer: c.expected_answer ?? '', rubric: c.rubric ?? '',
    });
  }
  function closeDrawer() { setCreating(false); setEditing(null); setDetail(null); }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.title.trim()) errs.title = '标题必填';
    if (!form.prompt.trim()) errs.prompt = 'Prompt 必填';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function save() {
    if (!validate()) return;
    setSaving(true);
    try {
      if (editing) await api.cases.update(editing.id, form);
      else await api.cases.create(form);
      toast('success', editing ? `用例 #${editing.id} 已更新` : '用例已创建');
      closeDrawer();
      await load();
    } catch (e) { toast('error', '保存失败：' + (e as Error).message); }
    finally { setSaving(false); }
  }

  async function doImport() {
    setImportErr('');
    let parsed: unknown;
    try { parsed = JSON.parse(importText); }
    catch { setImportErr('JSON 格式不合法，请检查'); return; }
    const items = Array.isArray(parsed) ? parsed : (parsed as { cases?: unknown[] })?.cases;
    if (!Array.isArray(items) || items.length === 0) { setImportErr('需要 JSON 数组，至少 1 条'); return; }
    setImportingBusy(true);
    try {
      const r = await api.cases.import(items as Array<Record<string, unknown>>);
      toast('success', `导入完成：成功 ${r.inserted} 条${r.failed ? `，失败 ${r.failed} 条` : ''}`);
      if (r.failed) setImportErr(r.errors.map((e) => `第 ${e.index + 1} 条：${e.reason}`).join('；'));
      else { setImporting(false); setImportText(''); }
      await load();
    } catch (e) { setImportErr('导入失败：' + (e as Error).message); }
    finally { setImportingBusy(false); }
  }

  async function archive(c: CaseRow) {
    try {
      await api.cases.archive(c.id);
      toast('success', `用例「${c.title}」已停用`);
      setToArchive(null);
      await load();
    } catch (e) { toast('error', '停用失败：' + (e as Error).message); }
  }

  function th(key: keyof CaseRow, label: string) {
    const active = sort.key === key;
    return (
      <th className="sortable" onClick={() => setSort({ key, asc: active ? !sort.asc : true })}>
        {label}{active ? (sort.asc ? ' ↑' : ' ↓') : ''}
      </th>
    );
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>用例库</h2>
          <div className="page-sub">{rows ? `${rows.filter((c) => c.status === 'active').length} 个活跃用例` : '加载中…'}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => { setImporting(true); setImportErr(''); }}>批量导入</button>
          <button className="btn primary" onClick={openCreate}>+ 新建用例</button>
        </div>
      </div>

      <div className="card">
        <div className="row-split" style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <input className="input" style={{ maxWidth: 300 }} placeholder="搜索标题 / prompt…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <select className="select" style={{ width: 110 }} value={fStatus} onChange={(e) => { setFStatus(e.target.value); setPage(1); }}>
              <option value="active">启用</option>
              <option value="archived">已停用</option>
              <option value="all">全部</option>
            </select>
            <select className="select" style={{ width: 130 }} value={fDim} onChange={(e) => { setFDim(e.target.value); setPage(1); }}>
              <option value="">全部维度</option>
              {DIMENSIONS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select className="select" style={{ width: 150 }} value={fType} onChange={(e) => { setFType(e.target.value); setPage(1); }}>
              <option value="">全部类型</option>
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.value}</option>)}
            </select>
          </div>
        </div>

        {!rows ? (
          <div style={{ padding: 16 }}><Skeleton height={44} /><div style={{ height: 8 }} /><Skeleton height={44} /><div style={{ height: 8 }} /><Skeleton height={44} /></div>
        ) : filtered.length === 0 ? (
          <Empty icon="🗂️" title="没有匹配的用例" sub={rows.length === 0 ? '点右上角「新建用例」开始' : '调整搜索或筛选条件'} />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead><tr>
                  {th('id', 'ID')}{th('title', '标题')}{th('dimension', '维度')}{th('type', '类型')}{th('version', '版本')}<th>状态</th><th>操作</th>
                </tr></thead>
                <tbody>
                  {paged.map((c) => (
                    <tr key={c.id}>
                      <td className="mono">{c.id}</td>
                      <td><a href="#" onClick={(e) => { e.preventDefault(); setDetail(c); }} style={{ color: 'var(--text)', fontWeight: 500, textDecoration: 'none' }}>{c.title}</a></td>
                      <td>{c.dimension ? <Badge>{c.dimension}</Badge> : <span className="text-muted">—</span>}</td>
                      <td><Badge variant={c.type === 'objective' ? 'success' : c.type === 'code' ? 'primary' : undefined}>{c.type}</Badge></td>
                      <td className="text-muted">v{c.version}</td>
                      <td>{c.status === 'archived' ? <Badge>已停用</Badge> : <Badge variant="success">活跃</Badge>}</td>
                      <td>
                        <div className="cell-actions">
                          <button className="btn sm ghost" onClick={() => setDetail(c)}>详情</button>
                          <button className="btn sm ghost" onClick={() => openEdit(c)}>编辑</button>
                          {c.status === 'active' && <button className="btn sm danger" onClick={() => setToArchive(c)}>停用</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <span>共 {filtered.length} 条</span>
              <Pager page={page} pages={pages} onPage={setPage} />
            </div>
          </>
        )}
      </div>

      {(creating || editing) && (
        <Drawer
          title={editing ? `编辑用例 #${editing.id}` : '新建用例'}
          onClose={closeDrawer}
          footer={<>
            <button className="btn ghost" onClick={closeDrawer}>取消</button>
            <button className="btn primary" disabled={saving} onClick={save}>{saving ? '保存中…' : '保存'}</button>
          </>}
        >
          <div className="field">
            <label className="field-label">标题 *</label>
            <input className={`input ${errors.title ? 'invalid' : ''}`} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            {errors.title && <div className="field-error">{errors.title}</div>}
          </div>
          <div className="form-grid">
            <div className="field">
              <label className="field-label">维度</label>
              <select className="select" value={form.dimension} onChange={(e) => setForm({ ...form, dimension: e.target.value })}>
                <option value="">（未分类）</option>
                {DIMENSIONS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-label">类型</label>
              <select className="select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label className="field-label">Prompt *</label>
            <textarea className={`textarea ${errors.prompt ? 'invalid' : ''}`} rows={6} value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} />
            {errors.prompt && <div className="field-error">{errors.prompt}</div>}
          </div>
          <div className="field">
            <label className="field-label">期望答案（客观题）</label>
            <input className="input" value={form.expected_answer} onChange={(e) => setForm({ ...form, expected_answer: e.target.value })} />
          </div>
          <div className="field">
            <label className="field-label">评分细则（主观/代码题）</label>
            <textarea className="textarea" rows={3} value={form.rubric} onChange={(e) => setForm({ ...form, rubric: e.target.value })} />
            <div className="field-hint">将作为 L2 AI 裁判的 llm-rubric 评分标准</div>
          </div>
        </Drawer>
      )}

      {detail && (
        <Drawer title={`用例 #${detail.id} · ${detail.title}`} onClose={() => setDetail(null)}>
          <dl className="kv">
            <dt>维度</dt><dd>{detail.dimension ?? '—'}</dd>
            <dt>类型</dt><dd>{detail.type}</dd>
            <dt>版本</dt><dd>v{detail.version}</dd>
            <dt>来源</dt><dd>{detail.source}</dd>
            <dt>状态</dt><dd>{detail.status}</dd>
          </dl>
          <div className="field" style={{ marginTop: 16 }}>
            <label className="field-label">Prompt</label>
            <div className="pre-block">{detail.prompt}</div>
          </div>
          {detail.expected_answer && (
            <div className="field">
              <label className="field-label">期望答案</label>
              <div className="pre-block">{detail.expected_answer}</div>
            </div>
          )}
          {detail.rubric && (
            <div className="field">
              <label className="field-label">评分细则</label>
              <div className="pre-block">{detail.rubric}</div>
            </div>
          )}
          {detail.assertion_script && (
            <div className="field">
              <label className="field-label">判分脚本</label>
              <div><Badge variant="primary">{detail.assertion_script}</Badge></div>
            </div>
          )}
        </Drawer>
      )}

      {importing && (
        <Drawer
          title="批量导入用例"
          onClose={() => setImporting(false)}
          footer={<>
            <button className="btn ghost" onClick={() => setImporting(false)}>取消</button>
            <button className="btn primary" disabled={importingBusy} onClick={doImport}>{importingBusy ? '导入中…' : '导入'}</button>
          </>}
        >
          <div className="field">
            <label className="field-label">JSON 数组（每项含 title、prompt 必填）</label>
            <textarea
              className="textarea"
              rows={12}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={'[\n  {\n    "title": "用例标题",\n    "prompt": "完整提示词",\n    "dimension": "推理",\n    "type": "objective",\n    "expected_answer": "可选",\n    "rubric": "可选"\n  }\n]'}
              style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }}
            />
            {importErr && <div className="field-error">{importErr}</div>}
            <div className="field-hint">type 可选 objective / subjective / code；dimension 可选 代码/写作/推理/长文本/工具调用/多模态/其他</div>
          </div>
        </Drawer>
      )}

      {toArchive && (
        <ConfirmDialog
          title="停用用例"
          message={`确定停用「${toArchive.title}」吗？停用为软删除，历史评测记录不受影响。`}
          confirmText="停用"
          danger
          onConfirm={() => archive(toArchive)}
          onCancel={() => setToArchive(null)}
        />
      )}
    </div>
  );
}
