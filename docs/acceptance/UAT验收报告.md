# UAT 验收报告

- **验收人**：小筑（主 Agent）
- **验收时间**：2026-08-16 19:30
- **目标环境**：http://<云服务器IP>:8787（线上部署）
- **验收方式**：浏览器自动化 UAT + 前端代码审查

## 一、验收结论

**UAT 未通过 ❌，发现 2 个 P0 级 bug 需修复后重新验收。**

## 二、通过项

| 验收点 | 结果 |
|---|---|
| 页面导航（5 个页面切换） | ✅ 正常 |
| 用例库列表加载（6 个预置用例） | ✅ 正常 |
| 模型接入页渲染 | ✅ 正常 |
| 发起评测页渲染 | ✅ 正常 |
| 报告页渲染 | ✅ 正常 |
| 人工盲评页渲染 | ✅ 正常 |
| 页面间快速切换 | ✅ 未复现白屏 |

## 三、问题项

### 🔴 P0-1：新建用例输入框无法输入（CasesPage.tsx 第 55 行）

**现象**：点击「新建用例」后，标题输入框无法输入，一输入表单就消失。

**根因**：表单显示条件写错
```tsx
{(editing || (!editing && form.title === '')) && (
```
当用户输入标题后，`form.title` 变成非空，条件变成 `false`，表单直接消失。

**影响**：核心功能——创建用例完全不可用。

**修复方案**：加一个 `showCreate` state 控制新建表单显示
```tsx
const [showCreate, setShowCreate] = useState(false);

function openCreate() {
  setEditing(null);
  setForm(empty);
  setShowCreate(true);
}

async function save() {
  // ...
  setShowCreate(false);
}

// 取消按钮
onClick={() => { setEditing(null); setForm(empty); setShowCreate(false); }}

// 显示条件
{(editing || showCreate) && (
```

### 🔴 P0-2：新建模型输入框无法输入（ModelsPage.tsx 第 75 行）

**现象**：点击「接入模型」后，模型名输入框无法输入，一输入表单就消失。

**根因**：同样的表单显示条件错误
```tsx
{(editing || form.name === '') && (
```

**影响**：核心功能——接入模型完全不可用。

**修复方案**：同 P0-1，加 `showCreate` state。

### 🟢 P2-1：favicon.ico 404

**现象**：所有页面加载时请求 `/8787/favicon.ico` 返回 404。

**影响**：低，仅影响浏览器标签页图标显示。

**修复方案**：在 `web/public/` 下放一个 `favicon.ico`，或在前端 `index.html` 里去掉 favicon 引用。

## 四、关于"白屏"问题

老板反馈的"有时白屏"，本次 UAT 未复现。但 P0-1/P0-2 的 bug 会导致**表单突然消失**，视觉上可能被误认为"白屏"。修复后需重新验收确认。

## 五、下一步

1. Claude 修复 P0-1/P0-2 两个 bug
2. 推送后我重新 UAT 验收
3. 通过后正式交付
