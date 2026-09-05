import { useEffect, useMemo, useState } from 'react';
import { api, type ModelRow } from '../api';
import { Drawer } from '../ui/Drawer';
import { ConfirmDialog } from '../ui/Modal';
import { useToast } from '../ui/toast';
import { Badge, Empty, Pager, Skeleton } from '../ui/bits';

const PROTOCOLS = [
  { value: 'openai-v1', label: 'OpenAI v1（chat completions）' },
  { value: 'openai-v2', label: 'OpenAI v2（responses）' },
  { value: 'anthropic', label: 'Anthropic（messages）' },
];
const THINKING = ['disabled', 'enabled', 'adaptive'];
const PAGE_SIZE = 10;

type FormState = {
  name: string; display_name: string; provider: string; protocol: string; endpoint: string;
  api_key: string; cost_input: string; cost_output: string; thinking: string;
};
const empty: FormState = {
  name: '', display_name: '', provider: '', protocol: 'openai-v1', endpoint: '',
  api_key: '', cost_input: '', cost_output: '', thinking: 'disabled',
};

export default function ModelsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<ModelRow[] | null>(null);
  const [q, setQ] = useState('');
  const [fProto, setFProto] = useState('');
  const [fStatus, setFStatus] = useState('active');
  const [page, setPage] = useState(1);

  const [editing, setEditing] = useState<ModelRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<ModelRow | null>(null);
  const [toArchive, setToArchive] = useState<ModelRow | null>(null);
  const [testing, setTesting] = useState<number | null>(null);

  async function load() {
    try { setRows(await api.models.list(fStatus === 'all' ? undefined : fStatus)); }
    catch (e) { toast('error', '加载失败：' + (e as Error).message); setRows([]); }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [fStatus]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const kw = q.trim().toLowerCase();
    return rows.filter((m) =>
      (!kw || m.name.toLowerCase().includes(kw) || (m.display_name ?? '').toLowerCase().includes(kw)) &&
      (!fProto || m.protocol === fProto),
    );
  }, [rows, q, fProto]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function openCreate() { setEditing(null); setCreating(true); setForm(empty); setErrors({}); }
  function openEdit(m: ModelRow) {
    setCreating(false); setEditing(m); setErrors({});
    setForm({
      name: m.name, display_name: m.display_name ?? '', provider: m.provider ?? '', protocol: m.protocol,
      endpoint: m.endpoint ?? '', api_key: '', cost_input: m.cost_input?.toString() ?? '',
      cost_output: m.cost_output?.toString() ?? '', thinking: m.thinking,
    });
  }
  function closeDrawer() { setCreating(false); setEditing(null); setDetail(null); }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'API 模型名必填';
    if (!form.endpoint.trim()) errs.endpoint = 'Endpoint 必填';
    if (!editing && !form.api_key.trim()) errs.api_key = '首次接入必须填 API Key';
    if (form.cost_input && isNaN(Number(form.cost_input))) errs.cost_input = '必须是数字';
    if (form.cost_output && isNaN(Number(form.cost_output))) errs.cost_output = '必须是数字';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function save() {
    if (!validate()) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: form.name, display_name: form.display_name, provider: form.provider,
        protocol: form.protocol, endpoint: form.endpoint, thinking: form.thinking,
        cost_input: form.cost_input === '' ? null : Number(form.cost_input),
        cost_output: form.cost_output === '' ? null : Number(form.cost_output),
      };
      if (form.api_key) body.api_key = form.api_key;
      if (editing) await api.models.update(editing.id, body);
      else await api.models.create(body);
      toast('success', editing ? `模型 #${editing.id} 已更新` : '模型已接入');
      closeDrawer();
      await load();
    } catch (e) { toast('error', '保存失败：' + (e as Error).message); }
    finally { setSaving(false); }
  }

  async function test(m: ModelRow) {
    setTesting(m.id);
    try {
      const r = await api.models.test(m.id);
      if (r.ok) toast('success', `连接成功 · ${r.latencyMs}ms · ${r.sample ?? ''}`);
      else toast('error', `连接失败：${r.message}`);
    } catch (e) { toast('error', '测试失败：' + (e as Error).message); }
    finally { setTesting(null); }
  }

  async function archive(m: ModelRow) {
    try {
      await api.models.archive(m.id);
      toast('success', `模型「${m.display_name ?? m.name}」已停用`);
      setToArchive(null);
      await load();
    } catch (e) { toast('error', '停用失败：' + (e as Error).message); }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>模型接入</h2>
          <div className="page-sub">{rows ? `${rows.filter((m) => m.status === 'active').length} 个活跃模型 · Key 加密存储、界面脱敏` : '加载中…'}</div>
        </div>
        <button className="btn primary" onClick={openCreate}>+ 接入模型</button>
      </div>

      <div className="card">
        <div className="row-split" style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <input className="input" style={{ maxWidth: 300 }} placeholder="搜索模型名 / 显示名…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <select className="select" style={{ width: 110 }} value={fStatus} onChange={(e) => { setFStatus(e.target.value); setPage(1); }}>
              <option value="active">启用</option>
              <option value="archived">已停用</option>
              <option value="all">全部</option>
            </select>
            <select className="select" style={{ width: 220 }} value={fProto} onChange={(e) => { setFProto(e.target.value); setPage(1); }}>
              <option value="">全部协议</option>
              {PROTOCOLS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
        </div>

        {!rows ? (
          <div style={{ padding: 16 }}><Skeleton height={44} /><div style={{ height: 8 }} /><Skeleton height={44} /></div>
        ) : filtered.length === 0 ? (
          <Empty icon="🤖" title="没有匹配的模型" sub={rows.length === 0 ? '点右上角「接入模型」开始' : '调整搜索或筛选条件'} />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>ID</th><th>模型</th><th>协议</th><th>Key</th><th>单价 $/1M</th><th>思考</th><th>状态</th><th>操作</th></tr></thead>
                <tbody>
                  {paged.map((m) => (
                    <tr key={m.id}>
                      <td className="mono">{m.id}</td>
                      <td>
                        <a href="#" onClick={(e) => { e.preventDefault(); setDetail(m); }} style={{ color: 'var(--text)', fontWeight: 500, textDecoration: 'none' }}>
                          {m.display_name ?? m.name}
                        </a>
                        <div className="mono text-muted">{m.name}</div>
                      </td>
                      <td><Badge variant={m.protocol === 'openai-v2' ? 'primary' : m.protocol === 'anthropic' ? 'warning' : undefined}>{m.protocol}</Badge></td>
                      <td className="mono text-muted">{m.api_key_masked || '—'}</td>
                      <td className="mono">{m.cost_input ?? '—'} / {m.cost_output ?? '—'}</td>
                      <td><Badge>{m.thinking}</Badge></td>
                      <td>{m.status === 'archived' ? <Badge>已停用</Badge> : <Badge variant="success">活跃</Badge>}</td>
                      <td>
                        <div className="cell-actions">
                          <button className="btn sm ghost" disabled={testing === m.id} onClick={() => test(m)}>{testing === m.id ? '测试中…' : '测试连接'}</button>
                          <button className="btn sm ghost" onClick={() => openEdit(m)}>编辑</button>
                          {m.status === 'active' && <button className="btn sm danger" onClick={() => setToArchive(m)}>停用</button>}
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
          title={editing ? `编辑模型 #${editing.id}` : '接入模型'}
          onClose={closeDrawer}
          footer={<>
            <button className="btn ghost" onClick={closeDrawer}>取消</button>
            <button className="btn primary" disabled={saving} onClick={save}>{saving ? '保存中…' : '保存'}</button>
          </>}
        >
          <div className="form-grid">
            <div className="field">
              <label className="field-label">API 模型名 *</label>
              <input className={`input ${errors.name ? 'invalid' : ''}`} placeholder="如 openai/gpt-4o-mini" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              {errors.name && <div className="field-error">{errors.name}</div>}
            </div>
            <div className="field">
              <label className="field-label">显示名</label>
              <input className="input" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label className="field-label">协议</label>
            <select className="select" value={form.protocol} onChange={(e) => setForm({ ...form, protocol: e.target.value })}>
              {PROTOCOLS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="field-label">Endpoint *</label>
            <input className={`input ${errors.endpoint ? 'invalid' : ''}`} placeholder="https://…" value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })} />
            {errors.endpoint && <div className="field-error">{errors.endpoint}</div>}
          </div>
          <div className="field">
            <label className="field-label">API Key {editing && '（留空则不更新）'}</label>
            <input className={`input ${errors.api_key ? 'invalid' : ''}`} type="password" placeholder="sk-…" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} />
            {errors.api_key && <div className="field-error">{errors.api_key}</div>}
            <div className="field-hint">AES-256-GCM 加密存储，界面只显示脱敏值</div>
          </div>
          <div className="form-grid">
            <div className="field">
              <label className="field-label">厂商/中转</label>
              <input className="input" placeholder="deepseek / openai / relay" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} />
            </div>
            <div className="field">
              <label className="field-label">思考模式</label>
              <select className="select" value={form.thinking} onChange={(e) => setForm({ ...form, thinking: e.target.value })}>
                {THINKING.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-label">单价 $/1M input</label>
              <input className={`input ${errors.cost_input ? 'invalid' : ''}`} value={form.cost_input} onChange={(e) => setForm({ ...form, cost_input: e.target.value })} />
              {errors.cost_input && <div className="field-error">{errors.cost_input}</div>}
            </div>
            <div className="field">
              <label className="field-label">单价 $/1M output</label>
              <input className={`input ${errors.cost_output ? 'invalid' : ''}`} value={form.cost_output} onChange={(e) => setForm({ ...form, cost_output: e.target.value })} />
              {errors.cost_output && <div className="field-error">{errors.cost_output}</div>}
            </div>
          </div>
        </Drawer>
      )}

      {detail && (
        <Drawer title={`模型 #${detail.id} · ${detail.display_name ?? detail.name}`} onClose={() => setDetail(null)}>
          <dl className="kv">
            <dt>API 模型名</dt><dd className="mono">{detail.name}</dd>
            <dt>协议</dt><dd>{detail.protocol}</dd>
            <dt>Endpoint</dt><dd className="mono">{detail.endpoint ?? '—'}</dd>
            <dt>厂商/中转</dt><dd>{detail.provider ?? '—'}</dd>
            <dt>Key</dt><dd className="mono">{detail.api_key_masked || '—'}</dd>
            <dt>单价</dt><dd>input {detail.cost_input ?? '—'} · output {detail.cost_output ?? '—'}（$/1M）</dd>
            <dt>思考模式</dt><dd>{detail.thinking}</dd>
            <dt>状态</dt><dd>{detail.status}</dd>
          </dl>
        </Drawer>
      )}

      {toArchive && (
        <ConfirmDialog
          title="停用模型"
          message={`确定停用「${toArchive.display_name ?? toArchive.name}」吗？停用为软删除，历史评测记录不受影响。`}
          confirmText="停用"
          danger
          onConfirm={() => archive(toArchive)}
          onCancel={() => setToArchive(null)}
        />
      )}
    </div>
  );
}
