import { useEffect, useState } from 'react';
import { api, type ModelRow } from '../api';

const PROTOCOLS = [
  { value: 'openai-v1', label: 'OpenAI v1 (chat)' },
  { value: 'openai-v2', label: 'OpenAI v2 (responses)' },
  { value: 'anthropic', label: 'Anthropic (messages)' },
];
const THINKING = ['disabled', 'enabled', 'adaptive'];

const empty = {
  name: '', display_name: '', provider: '', protocol: 'openai-v1', endpoint: '',
  api_key: '', cost_input: '', cost_output: '', thinking: 'disabled',
};

export default function ModelsPage() {
  const [rows, setRows] = useState<ModelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<ModelRow | null>(null);
  const [form, setForm] = useState(empty);
  const [testing, setTesting] = useState<number | null>(null);

  async function load() {
    try { setRows(await api.models.list()); } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  function openCreate() { setEditing(null); setForm(empty); }
  function openEdit(m: ModelRow) {
    setEditing(m);
    setForm({
      name: m.name, display_name: m.display_name ?? '', provider: m.provider ?? '', protocol: m.protocol,
      endpoint: m.endpoint ?? '', api_key: '', cost_input: m.cost_input?.toString() ?? '',
      cost_output: m.cost_output?.toString() ?? '', thinking: m.thinking,
    });
  }
  async function save() {
    if (!form.name || !form.endpoint) { setError('模型名和 endpoint 必填'); return; }
    try {
      const body: Record<string, unknown> = {
        name: form.name, display_name: form.display_name, provider: form.provider,
        protocol: form.protocol, endpoint: form.endpoint, thinking: form.thinking,
        cost_input: form.cost_input === '' ? null : Number(form.cost_input),
        cost_output: form.cost_output === '' ? null : Number(form.cost_output),
      };
      if (form.api_key) body.api_key = form.api_key; // 为空则不更新 key
      if (editing) await api.models.update(editing.id, body);
      else await api.models.create(body);
      setEditing(null); setForm(empty); await load();
    } catch (e) { setError((e as Error).message); }
  }
  async function test(id: number) {
    setTesting(id);
    try {
      const r = await api.models.test(id);
      alert(`${r.ok ? '✅ 连接成功' : '❌ 连接失败'}\n${r.message}${r.sample ? '\nsample: ' + r.sample : ''}\nlatency: ${r.latencyMs ?? '?'}ms`);
    } catch (e) { alert('测试失败: ' + (e as Error).message); } finally { setTesting(null); }
  }
  async function archive(id: number) {
    if (!confirm('确定停用该模型？')) return;
    try { await api.models.archive(id); await load(); } catch (e) { setError((e as Error).message); }
  }

  if (loading) return <div className="muted">加载中…</div>;

  return (
    <div>
      <div className="page-head">
        <h2>模型接入</h2>
        <button className="btn primary" onClick={openCreate}>+ 接入模型</button>
      </div>
      {error && <div className="alert">{error}</div>}

      {(editing || form.name === '') && (
        <div className="panel">
          <h3>{editing ? `编辑 #${editing.id}（key 留空则不更新）` : '接入模型'}</h3>
          <div className="form-grid">
            <label>模型名（API 名）<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如 openai/gpt-4o-mini" /></label>
            <label>显示名 <input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></label>
            <label>协议
              <select value={form.protocol} onChange={(e) => setForm({ ...form, protocol: e.target.value })}>
                {PROTOCOLS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </label>
            <label>Endpoint <input value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })} placeholder="https://…" /></label>
            <label>API Key <input type="password" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} placeholder={editing ? '（留空不更新）' : 'sk-…'} /></label>
            <label>厂商/中转 <input value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} placeholder="deepseek / openai / relay" /></label>
            <label>单价 $/1M input <input value={form.cost_input} onChange={(e) => setForm({ ...form, cost_input: e.target.value })} /></label>
            <label>单价 $/1M output <input value={form.cost_output} onChange={(e) => setForm({ ...form, cost_output: e.target.value })} /></label>
            <label>思考模式
              <select value={form.thinking} onChange={(e) => setForm({ ...form, thinking: e.target.value })}>
                {THINKING.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          </div>
          <div className="row">
            <button className="btn primary" onClick={save}>保存</button>
            <button className="btn" onClick={() => { setEditing(null); setForm(empty); }}>取消</button>
          </div>
        </div>
      )}

      <table className="table">
        <thead><tr><th>ID</th><th>显示名</th><th>API 模型名</th><th>协议</th><th>Key</th><th>思考</th><th>操作</th></tr></thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id}>
              <td>{m.id}</td>
              <td>{m.display_name ?? m.name}</td>
              <td className="mono">{m.name}</td>
              <td><span className="badge">{m.protocol}</span></td>
              <td className="mono">{m.api_key_masked || '—'}</td>
              <td>{m.thinking}</td>
              <td>
                <button className="btn sm" onClick={() => test(m.id)} disabled={testing === m.id}>{testing === m.id ? '测试中…' : '测试连接'}</button>{' '}
                <button className="btn sm" onClick={() => openEdit(m)}>编辑</button>{' '}
                <button className="btn sm danger" onClick={() => archive(m.id)}>停用</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
