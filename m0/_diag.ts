import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { evaluate } from 'promptfoo';
const txt = readFileSync(path.resolve(process.cwd(), '.env'), 'utf8');
for (const line of txt.split('\n')) { const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g,'').trim(); }
const r = await evaluate({
  providers: [{ id: 'openai:chat:deepseek-v4-flash', config: { max_tokens: 8192 } }],
  prompts: [{ label: 'case2', raw: '请用 3、4、9、10 这四个数字，每个数字只能且必须使用一次。你可以使用任何初等数学运算符（包括乘方/根号），请拼出 24 点。直接给出表达式和结果。' }],
});
const out = String(r.results[0].response?.output ?? '');
writeFileSync('m0/_diag_case2.txt', out, 'utf8');
console.log('output length:', out.length, 'chars');
console.log('=== LAST 600 chars ===');
console.log(out.slice(-600));
console.log('=== tokenUsage ===');
console.log(JSON.stringify(r.results[0].response?.tokenUsage));
console.log('=== finishReason ===', r.results[0].response?.finishReason);
