# 模型选择：由 orchestrator 自主判断

代码里不写死任何模型，也不排除任何模型。

- swarm 启动时，orchestrator 调用 `swarm{action:"models", all:true}`，拿到你的 Google AI 订阅当前提供的模型列表。之后每启动一个智能体，它都从这份列表里给它选一个模型。
- 选择时会综合考虑：角色需要什么（深度、严格度、速度、长输出、引用准确性），`--priority`（`quality` / `balanced` / `economy`），本次运行里各模型的实际表现，剩余预算和额度。
- Google 发布新模型（包括以后的 Gemini 5）或下架旧模型时，只要它出现在列表里或从列表里消失，orchestrator 就能自动跟上，代码不用改。
- 每次选择都会连同一行理由记进 `cogentic_charge`。用 `cogentic_models` 可以看到每个模型调用了多少次、prover 稿件被接受和被拒的次数、verifier 漏判了多少次。从第二轮起，orchestrator 会根据这些数据调整选择。

运行规程见 [skills/cogentic/references/model-selection.md](../skills/cogentic/references/model-selection.md)。参考资料见 [models/catalog.json](../models/catalog.json)，里面有各模型系列的知识卡片、各角色的需求和选择原则。这些都只是**建议**：orchestrator 在本次运行里观察到的实际表现比卡片更重要；列表里出现了没有卡片的模型，就当作新模型处理，先放在低风险的角色上试用，表现好再提拔。

## 你可以干预的地方

| 参数 | 作用 |
|---|---|
| `--priority quality\|balanced\|economy` | 在准确度和速度、额度之间偏向哪一边（默认 `balanced`） |
| `--pin <角色>=<模型>` | 某个角色必须用你指定的模型，可以写多次。引擎会拒绝其他选择 |
| `--single-model <模型>` | 所有智能体都用同一个模型，对应论文"整次运行只用一个基础模型"的设定 |

角色名：`orchestrator`、`literature`、`summarizer`、`prover`、`solo_verifier`、`cross_verifier`、`auditor`、`lemma_verifier`、`advisor`、`comparator`、`writer`、`final_auditor`、`narrator`、`monitor`。

## 卡片的依据（2026-11）

`catalog.json` 里 Carbon、Neon、Hydrogen 三张卡片的数据来自以下页面（2026-11-16 至 11-19 发布），没有逐项向 Google 或 Artificial Analysis 的原始榜单核实：

- Google DeepMind 模型卡：[Neon](https://deepmind.google/models/model-cards/gemini-4-neon/)、[Carbon](https://deepmind.google/models/model-cards/gemini-4-carbon/)、[Hydrogen](https://deepmind.google/models/model-cards/gemini-4-hydrogen/)
- [aihubmix 对比（引用 AA 2026-11-19 快照）](https://aihubmix.com/blog/gemini-4-hydrogen-vs-neon-vs-carbon-vs-argon-which-one-should-you-use)
- [valyu 对比](https://www.valyu.ai/blogs/gemini-4-neon-vs-carbon-vs-hydrogen-vs-argon)
- [respan 对比](https://www.respan.ai/articles/gemini-4-hydrogen-vs-argon-vs-carbon)
- [dev.to 实测（AIME 2025 / GSM8K / BFCL）](https://dev.to/gde/which-gemini-model-should-you-use-neon-argon-hydrogen-carbon-flash-or-gemma-it-depends-ano)

几点概括：Carbon 推理最深、审查最严，但最慢；Neon 综合指数最高、长上下文强、输出长，但最啰嗦，幻觉率也相对高；Hydrogen 最快最省，非幻觉率最高，但在最难的推理上明显落后。卡片里还写了：Gemini 4 Argon 即将下架，Gemini 4 以前的模型偏弱。这两条也只是建议。

需要注意：这些页面里没有专门评测"研究级证明写作"的基准，卡片是用 HLE-Diamond、CritPt、RiemannBench 作为数学推理的代理指标，用非幻觉率作为引用可靠性的代理指标；不同来源的数字也有出入。新模型发布后，更新 `models/catalog.json` 就行。
