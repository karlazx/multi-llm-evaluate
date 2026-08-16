import { useEffect, useState } from 'react';
import { api, type CaseRow } from '../api';

const DIMENSIONS = ['代码', '写作', '推理', '长文本', '工具调用', '多模态', '其他'];
const TYPES = ['objective', 'subjective', 'code'];

const empty = { title: '', prompt: '', dimension: '', type: 'subjective', expected_answer: '', rubric: '' };

export default function CasesPage() {
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<CaseRow | null>(null);
  const [form, setForm] = useState<typeof empty>(empty);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    try {
      setRows(await api.cases.list());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  function openCreate() {
    setEditing(null);
    setForm(empty);
    setShowForm(true);
  }
  function openEdit(c: CaseRow) {
    setEditing(c);
    setForm({
      title: c.title, prompt: c.prompt, dimension: c.dimension ?? '', type: c.type,
      expected_answer: c.expected_answer ?? '', rubric: c.rubric ?? '',
    });
    setShowForm(true);
  }
  function closeForm() {
    setEditing(null);
    setForm(empty);
    setShowForm(false);
  }
  async function save() {
    if (!form.title || !form.prompt) { setError('标题和 prompt 必填'); return; }
    try {
      if (editing) await api.cases.update(editing.id, form);
      else await api.cases.create(form);
      closeForm();
      await load();
    } catch (e) { setError((e as Error).message); }
  }
  async function archive(id: number) {
    if (!confirm('确定停用该用例？（不删除）')) return;
    try { await api.cases.archive(id); await load(); } catch (e) { setError((e as Error).message); }
  }

  if (loading) return <div className="muted">加载中…</div>;

  return (
    <div>
      <div className="page-head">
        <h2>用例库</h2>
        <button className="btn primary" onClick={openCreate}>+ 新建用例</button>
      </div>
      {error && <div className="alert">{error}</div>}

      {showForm && (
        <div className="panel">
          <h3>{editing ? `编辑 #${editing.id}` : '新建用例'}</h3>
          <div className="form-grid">
            <label>标题 <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
            <label>维度
              <select value={form.dimension} onChange={(e) => setForm({ ...form, dimension: e.target.value })}>
                <option value="">（未分类）</option>
                {DIMENSIONS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label>类型
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="span">Prompt <textarea rows={4} value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} /></label>
            <label className="span">期望答案（客观题）<input value={form.expected_answer} onChange={(e) => setForm({ ...form, expected_answer: e.target.value })} /></label>
            <label className="span">评分细则（主观/代码题）<textarea rows={2} value={form.rubric} onChange={(e) => setForm({ ...form, rubric: e.target.value })} /></label>
          </div>
          <div className="row">
            <button className="btn primary" onClick={save}>保存</button>
            <button className="btn" onClick={closeForm}>取消</button>
          </div>
        </div>
      )}

      <table className="table">
        <thead><tr><th>ID</th><th>标题</th><th>维度</th><th>类型</th><th>版本</th><th>操作</th></tr></thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td>{c.id}</td>
              <td>{c.title}</td>
              <td>{c.dimension ?? '-'}</td>
              <td><span className="badge">{c.type}</span></td>
              <td>v{c.version}</td>
              <td>
                <button className="btn sm" onClick={() => openEdit(c)}>编辑</button>{' '}
                <button className="btn sm danger" onClick={() => archive(c.id)}>停用</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
