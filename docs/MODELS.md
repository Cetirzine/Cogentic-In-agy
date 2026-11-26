# 角色与模型分配（只用 Gemini 4 系列）

插件内置四套预设，`/cogentic --preset <名字>` 切换。也可以在 `cogentic_init` 的 `models` 参数里按角色单独覆盖。
引擎会拒绝 `gemini-4-{neon|carbon|argon|hydrogen}-{low|medium|high|xhigh}` 以外的任何模型 id，Carbon 和 Argon 最高只到 `high`。

## 默认预设 `balanced`

| 角色 | 模型 | 理由 |
|---|---|---|
| orchestrator（协调者） | `gemini-4-neon-medium` | 官方定位是"长时间运行的智能体工作流、工具密集任务"。协调者不做数学推导，主要是调度和读状态，用 Medium 就够，省额度 |
| literature reviewer | `gemini-4-argon-medium` | 非幻觉率在四款里最高（AA 95.7%），输出 token 最少（AA 全套测试 113M）。文献检索最怕编造引用 |
| summarizer | `gemini-4-argon-medium` | 长上下文检索强（GraphWalks ≤128k 99.7%），输出简短，适合把长历史压缩成简报 |
| prover（轮换） | `gemini-4-carbon-high`、`gemini-4-neon-high` | Carbon 是官方的"最难问题 / 形式证明"档：CritPt 69.0、HLE-Diamond 69.1、RiemannBench 80.0。Neon 的 RiemannBench 84.0、HLE-Diamond（xhigh）71.3。同一轮里两款交替，减少共同盲点 |
| solo verifier | `gemini-4-carbon-high` | 官方定位里有"extended verification loops"，非幻觉率 88.6%，高于 Neon |
| cross verifier | `gemini-4-neon-high` | 一次读完整轮全部稿件，要长上下文（GraphWalks 256k–1M 95.2%）、速度也要比 Carbon 快。和 solo verifier 不是同一款模型，每份稿件都会经过 Carbon 和 Neon 两款模型审查 |
| auditor | `gemini-4-argon-high` | 要把片段忠实地改写成自包含引理，不能添油加醋，所以选低幻觉的 Argon |
| lemma verifier | `gemini-4-carbon-medium` | 单条引理篇幅短，Carbon 的 Medium 档和 High 档差距很小（AA 58.3 对 60.0），每轮可能有好几条，所以用 Medium |
| process advisor | `gemini-4-argon-medium` | 读整次运行的长日志，产出简短的流程建议，不需要深度推理 |
| comparator | `gemini-4-neon-high` | 要在多份已验证的证明之间判断强弱 |
| formal writer | `gemini-4-argon-high` | 输出长，要求不改动数学内容，低幻觉、低冗余最重要 |
| final auditor | `gemini-4-carbon-high` | 最后一道关，最严格 |
| narrator / monitor | `gemini-4-hydrogen-low` | 只负责维护 swarm 的 Overview 和看守卡死，用最快最省的档位（AA 每个任务 1.5 分钟） |

额度消耗大头在 prover 和 verifier，其余角色都尽量往下压了一档。

## 其他预设

- `faithful`：所有角色都用 `gemini-4-argon-high`，对应论文的设定（同一次运行"完全由同一个基础模型驱动"，论文里有两道题用的是 Gemini 4 Argon 早期版本）。适合复现论文结果、做对照。
- `economy`：prover 用 `neon-medium` / `carbon-medium`，verifier 用 `carbon-medium` / `neon-medium`，其余角色用 Hydrogen 或 Argon 的低档。适合先试跑、调题面。
- `max`：prover 用 `carbon-high` / `neon-xhigh`，cross verifier 和 comparator 用 `neon-xhigh`，其余角色都上 High。适合最难的题。注意 Neon xhigh 很啰嗦（AA 全套测试 283M 输出 token）。

## 依据与注意事项

数据来自以下页面（2026-11-16 至 11-19 发布），没有逐项向 Google 或 Artificial Analysis 原始榜单核实：

- Google DeepMind 模型卡：[Neon](https://deepmind.google/models/model-cards/gemini-4-neon/)、[Carbon](https://deepmind.google/models/model-cards/gemini-4-carbon/)、[Argon](https://deepmind.google/models/model-cards/gemini-4-argon/)、[Hydrogen](https://deepmind.google/models/model-cards/gemini-4-hydrogen/)
- [aihubmix 对比（引用 AA 2026-11-19 快照）](https://aihubmix.com/blog/gemini-4-hydrogen-vs-neon-vs-carbon-vs-argon-which-one-should-you-use)
- [valyu 对比](https://www.valyu.ai/blogs/gemini-4-neon-vs-carbon-vs-hydrogen-vs-argon)
- [respan 对比](https://www.respan.ai/articles/gemini-4-hydrogen-vs-argon-vs-carbon)
- [dev.to 实测（AIME 2025 / GSM8K / BFCL）](https://dev.to/gde/which-gemini-model-should-you-use-neon-argon-hydrogen-carbon-flash-or-gemma-it-depends-ano)

需要注意：

- 这些页面里没有专门评测"研究级证明写作"的基准。上表把 HLE-Diamond、CritPt、RiemannBench 当作数学推理能力的代理指标，把非幻觉率当作引用可靠性的代理指标。
- AIME 2025 上四款都是 30/30，已经区分不出高下，而且有数据污染的可能。
- 不同来源的数字有出入，例如 Carbon 的 Terminal-Bench 4.0 有 65.2% 和 63.1% 两个版本，respan 网关测的速度和 AA 差别很大。
- Google AI 订阅（任意档位）按额度计，不按美元计价，所以这里说的"省"指少消耗 token 和额度。不同档位能用的 Gemini 4 型号和额度都不一样，以 `agy models` 和 `swarm{action:"models"}` 的输出为准。如果预设里的某个模型在你的档位上不可用，orchestrator 会换成同系列最接近的可用档位，并告诉你。额度紧张的档位建议先用 `economy`。
- 新模型发布或者跑过真实题目之后，请按实际表现调整这些预设。改 `mcp/engine.cjs` 里的 `PRESETS` 即可，测试会检查所有预设是否都只用了 Gemini 4。
