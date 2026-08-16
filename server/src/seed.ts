import { query, migrate } from './db.js';
import { assertConfig } from './config.js';

// 6 个存量用例（来自 evaluate_case.md）
const CASES = [
  {
    title: '汉字数字造句',
    prompt:
      '输出10个以汉字数字结尾的句子，且按照顺序一到十。语句要通顺有意义，且倒数第二个字不能重复且不能是“第”，“是”，“为”。',
    dimension: '写作',
    type: 'objective',
    assertion_script: 'judgeSentence',
  },
  {
    title: '24点',
    prompt:
      '请用3、4、9、10这四个数字，每个数字只能且必须使用一次。你可以使用任何初等数学运算符（包括乘方/根号），请拼出24点。',
    dimension: '推理',
    type: 'objective',
    assertion_script: 'judge24Point',
  },
  {
    title: '密码锁',
    prompt:
      '有把五位数密码锁，数字顺序与位置均需匹配才能开锁。78635含3个正确数字且位置全错；16384、56483各1个数字位置正确、1个数字位置错误；92741有2个数字位置正确、1个数字位置错误；67153有2个数字位置正确、2个数字位置错误。据此推理密码。',
    dimension: '推理',
    type: 'objective',
    expected_answer: '12753',
    assertion_script: 'judgePasswordLock',
  },
  {
    title: 'AISniper OS',
    prompt:
      '参考macOS新操作系统，创建一个现代、有精简美观界面和UI的浏览器内操作系统（命名为“AISniper OS”）。要求包含系统状态浮窗（如Wi-Fi、系统健康度）、时钟、底部快速启动栏、主题切换功能，并内置可交互的3D太空射击游戏。底部快捷栏应该有Finder、计算器、设置、命令行终端和太空射击游戏。',
    dimension: '代码',
    type: 'code',
    rubric:
      '完整性(40)：状态浮窗/时钟/启动栏/主题切换/3D太空射击游戏是否齐全；美观度(30)：界面是否现代精简；可交互性(30)：组件与游戏是否可交互。',
  },
  {
    title: '3D赛车跑酷游戏',
    prompt:
      '使用HTML、CSS和JavaScript，创建一个以汽车为主角的3D赛道竞速风格无限跑酷游戏。网页必须通过Canvas或Three.js渲染出一条沿纵深无限延伸的赛道，核心交互要求实现摄像机视角随着弯曲赛道实时左右平滑滑动的追踪动效，以及汽车切换赛道时的高灵敏物理逻辑反馈。赛道上必须动态刷新各种障碍物，且页面顶部需内置一个能随着行驶距离和避障表现实时渲染、不被遮挡的高清动态计分板。',
    dimension: '代码',
    type: 'code',
    rubric:
      '完整性(40)：无限纵深赛道/摄像机追踪/切换赛道物理/障碍物/计分板；视觉效果(30)：3D渲染与动效；交互体验(30)：操控灵敏度与流畅度。',
  },
  {
    title: 'Trello看板',
    prompt:
      '请用单文件原生HTML/CSS/JS实现一个高颜值Trello看板（严禁任何第三方库），完美支持卡片跨列表拖动到其他列表，支持列表横向拖拽切换列表位置，列表和卡片的增删改，且必须硬性实现：拖拽时周围卡片平滑滑开让位的顺畅动画（绝不能生硬闪现）、拖拽到边缘时看板自适应自动滚动、点击卡片时从原位置原位放大展开的无缝弹窗，以及弹窗内完整的子任务清单与多颜色标签编辑功能。',
    dimension: '代码',
    type: 'code',
    rubric:
      '完整性(40)：卡片/列表拖拽与增删改、边缘自动滚动、无缝弹窗、子任务与标签；流畅度(30)：平滑让位动画；观感(30)：高颜值 UI。',
  },
];

async function main() {
  assertConfig();
  await migrate();
  const existing = (await query('SELECT title FROM cases')).rows.map((r) => r.title);
  let inserted = 0;
  for (const c of CASES) {
    if (existing.includes(c.title)) continue;
    await query(
      `INSERT INTO cases (title, prompt, dimension, type, expected_answer, rubric, assertion_script, source, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'self',$8)`,
      [c.title, c.prompt, c.dimension, c.type, c.expected_answer ?? null, c.rubric ?? null, c.assertion_script ?? null, [c.dimension]],
    );
    inserted++;
  }
  console.log(`[seed] 新增 ${inserted} 个用例（共 ${CASES.length} 个存量用例）`);
  process.exit(0);
}

main().catch((e) => {
  console.error('seed 失败:', e);
  process.exit(1);
});
