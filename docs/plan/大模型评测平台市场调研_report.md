# 大模型评测平台市场调研：同类产品盘点与「直接用 / 二开 / 自研」决策建议

**完成日期：2026-08-16**
**调研核心问题**：市面上是否存在与"大模型评测平台"同类的产品（重点开源/可自部署/可二次开发），个人开发者应直接使用现成产品、基于开源项目二次开发，还是从 0 到 1 自研。
**需求基准（六项）**：① 用户自建评估用例（开放式业务题目，可管理、可版本化）；② 接入多家云端模型 API（OpenAI v1/v2、Anthropic 协议）按用例批量跑测；③ 可配置强模型当裁判（LLM-as-a-Judge），并支持人工评估/盲评；④ 评测报告（总分排行、分维度得分、单用例穿透、token 用量/费用/耗时）；⑤ 私人模型选型用途 + 未来加工为小红书内容；⑥ 个人开发者单用户私有部署，可自托管、开源可二开。

---

## 摘要

**市面上同类开源产品充分存在，但没有一款现成产品 100% 覆盖上述六项需求的完整链路**。市场已经清晰地分化为三种形态：评测框架（promptfoo、DeepEval、OpenCompass、EvalScope、Inspect AI）、可观测+评测平台（Langfuse、Comet Opik、Arize Phoenix、LangSmith、Braintrust）、人工对战竞技场（Chatbot Arena、Compass Arena、SuperCLUE），Gartner 已于 2026 年 2 月发布《AI Evaluation and Observability Platforms 市场指南》，标志着该细分市场正式成型 [(W&B · Gartner Market Guide)](https://wandb.ai/site/resources/whitepapers/gartner-ai-evaluation-observability-platforms/)。

对六项需求逐一比对后，**promptfoo（MIT，24,258 stars，2026-08-16 GitHub API 实时查询）在"多协议批量跑测、可配置 AI 裁判、token/费用/耗时指标"上覆盖最全**，原生支持 OpenAI chat/responses 协议与 Anthropic messages 协议对比跑测 [(promptfoo 官方文档)](https://www.promptfoo.dev/docs/guides/claude-vs-gpt/)，结果表逐格展示 token、延迟、美元成本 [(promptfoo issue #8974)](https://github.com/promptfoo/promptfoo/issues/8974)，但它缺用例管理 UI（用例靠 YAML/CSV 文件 + git）[(promptfoo intro)](https://www.promptfoo.dev/docs/intro/)、人工评估只有逐格点赞而无盲评对战流程 [(promptfoo PR #6260)](https://github.com/promptfoo/promptfoo/pull/6260)。

**最反直觉的发现是：2026 年 3 月 9 日 OpenAI 宣布收购 promptfoo**，但官方承诺开源 CLI/库继续维护、保持现有许可并继续支持多模型 [(OpenAI 官方公告)](https://openai.com/index/openai-to-acquire-promptfoo/)；同期 Chatbot Arena 运营方 LMArena 已公司化并于 2026 年 1 月以 17 亿美元估值完成 A 轮 [(aiwiki)](https://www.aiwiki.ai/wiki/lmsys_chatbot_arena)。评测工具的中立性正在成为稀缺属性，这也是选型时必须对冲的风险。

**最终判断：不从 0 到 1 自研**。推荐 **基于 promptfoo 引擎做轻量二次开发**——自建一个"用例库 + 人工盲评页 + 报告导出"的薄壳（单人数周可达 MVP），引擎层协议适配、并发调度、裁判模板、成本统计全部复用；人工盲评交互可参考 Open WebUI 的 Arena Model 与 EvalArena 类自托管竞技场的设计 [(Open WebUI 评估文档)](https://docs.openwebui.com/features/administration/evaluation/) [(EvalArena README)](https://github.com/Jane-o-O-o-O/evalarena)。Python 技术栈偏好者的备选引擎是阿里魔搭的 EvalScope（Apache-2.0，竞技场模式 + WebUI 报告 + 压测指标齐备，但社区体量小一个数量级）[(EvalScope 文档)](https://evalscope.readthedocs.io/en/v1.0.2/user_guides/arena.html)。

---

## 一、市场全景：三种产品形态与 2025–2026 关键变局

大模型评测工具市场在 2025–2026 年间完成了从"脚本集合"到"产品品类"的跃迁：Gartner 于 2026 年 2 月 2 日发布《Market Guide for AI Evaluation and Observability Platforms》，将 AI 评测与可观测列为独立市场类别 [(W&B · Gartner Market Guide)](https://wandb.ai/site/resources/whitepapers/gartner-ai-evaluation-observability-platforms/)。从供给端看，当前产品可划分为三种形态，而本次调研的六项需求恰好横跨三种形态的交集——这正是"没有单一现成产品全覆盖"的结构性原因。

**第一类是评测框架（eval harness）**：以代码/配置为事实源，强项是批量跑测与自动评分，弱项是 Web 化管理与人工流程。代表项目为 promptfoo（MIT，24,258 stars）、DeepEval（Apache-2.0，17,607 stars）、OpenCompass（Apache-2.0，7,307 stars）、EvalScope（Apache-2.0，3,240 stars）、Inspect AI（MIT，2,556 stars），stars 数据均为 2026-08-16 通过 GitHub API 实时查询所得 [(GitHub · promptfoo)](https://github.com/promptfoo/promptfoo) [(GitHub · deepeval)](https://github.com/confident-ai/deepeval)。这类产品与需求②③④⑥匹配度最高。

**第二类是可观测 + 评测平台（LLMOps platform）**：以 Web UI 为核心，强项是数据集管理、人工标注、实验对比，弱项是批量跑测需要用户自带运行器（bring-your-own-runner）。代表为 Langfuse（MIT 核心，33,155 stars）、Comet Opik（Apache-2.0，21,406 stars）、Arize Phoenix（ELv2，11,065 stars）以及闭源的 LangSmith、Braintrust [(GitHub · langfuse)](https://github.com/langfuse/langfuse) [(GitHub · opik README)](https://github.com/comet-ml/opik/blob/e6c980fdeb4ead578af82472b0e55599fa1e0dbb/README.md)。这类产品与需求①④匹配度最高。行业媒体 InsideAI Media 在 2026 年 6 月的盘点中给出的选型框架与之一致："第一个决策是开源框架 vs 托管平台，第二个决策是离线评测 vs 在线监控" [(InsideAI Media)](https://insideaimedia.com/blogs/best-llm-evaluation-tools/)。

**第三类是人工对战竞技场（arena）**：解决"人工盲评"这一环，但都是中心化在线服务而非可私有部署的软件。Chatbot Arena 累计收集超过 600 万次人类偏好投票，其运营方 LMArena 于 2025 年 4 月公司化、2025 年 5 月以 6 亿美元估值融资 1 亿美元、2026 年 1 月 6 日 A 轮 1.5 亿美元、估值 17 亿美元，2026 年 1 月 28 日更名 "Arena" [(aiwiki)](https://www.aiwiki.ai/wiki/lmsys_chatbot_arena) [(创业邦)](https://m.cyzone.cn/article/821339.html)。国内对应物是上海 AI Lab 的 Compass Arena（司南与魔搭联合推出的人工对战服务）[(上海AI实验室)](https://www.shlab.org.cn/news/5443916) 与 SuperCLUE 竞技场（截至 2026-08-11 文生视频榜累计 53,390 次对战）[(superclueai.com)](https://superclueai.com/arena?tab=board&type=video)。它们都不提供自托管产品，但盲评交互设计（匿名双栏、投票、ELO 排行）是可直接借鉴的范式。

**2025–2026 年的三起关键资本事件直接影响选型判断**。其一，OpenAI 于 2026-03-09 宣布收购 promptfoo，将其技术整合进 OpenAI Frontier 企业平台，同时明确"继续建设开源项目" [(OpenAI 官方公告)](https://openai.com/index/openai-to-acquire-promptfoo/)；交易于 2026 年 5 月交割，项目保持 MIT 许可与模型中立 [(baeseokjae 分析)](https://baeseokjae.github.io/posts/openai-promptfoo-acquisition-2026/)。其二，2026 年 8 月 Dynatrace 宣布收购 Arize（Phoenix 母公司）[(Langfuse 对比页，核对至 2026-08-13)](https://langfuse.com/resources/engineering/best-phoenix-arize-alternatives)。其三，Braintrust 于 2026-02-17 完成 8,000 万美元 B 轮、估值 8 亿美元 [(SiliconANGLE)](https://siliconangle.com/2026/02/17/braintrust-breaks-80m-series-b-funding-round-become-observability-layer-ai/)。头部评测工具正快速并入大厂或资本阵营，"开源 + 中立"组合的数量在减少——对依赖二开的个人开发者而言，**许可证类型与代码可替换性比品牌更重要**。

![开源 LLM 评测候选项目 GitHub Stars（2026-08-16）](https://www.coze.cn/s/K0hRYmL7KXc/)

上图展示了十个主要开源候选的活跃度（GitHub Stars，2026-08-16 GitHub API 实时查询）。可观测+评测平台类（Langfuse、Opik）的 stars 总量最高，反映"平台化"是社区主需求；纯评测框架中 promptfoo 以 24,258 stars 领先，且保持着日更级提交节奏（最近 push 为 2026-08-15，与 Langfuse、EvalScope 等同处高频活跃区间）[(GitHub · promptfoo)](https://github.com/promptfoo/promptfoo)。值得注意的是 Arize Phoenix 采用 ELv2（非 OSI 批准的开源许可），图中以灰色标注以区分 [(Langfuse 对比页)](https://langfuse.com/resources/engineering/best-phoenix-arize-alternatives)。

---

## 二、候选产品逐一盘点

### 2.1 产品总览表

下表汇总 15 个产品的定位、开源状态、许可、活跃度与自部署难度。stars/更新时间为 2026-08-16 GitHub API 实时查询；许可与能力描述来自各项目官方仓库或文档。

| 产品 | 定位 | 开源 | License | Stars / 最近 push（2026-08-16） | 自部署难度 | 二开友好度 |
|---|---|---|---|---|---|---|
| **promptfoo** | 评测框架（CLI/YAML） | ✅ | MIT [(GitHub)](https://github.com/promptfoo/promptfoo) | 24,258 / 2026-08-15 | 极低（npx 即跑） | 高（Node/TS，引擎+库双形态） |
| **Langfuse** | 可观测+评测平台 | ✅（MIT 核心 + /ee 商业模块） | MIT [(官方 license 文档)](https://langfuse.com/self-hosting/license-key) | 33,155 / 2026-08-15 | 低（Docker Compose 约 5 分钟） | 高（API-first，monorepo） |
| **Comet Opik** | 可观测+评测平台 | ✅ 全功能 | Apache-2.0 [(Opik README)](https://github.com/comet-ml/opik/blob/e6c980fdeb4ead578af82472b0e55599fa1e0dbb/README.md) | 21,406 / 2026-08-14 | 低（Docker Compose 一键） | 高（后端+前端全开源） |
| **DeepEval** | 评测框架（pytest） | ✅ | Apache-2.0 [(GitHub)](https://github.com/confident-ai/deepeval) | 17,607 / 2026-08-13 | 极低（pip install） | 中高（Python 库，无服务端） |
| **Ragas** | RAG 评估指标库 | ✅ | Apache-2.0 [(GitHub)](https://github.com/vibrantlabsai/ragas) | 15,322 / 2026-02-24 | 极低 | 中（指标库，框架层薄） |
| **lm-evaluation-harness** | 学术基准框架 | ✅ | MIT [(GitHub)](https://github.com/kurhula/EleutherAI_lm-evaluation-harness) | 13,652 / 2026-08-14 | 中（数据集准备繁琐） | 中（面向基准任务） |
| **Arize Phoenix** | 可观测+评测平台 | ⚠️ source-available | ELv2（非 OSI）[(Langfuse 对比页)](https://langfuse.com/resources/engineering/best-phoenix-arize-alternatives) | 11,065 / 2026-08-16 | 低（单 Docker 容器） | 中（许可限制+收购不确定性） |
| **OpenCompass（司南）** | 评测框架（基准+主观） | ✅ | Apache-2.0 [(GitHub)](https://github.com/open-compass/opencompass) | 7,307 / 2026-08-12 | 中（Python 3.10+/依赖较重；纯 API 评测可在 CPU 环境） | 中（mmengine 配置体系学习曲线陡） |
| **TruLens** | 评估+追踪库 | ✅ | MIT [(GitHub)](https://github.com/truera/trulens/) | 3,510 / 2026-08-14 | 低 | 中 |
| **EvalScope（魔搭）** | 评测框架+竞技场+压测 | ✅ | Apache-2.0 [(GitHub)](https://github.com/injet-zhou/evalscope) | 3,240 / 2026-08-15 | 低（pip install，CLI 即跑） | 高（Python，模块化清晰） |
| **Inspect AI（UK AISI）** | 前沿模型评测框架 | ✅ | MIT [(官方文档)](https://inspect.aisi.org.uk/) | 2,556 / 2026-08-15 | 低（pip install） | 中高（代码即任务） |
| **LangSmith** | 可观测+评测平台 | ❌ 闭源 | 专有 [(AWS Marketplace)](https://aws.amazon.com/marketplace/pp/prodview-vmzygmggk4gms) | — | 自托管仅 Enterprise | 不可（闭源） |
| **Braintrust** | 评测+可观测 SaaS | ❌ 闭源 | 专有 [(SiliconANGLE)](https://siliconangle.com/2026/02/17/braintrust-breaks-80m-series-b-funding-round-become-observability-layer-ai/) | — | 自托管仅 Enterprise（Pro $249/月起） | 不可（闭源） |
| **Chatbot Arena (LMArena)** | 众包盲评竞技场 | ⚠️ 底层 FastChat 开源（Apache-2.0，39,512 stars）；平台本身中心化运营 | FastChat Apache-2.0；对战数据 CC BY-NC 4.0 [(GitHub · FastChat)](https://github.com/lm-sys/FastChat) [(aiwiki)](https://www.aiwiki.ai/wiki/lmsys_chatbot_arena) | — | 不提供托管产品（FastChat 是服务框架非评测产品） | 低（形态不匹配） |
| **SuperCLUE** | 中文测评基准+榜单 | ❌ 非软件（早期题库 SuperCLUE-Open 公开） | — [(superclueai.com)](https://superclueai.com/arena?tab=board&type=video) | — | — | 仅作内容/榜单对标 |

**排除项的排除理由需要明确说明**，因为它们频繁出现在各类"评测工具"清单中。**LangSmith 与 Braintrust 因闭源直接出局**：LangSmith 平台后端、UI、存储层均闭源，自托管是 Enterprise 专属附加项，AWS Marketplace 自托管套餐要求 15 万美元年度平台许可加最低 15 万美元年度用量承诺 [(AWS Marketplace)](https://aws.amazon.com/marketplace/pp/prodview-vmzygmggk4gms) [(Langfuse 对比页)](https://langfuse.com/resources/engineering/langsmith-alternative)；Braintrust 自托管仅限 Enterprise 计划，Pro 计划 249 美元/月 [(SiliconANGLE)](https://siliconangle.com/2026/02/17/braintrust-breaks-80m-series-b-funding-round-become-observability-layer-ai/)。**Dify 与 FastGPT 是 LLM 应用/知识库开发平台而非评测系统**：Dify（152,553 stars）采用"Apache-2.0 修改版"许可（多租户或去除品牌需商业授权），其能力清单为工作流编排、RAG、LLMOps 日志，没有用例管理/AI 裁判/评测报告流水线 [(Dify LICENSE)](https://github.com/langgenius/dify/blob/main/LICENSE) [(Open WebUI 官方对比页)](https://docs.openwebui.com/alternatives/dify/)。**FlagEval（智源天秤）开源代码已停滞**：仓库仅 338 stars，最近 push 停留在 2025-04-24 [(GitHub · FlagEval)](https://github.com/flageval-baai/FlagEval)，不适合作为二开基座。

### 2.2 第一梯队详解：七个可自部署候选

**promptfoo —— 多模型对比跑测的事实标准**。MIT 许可的开源 CLI 与库，一个 YAML 文件声明 prompts、providers、tests 与 assertions，执行后生成逐格对比矩阵与 Web 报告 [(promptfoo intro)](https://www.promptfoo.dev/docs/intro/)。与本次需求直接相关的四个事实：其一，provider 层原生覆盖 OpenAI（含 responses 新协议）与 Anthropic messages 协议，官方即提供"Claude vs GPT"对比教程 [(promptfoo 官方文档)](https://www.promptfoo.dev/docs/guides/claude-vs-gpt/)，并可接任意 OpenAI 兼容端点或自定义 provider [(promptfoo intro)](https://www.promptfoo.dev/docs/intro/)；其二，裁判能力通过 `llm-rubric`/`g-eval` 断言实现，裁判模型本身可配置为任意 provider；其三，结果表逐单元格记录 token（输入/输出拆分）、延迟、美元成本，并支持 `type: cost` / `type: latency` 阈值断言，Web UI 自 2025 年 11 月起提供 provider 间 token/延迟对比图表 [(promptfoo issue #8974)](https://github.com/promptfoo/promptfoo/issues/8974)；其四，Web UI 支持对单元格人工 thumbs 评分（manual grading）[(promptfoo PR #6260)](https://github.com/promptfoo/promptfoo/pull/6260)，但这是逐格打分而非匿名盲评。短板集中在需求①④：用例就是仓库里的文件，无数据库、无 UI、版本化依赖 git [(ZenML 评测)](https://www.zenml.io/blog/promptfoo-alternatives)。被 OpenAI 收购后官方承诺保持开源与多模型中立 [(OpenAI 官方公告)](https://openai.com/index/openai-to-acquire-promptfoo/)，但长期 roadmap 的中立性仍需持续观察。

**EvalScope —— 与需求形态最接近的中文生态选手**。魔搭社区的一站式评测框架，Apache-2.0，一条命令即可对 OpenAI 兼容 API 跑标准基准：`evalscope eval --model your-model-name --api-url $OPENAI_API_BASE_URL --eval-type openai_api` [(EvalScope README)](https://github.com/injet-zhou/evalscope)。它独有四个与需求高度契合的组件：自定义数据集评测（JSONL 开放式问答即可接入）[(EvalScope 自定义数据集文档)](https://evalscope.readthedocs.io/en/latest/advanced_guides/custom_dataset/llm.html)；`judge_model_args` 配置任意 API 模型作为裁判（JudgeStrategy.LLM）[(同上)](https://evalscope.readthedocs.io/en/latest/advanced_guides/custom_dataset/llm.html)；竞技场模式支持多模型两两对战、位置交换消偏、五级判定、ELO/胜率排名，可选 AI 自动评审（AAR）或人工评估 [(EvalScope Arena 文档)](https://evalscope.readthedocs.io/en/v1.0.2/user_guides/arena.html)；Web 可视化服务（evalscope service）提供 Dashboard、多模型对比与预测详情穿透，压测模块输出 TTFT/TPOT/输入输出 token 分布 [(EvalScope 可视化文档)](https://evalscope.readthedocs.io/en/latest/get_started/visualization.html)。魔搭托管评测服务 PivotEval 即以 EvalScope 为底座，且明确要求用户提供 OpenAI 兼容或 Anthropic 兼容 API [(阿里云开发者社区)](https://developer.aliyun.com/article/1731742)。其劣势是社区体量（3,240 stars，约为 promptfoo 的 1/7）与英文生态影响力。

**Langfuse —— 用例管理与人工标注最完整的开源平台**。MIT 核心、自托管免费且无功能门槛（仅 /ee 目录的 SCIM、审计日志等企业模块需 license key），官方文档称 Docker Compose 5 分钟即可本地跑起来 [(Langfuse license 文档)](https://langfuse.com/self-hosting/license-key)。评测侧能力齐备：LLM-as-a-judge（可配置裁判模型与评分标准）、代码评估器、用户反馈、人工标注队列（Annotation Queues）、自定义评估管道，以及 Datasets + Experiments 的系统化测试 [(GitHub · langfuse)](https://github.com/langfuse/langfuse)。Experiments 通过 SDK 对数据集逐条执行自定义 task 函数并附加评分 [(Langfuse Experiments SDK 文档)](https://langfuse.com/docs/evaluation/experiments/experiments-via-sdk)——注意这意味着**批量跑测的"腿"（调用被测模型的代码）需要用户自己写**，Langfuse 提供的是数据、调度记录与评分聚合。每条 observation 自动记录 token、延迟与成本 [(effloow 自托管指南)](https://effloow.com/articles/langfuse-llm-observability-self-host-guide-2026)。它最适合充当"评测数据中台"，而非开箱即用的选型跑测器。

**Comet Opik —— 全功能开源的 LLMOps 平台**。Apache-2.0，服务端后端、Web 应用、数据集、实验、评估、prompt 管理全部包含在开源仓库中，自托管免费，Docker Compose 一键启动 [(Opik README)](https://github.com/comet-ml/opik/blob/e6c980fdeb4ead578af82472b0e55599fa1e0dbb/README.md)。提供 40+ LLM-as-a-judge 指标、Test Suites（单元式断言）、PyTest CI 集成与 token 用量 Dashboard [(opik.com)](https://opik.com)。与 Langfuse 类似，其评测循环以"数据集+实验"为中心，跑测逻辑同样需要用户以代码形式提供；第三方评测（2026-05）确认其免费与付费层之间无功能门 [(baeseokjae 评测)](https://baeseokjae.github.io/posts/comet-opik-review-2026/)。21,406 stars、近两月持续高频提交，是平台类中二开风险最低的选项之一。

**DeepEval —— pytest 式评测库，指标库最丰富**。Apache-2.0，本地优先、可完全离线，50+ 研究支撑指标（G-Eval 自定义标准裁判、DAG 决策图裁判、agent/RAG/多轮/多模态指标），评测写法与 pytest 单元测试一致 [(GitHub · deepeval)](https://github.com/confident-ai/deepeval)。官方 FAQ 明确 DeepEval 完全免费，配套的 Confident AI 云平台有免费层与付费计划（Starter 19.99 美元/用户/月）[(Confident AI 框架页)](https://www.confident-ai.com/frameworks/deepeval)。它的局限是**库而非平台**：无 Web 服务、无内置用例管理界面、无盲评流程，协作与报告依赖商业云平台；对"私人单用户选型"场景，其 pytest 形态反而需要自己补一层用例组织与报告渲染。

**OpenCompass（司南）—— 中文权威基准与主观评测体系**。上海 AI Lab 的 Apache-2.0 评测平台，100+ 数据集、支持 Llama/GPT-4/Claude/Qwen 等模型，被 Meta AI 在 Llama 文档中官方推荐 [(dev.co 引用 GitHub 字段)](https://dev.co/ai/frameworks/opencompass) [(GitHub · opencompass)](https://github.com/open-compass/opencompass)。其主观评测模块允许用任意格式（json/jsonl/csv）准备自定义数据集，以 question/capability/others 三字段组织，支持对战（Compare）与打分（Score）模式，任何受支持模型可充当 JudgeLLM [(OpenCompass 主观评测指引)](https://doc.opencompass.org.cn/zh_CN/advanced_guides/subjective_evaluation.html)。2024 年 1 月发布的 2.0 体系由 CompassKit/CompassHub/CompassRank 构成，30+ 机构采用 [(上海AI实验室)](https://www.shlab.org.cn/news/5443858)。但对个人开发者，它有三个摩擦点：依赖体系较重（mmengine 配置、Python 3.10+、本地权重评测需 GPU）[(OpenCompass Quick Start)](https://opencompass.readthedocs.io/en/latest/get_started/quick_start.html)；API 模型评测虽可在 CPU 环境运行，文档体系仍以基准数据集为中心 [(gitee 镜像 README)](https://gitee.com/liuwake/opencompass)；token/费用维度不是报告一等公民。它更适合作为"对齐权威基准分数"的补充工具而非选型主平台。

**Inspect AI —— 英国 AI 安全研究所的严肃选手**。MIT 协议，数据集/agent/工具/scorer 可组合构件，200+ 预制评测（含 MMLU、Cybench、WMDP），model-graded 评分内置，统一接口覆盖 OpenAI/Anthropic/Ollama/HuggingFace，配 Inspect View 可视化与 VS Code 扩展 [(Inspect 官方文档)](https://inspect.aisi.org.uk/) [(GitHub · inspect_ai，2026-08-16 API 查询 2,556 stars)](https://inspect.aisi.org.uk/)。其设计面向前沿模型安全与能力评测（沙箱、多 agent、代码执行），用例以 Python 代码定义、无 Web 用例管理与人工盲评 UI。对开放式业务用例选型场景属于"部分匹配"，但 scorer 架构与 task-as-code 模式值得借鉴。

### 2.3 第二梯队与边缘候选

**Arize Phoenix** 免费自托管、单容器部署、内置数据集/实验/人工标注/LLM 裁判 [(Arize Phoenix 官网)](https://arize.com/phoenix/)，但采用 ELv2——非 OSI 批准的许可，禁止将其作为托管服务转售；且 2026 年 8 月 Dynatrace 宣布收购 Arize，收购公告未点名 Phoenix 的开源承诺 [(Langfuse 对比页，2026-08-14)](https://langfuse.com/resources/engineering/best-phoenix-arize-alternatives)。对"开源可二开"这一硬约束，Phoenix 只能算条件受限的候选。**Ragas**（Apache-2.0，15,322 stars，归属 Vibrant Labs）聚焦 RAG 指标与测试集生成，是指标库而非平台 [(GitHub · ragas)](https://github.com/vibrantlabsai/ragas)；**TruLens**（MIT，TruEra 已被 Snowflake 收购）强于 RAG Triad 与追踪 [(GitHub · trulens)](https://github.com/truera/trulens/)；**lm-evaluation-harness**（MIT，13,652 stars）是 HuggingFace Open LLM Leaderboard 的底座、学术基准事实标准 [(GitHub · lm-eval-harness)](https://github.com/kurhula/EleutherAI_lm-evaluation-harness)——三者均与"开放式业务用例选型"的产品形态错位，可作指标/基准的补充件。**Open WebUI**（148,879 stars）内置 Arena Model 盲测：随机匿名选模型、thumbs 投票、个人化排行榜 [(Open WebUI 评估文档)](https://docs.openwebui.com/features/administration/evaluation/)，其许可为 BSD-3-Clause 附加品牌保留条款（≤50 用户部署不受品牌限制约束）[(Open WebUI LICENSE 文档)](https://docs.openwebui.com/license/)，但它是聊天平台而非评测系统，无批量跑测/裁判配置/报告能力，价值在于盲评交互参考。

**2025–2026 年新出的自托管竞技场项目值得单独记录**：EvalArena（MIT，"Like LMSYS Chatbot Arena, but runs on your own server"，ELO+Glicko-2 排名、审计日志，2026-05 仍在提交但 stars≈0）[(GitHub · EvalArena)](https://github.com/Jane-o-O-o-O/evalarena)、Open Model Arena（MIT，面向 OpenAI 兼容端点的成本感知盲评+ELO，3 stars）[(GitHub · open-model-arena)](https://github.com/pete-builds/open-model-arena)、Local LLM Arena（本地 Ollama 盲评+LLM judge+私有 ELO，8 stars）[(GitHub · Local-LLM-Arena)](https://github.com/sammy995/Local-LLM-Arena)。这批项目证明**"自托管私有盲评竞技场"仍是生态空白位**——它们的成熟度不足以直接使用，但验证了该需求真实存在且实现量级不大（单容器+SQLite 即可）。

---

## 三、六项需求逐一匹配：没有全绿产品

将七个核心候选对照六项需求逐一评分（0–1，依据各项目官方文档与仓库的公开事实），结果如下图与下表。**没有任何产品拿到 6/6**；合计分最高的是 promptfoo（4.9/6），其后 EvalScope 与 Langfuse 并列 4.8/6。三者的短板恰好不同：promptfoo 缺用例管理 UI 与盲评流程，EvalScope 缺社区体量与英文生态广度，Langfuse 不会替你调用被测模型（需自带 runner 代码）。

![候选产品 × 六项核心需求匹配度热力图（2026-08）](https://www.coze.cn/s/FJrOShO6als/)

| 需求 | promptfoo | EvalScope | Langfuse | Comet Opik | Inspect AI | DeepEval | OpenCompass |
|---|---|---|---|---|---|---|---|
| ① 用例管理与版本化 | 部分（YAML/CSV+git，无 UI）[(promptfoo intro)](https://www.promptfoo.dev/docs/intro/) | 部分（JSONL 自定义数据集）[(EvalScope 文档)](https://evalscope.readthedocs.io/en/latest/advanced_guides/custom_dataset/llm.html) | **强**（Datasets+UI+API）[(GitHub · langfuse)](https://github.com/langfuse/langfuse) | **强**（Datasets+版本化）[(Opik README)](https://github.com/comet-ml/opik/blob/e6c980fdeb4ead578af82472b0e55599fa1e0dbb/README.md) | 中（task-as-code）[(Inspect 文档)](https://inspect.aisi.org.uk/) | 部分（代码内数据集）[(GitHub · deepeval)](https://github.com/confident-ai/deepeval) | 中（数据集类+配置）[(OpenCompass 指引)](https://doc.opencompass.org.cn/zh_CN/advanced_guides/subjective_evaluation.html) |
| ② 多协议接入批量跑测 | **强**（OpenAI v1/v2+Anthropic 原生，50+ provider）[(promptfoo 文档)](https://www.promptfoo.dev/docs/guides/claude-vs-gpt/) | **强**（OpenAI/Anthropic 兼容 API 直连）[(阿里云 PivotEval)](https://developer.aliyun.com/article/1731742) | 弱（需自带 runner 代码）[(Langfuse SDK 文档)](https://langfuse.com/docs/evaluation/experiments/experiments-via-sdk) | 弱（同上，SDK 实验）[(Opik README)](https://github.com/comet-ml/opik/blob/e6c980fdeb4ead578af82472b0e55599fa1e0dbb/README.md) | **强**（统一多 provider 接口）[(Inspect 文档)](https://inspect.aisi.org.uk/) | 中（需包装自定义模型对象）[(deepeval benchmarks 文档)](https://deepeval.com/docs/benchmarks-introduction) | **强**（20+ HF/API 模型，分布式调度）[(GitHub · opencompass)](https://github.com/open-compass/opencompass) |
| ③ 可配置 AI 裁判 | **强**（llm-rubric/g-eval，裁判可配任意 provider）[(genai.qa 对比)](https://genai.qa/blog/promptfoo-vs-deepeval/) | **强**（judge_model_args，任意 API 裁判）[(EvalScope 文档)](https://evalscope.readthedocs.io/en/latest/advanced_guides/custom_dataset/llm.html) | **强**（LLM-as-a-judge 模板可配）[(GitHub · langfuse)](https://github.com/langfuse/langfuse) | **强**（40+ 指标，在线评估规则）[(opik.com)](https://opik.com) | **强**（model_graded scorer）[(Inspect 文档)](https://inspect.aisi.org.uk/) | **强**（G-Eval/DAG，任意裁判）[(GitHub · deepeval)](https://github.com/confident-ai/deepeval) | **强**（JudgeLLM 任意受支持模型）[(OpenCompass 指引)](https://doc.opencompass.org.cn/zh_CN/advanced_guides/subjective_evaluation.html) |
| ④ 人工评估/盲评 | 弱（单元格点赞，非盲评）[(promptfoo PR #6260)](https://github.com/promptfoo/promptfoo/pull/6260) | 中（竞技场可选人工评估）[(EvalScope Arena 文档)](https://evalscope.readthedocs.io/zh-cn/v0.7.1/user_guides/arena.html) | **强**（Annotation Queues 人工标注流）[(effloow 指南)](https://effloow.com/articles/langfuse-llm-observability-self-host-guide-2026) | 中（UI 标注 feedback score）[(Opik README)](https://github.com/comet-ml/opik/blob/e6c980fdeb4ead578af82472b0e55599fa1e0dbb/README.md) | 弱（无内置人工流程） | 弱（依赖 Confident AI 云）[(Confident AI 页)](https://www.confident-ai.com/frameworks/deepeval) | 弱（主观评测以 JudgeLLM 替代人工）[(OpenCompass 指引)](https://doc.opencompass.org.cn/zh_CN/advanced_guides/subjective_evaluation.html) |
| ⑤ 评测报告（排行/穿透） | **强**（矩阵视图+单格穿透+Web 报告）[(promptfoo intro)](https://www.promptfoo.dev/docs/intro/) | **强**（WebUI Dashboard+预测详情）[(EvalScope 可视化)](https://evalscope.readthedocs.io/en/latest/get_started/visualization.html) | 中（实验对比+score 分析）[(GitHub · langfuse)](https://github.com/langfuse/langfuse) | 中（实验对比）[(opik.com)](https://opik.com) | 中（Inspect View）[(Inspect 文档)](https://inspect.aisi.org.uk/) | 部分（pytest 输出+云报告需 Confident AI）[(GitHub · deepeval)](https://github.com/confident-ai/deepeval) | 中（CSV/TXT 结果表+榜单）[(OpenCompass Quick Start)](https://opencompass.readthedocs.io/en/latest/get_started/quick_start.html) |
| ⑥ token/费用/耗时 | **强**（逐格 token/延迟/$成本+cost 断言）[(promptfoo issue #8974)](https://github.com/promptfoo/promptfoo/issues/8974) | **强**（压测 TTFT/TPOT/token 吞吐）[(EvalScope 压测文档)](https://evalscope.readthedocs.io/en/latest/user_guides/stress_test/quick_start.html) | **强**（每条 observation 记录 token/成本）[(effloow 指南)](https://effloow.com/articles/langfuse-llm-observability-self-host-guide-2026) | **强**（token usage dashboard）[(Opik README)](https://github.com/comet-ml/opik/blob/e6c980fdeb4ead578af82472b0e55599fa1e0dbb/README.md) | 弱（非核心关注） | 中（裁判成本追踪）[(deepeval 对比文)](https://deepeval.com/blog/deepeval-vs-ragas) | 弱（未见费用一等指标） |

三个结构性观察值得展开。**第一，"跑测引擎"与"管理/人工平台"是分裂的**：promptfoo/Inspect/OpenCompass 有腿没手（不会管理用例、不做人工流程），Langfuse/Opik 有手没腿（不会替你调模型）。这正是需要"二开拼装"的根源。**第二，人工盲评是全市场空白**：中心化的 Chatbot Arena 验证了方法学（匿名双栏+投票+ELO）[(aiwiki)](https://www.aiwiki.ai/wiki/lmsys_chatbot_arena)，但没有任何成熟的自托管产品把它产品化，2025–2026 新出的 EvalArena/Open Model Arena/Local LLM Arena 都停在玩具阶段 [(GitHub · EvalArena)](https://github.com/Jane-o-O-o-O/evalarena)。对个人开发者，这是唯一必须自己写、但写起来并不复杂的部分。**第三，成本指标已被头部框架标准化**：promptfoo 逐格记录 token/延迟/美元成本 [(promptfoo issue #8974)](https://github.com/promptfoo/promptfoo/issues/8974)，EvalScope 压测报告含 TTFT/TPOT 与 token 分布 [(EvalScope 压测文档)](https://evalscope.readthedocs.io/en/latest/user_guides/stress_test/quick_start.html)，Langfuse 每条 observation 记录 token 与成本 [(effloow 指南)](https://effloow.com/articles/langfuse-llm-observability-self-host-guide-2026)——这一项无需自研。

关于"评测可信度"的量化参考：第三方对比（genai.qa，2026-04）称 promptfoo 与 DeepEval 的裁判评分与人工评分一致率约 85–92%，建议对标记样本抽样 5–10% 人工复核；1 万次/天评估的裁判 token 成本量级约每月 150–500 美元 [(genai.qa)](https://genai.qa/blog/promptfoo-vs-deepeval/)。该来源为咨询营销博客、置信度中等，数字只作量级参考——但它印证了一个实践原则：**AI 裁判打初筛、人工复核保底线**，恰好与用户"AI 裁判 + 人工盲评"的双轨设计互相印证。

---

## 四、决策分析：直接用、二次开发还是从 0 到 1

![三条路线决策与推荐技术栈](https://www.coze.cn/s/c1b6DKOOj5M/)

**路线 A（直接用现成产品）：可行但有明确缺口**。最省事的方案是直接以 promptfoo 作为选型工具：写一份 promptfooconfig.yaml 声明业务用例与候选模型，llm-rubric 配强模型裁判，跑完在 Web UI 看矩阵报告 [(promptfoo intro)](https://www.promptfoo.dev/docs/intro/)。它覆盖了需求②③⑥的大部分，一两天即可出第一份选型报告。但用例散落为文件、没有盲评、报告形态不可定制为小红书向图文，需求①④⑤只能半满足。如果"私人选型"是唯一目的且不做内容产品化，路线 A 已经够用——这也是调研给出的一个重要分岔：**若不做产品化，promptfoo 开箱即用即可，连二开都不必**。

**路线 B（基于开源二次开发）：推荐**。判断依据是三条路线的成本-风险对比：

| 维度 | A 直接用 | B 二开（推荐） | C 从0到1自研 |
|---|---|---|---|
| 六项需求覆盖 | 约 4/6（缺用例 UI、盲评） | 6/6（薄层补齐缺口） | 6/6（全部自建） |
| 到 MVP 工作量 | 1–2 天 | 数周（单人数周量级） | 数月以上 |
| 长期维护 | 跟随上游 | 薄层自维护+引擎跟随上游 | 全部自担（协议/并发/裁判模板） |
| 许可证风险 | MIT，无限制 [(GitHub · promptfoo)](https://github.com/promptfoo/promptfoo) | 同左 | 无 |
| 上游变动风险 | 收购后中立性存疑 [(OpenAI 公告)](https://openai.com/index/openai-to-acquire-promptfoo/) | 引擎可替换（EvalScope/DeepEval 同构） | 无上游依赖 |

路线 B 的核心论证是：**需求中真正没有现成方案的只有"用例管理薄层 + 盲评交互 + 定制报告"三件事，其余全部是已被解决的轮子**。协议适配（OpenAI v1/v2、Anthropic）、并发与缓存调度、裁判提示词工程、成本统计——这四块是自研方案中 70% 以上的隐性工作量，而 promptfoo 的 MIT 许可允许自由修改分发 [(GitHub · promptfoo)](https://github.com/promptfoo/promptfoo)；EvalScope/OpenCompass 的 Apache-2.0 同样宽松。薄壳的具体构成：其一，用例库（SQLite 存储题目+维度标签+期望要点，导出为 promptfoo 可读的 YAML/JSON，版本快照用 git）；其二，盲评页（随机抽两个模型输出匿名并排展示，参考 Open WebUI Arena Model 的随机匿名机制 [(Open WebUI 评估文档)](https://docs.openwebui.com/features/administration/evaluation/) 与 EvalArena 的 ELO/Glicko-2 排名 [(GitHub · EvalArena)](https://github.com/Jane-o-O-o-O/evalarena)，投票结果回写）；其三，报告层（聚合 promptfoo 结果 JSON 生成总分排行、分维度得分、单用例穿透与 token/费用汇总表，输出 Markdown 供小红书二次加工）。

**路线 C（从 0 到 1 自研）：不推荐，除非出现强差异化动机**。自研意味着独立维护 provider 协议层（OpenAI Responses 新协议、Anthropic 思考 token 计费等细节都在快速演进，promptfoo 仓库在 2026 年 7–8 月仍在为此类细节高频打补丁 [(promptfoo PR #10210)](https://github.com/promptfoo/promptfoo/pull/10210)）、裁判稳定性工程与报告系统，而这些恰是开源社区投入最密集的领域。对一个"私人选型 + 内容分享"定位的产品，自研的机会成本远高于其差异化收益。唯一支持自研的情形是：盲评玩法本身成为产品核心卖点且现有引擎的调度模型无法承载——即便如此，也建议引擎层复用、只自研交互层。

---

## 五、风险提示与不确定性

第一，**promptfoo 的中立性风险**。OpenAI 收购公告承诺"继续建设开源项目"并保持多模型支持 [(OpenAI 官方公告)](https://openai.com/index/openai-to-acquire-promptfoo/)，第三方转述收购时点采用数据为 35 万+开发者、25%+ 财富 500 强 [(druce.ai 厂商档案)](https://druce.ai/governance/wiki/vendors/promptfoo)，但收购方同时是参赛模型厂商，长期 roadmap 存在利益冲突的可能；行业评论已将"中立性"列为买方关注点 [(druce.ai 厂商档案)](https://druce.ai/governance/wiki/vendors/promptfoo)。对冲手段是架构上保持引擎可替换——EvalScope（同为"API 跑测+裁判+竞技场"形态）[(EvalScope Arena 文档)](https://evalscope.readthedocs.io/en/v1.0.2/user_guides/arena.html) 与 Inspect AI（task-as-code，MIT）[(Inspect 文档)](https://inspect.aisi.org.uk/) 均可在数周内替换接入层。第二，**LLM-as-a-Judge 的可靠性边界**：裁判模型自身存在不一致与偏置，业界通行做法是结构化 rubric + 少量人工标注校准，抽样 5–10% 人工复核 [(genai.qa)](https://genai.qa/blog/promptfoo-vs-deepeval/) [(InsideAI Media)](https://insideaimedia.com/blogs/best-llm-evaluation-tools/)；对用户的小红书内容场景，人工盲评恰是可信度差异化的来源。第三，**裁判成本量级**：按第三方估算，1 万次/天评估的裁判 token 费用约每月 150–500 美元 [(genai.qa)](https://genai.qa/blog/promptfoo-vs-deepeval/)（单一来源、置信度中等）；个人规模（百级用例 × 数模型）月成本预计在数十美元量级，可控但应在报告页保留成本列以便持续监控。第四，**本报告数据时效**：GitHub stars/更新时间为 2026-08-16 快照；promptfoo 收购交割状态、Dynatrace-Arize 交易细节均可能在后续季度变化，决策时点临近建议复查。

---

## 六、结论与行动建议

**结论：市面上同类产品充分存在，不需要也不应该从 0 到 1 自研。** 在"直接用 / 二开 / 自研"三选一中，推荐**基于 promptfoo（MIT）做轻量二次开发**：以它为跑测与裁判引擎，自建"用例库 + 人工盲评页 + 报告导出"薄壳；Python 技术栈偏好者可选 EvalScope（Apache-2.0）作为替代引擎。若仅私人选型、不做产品化，直接用 promptfoo 即可，无需任何开发。

落地建议按优先级排列：（1）**第一周**：用 promptfoo 原生跑通第一个 YAML 评测（3–5 个业务用例 × 3 个模型，llm-rubric 裁判），验证多协议接入与成本统计 [(promptfoo 文档)](https://www.promptfoo.dev/docs/guides/claude-vs-gpt/)；（2）**第二至四周**：搭建薄壳 MVP——SQLite 用例库（题目/维度/版本）、盲评投票页（匿名双栏+ELO）、报告生成器（排行/分维度/穿透/token 费用表 + Markdown 导出）；（3）**持续**：用例集按 git 版本化沉淀，每季度用同一用例集重测，形成"纵向可比的私有基准"——这既是选型工具，也是小红书内容的数据资产。

**触发重估的条件**：若 promptfoo 上游出现许可收紧或明显向 OpenAI 模型倾斜的迹象，或 EvalScope/社区出现更完整的自托管竞技场产品（当前该生态位仍空白 [(GitHub · EvalArena)](https://github.com/Jane-o-O-o-O/evalarena)），则应重新评估引擎选型；若未来需求扩展到多人协作与生产监控，应将数据层迁移至 Langfuse 自托管实例（MIT、无功能门槛）[(Langfuse license 文档)](https://langfuse.com/self-hosting/license-key)，薄壳与引擎可保持不变。
