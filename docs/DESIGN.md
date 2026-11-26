# 设计：论文 → 实现对照

论文：Cai, Gupta, Jiang, Liaw, Mehta, Velegkas, Wang. *Cogentic: Multi-Agent Orchestration for
Automated Proof Discovery*. arXiv:2609.40324（v2，2026-10-01），CC BY-NC-SA 4.0。论文没有公开代码和
prompt，下文的所有提示词与实现都是本仓库按论文第 2 节的描述自行编写的。

## 组件

| 论文（第 2 节） | 本实现 | 由谁保证 |
|---|---|---|
| Orchestrator：跟踪全局状态，把 prover 名额分配给各研究方向，派出 summarizer，判断 verifier 是否达成一致，管理 ledger 和 record；**不做数学推导** | 调用 `/cogentic` 的那个会话，作为 swarm 的 coordinator（`skills/cogentic/SKILL.md`）。workflow 模式下由脚本加 `roles/orchestrator.md` 承担 | 技能明文禁止 orchestrator 发表数学意见；一致性判定写死在引擎里，不交给模型判断 |
| Literature reviewers：开局时检索；某一步反复卡住时可以中途再派出去做定向检索 | `roles/literature-reviewer.md` → `cogentic_add_literature` | 技能第 4 步和第 5.10 步（同一步骤连续两轮失败就触发） |
| Directions：具体命题、找反例、修复或定稿 | `cogentic_open_round` 的 `kind`：`claim` / `counterexample` / `repair` / `finalize` | 引擎 |
| 给 prover 分配方向，但不规定方法 | `roles/prover.md`："You are assigned a direction, not a method" | 提示词 |
| Summarizer：每个 prover 一份简报，彼此独立，挑出最有信息量的尝试，长文档只给路径 | `roles/summarizer.md` → `cogentic_submit_briefing` | 引擎规定：没有简报就不能提交稿件 |
| Provers 并行、互不相通；prover 本身是一个 Antigravity agent | 每个名额一个 swarm worker，模型按 `prover` 列表轮换 | 引擎（每个名额只能交一份稿件）+ 提示词（不得阅读同轮其他人的稿件） |
| 每份稿件单独过一个 verifier | `roles/solo-verifier.md` → `cogentic_submit_solo_verdict` | 引擎 |
| 另有一个 verifier 把整轮稿件放在一起读，找共同盲点、比较强弱 | `roles/cross-verifier.md` → `cogentic_submit_cross_verdict`（必须覆盖每一份稿件，并给出 `shared_blind_spots` 和 `ranking`） | 引擎 |
| **两个 verifier 都通过才算接受** | `cogentic_close_round` 只接受 solo 和 cross 都判 `pass` 的稿件 | 引擎（有测试覆盖） |
| 对抗式审查：每一步在被论证之前都当作错的，每条引用在被核对之前都当作错的 | 两个 verifier 的提示词；`pass` 只允许附带 `minor` 级别的意见，`fail` 必须写明意见 | 引擎 + 提示词 |
| Record：按目标汇总每次尝试，记下所用方法和导致失败的意见 | `record.jsonl` 和 `cogentic_read_record`（按方向汇总） | 引擎 |
| Ledger：verifier 确认过的片段 → auditor 改写成自包含引理 → 单独复核 → 后续轮次可以直接引用 | `cogentic_propose_lemmas`（状态为 pending）→ `cogentic_lemma_verdict`（verified / rejected）；`depends_on` 只能指向已验证的引理 | 引擎：每轮都必须审计；pending 引理没处理完就不能开下一轮 |
| Ledger 也记录死路（例如被已验证反例排除的界） | `cogentic_mark_excluded`：必须给出已验证引理或已接受稿件作证据；被排除的方向不能重开 | 引擎 |
| Process advisor：每轮结束时通读整次运行的验证日志，调整 prover 和 verifier 的指令，给出名额分配建议；**不得发表数学意见** | `roles/process-advisor.md` → `cogentic_set_instructions`，生成 `instructions.md`，同时保存每个版本 | 引擎：advisor 没跑完就不能开下一轮 |
| 每轮的产物供后续轮次使用 | 每轮都有 `rounds/r<n>/`、record、ledger 和 instructions | 引擎 |
| 有候选通过验证后，仍可以继续探索还有希望的方向，直到这些方向穷尽 | 技能第 6 节：只能依据题目明确提出的要求，不能依据 orchestrator 自己的判断 | 提示词 |
| 收尾：comparator → formal writer → 最终审计 | `cogentic_select_best` → `cogentic_submit_manuscript` → `cogentic_submit_audit`；审计不通过就退回 writer 重写，最多 3 次 | 引擎 |
| 产出一份自包含的文稿 | `final/manuscript.md`（每个版本另存为 `manuscript-v*.md`） | 提示词 + 最终审计 |
| 预算为 O(100)–O(1000) 次模型调用 | 每启动一个 agent 就 `cogentic_charge` 一次；`budget_calls` 默认 400；超出预算不能再开新轮 | 引擎 |
| 基础模型为 Gemini 3.1 Pro 或早期版 Gemini 4 Argon，整次运行只用一个模型 | `faithful` 预设：所有角色用 Argon High。默认的 `balanced` 预设按角色分配不同的 Gemini 4 型号（见 MODELS.md） | 引擎只放行 Gemini 4 |

## 为什么用 swarm

Antigravity 自带 swarm（1.5.5 起的预览功能）：coordinator 用 `swarm{action:"add"}` 添加 worker，
每个 worker 有独立的会话，可以单独指定模型，大家通过共享看板协作。swarm 自带一套界面，包括 Board、Members、Graph，
以及由 narrator 维护的 Overview。Cogentic 的 orchestrator 正好对应 swarm 的 coordinator，所以这套界面原样复用，
不需要另写 UI。

状态不放在看板上，而是放在 `cogentic` MCP 服务里（`mcp/engine.cjs`）。原因有三点：

1. 论文的不变量（双重验证、ledger 准入、死路必须有证据、轮次顺序）要靠代码保证，不能靠模型自觉遵守；
2. 每个 swarm 成员都是独立会话，状态必须落在共享磁盘上，通过目录锁保证并发安全；
3. 看板是公开的，只用来发"`[done]` 一行"这类通知，避免 prover 互相看到对方的内容，破坏独立性。

MCP 服务不依赖任何第三方包，用 Antigravity 自带的 `agy-node` 运行（官方 science 插件也是这么做的），
所以安装插件时不用另外装任何东西，各平台都能跑。

## Workflow 模式

如果当前环境没有 swarm 工具，就退回到 `run_workflow`：由脚本写定步骤顺序，智能体负责所有判断。
`run_workflow` 只能选择模型档位（tier），所以这个模式下所有 agent 都继承当前会话的模型，
要求用户把会话切到 Gemini 4。脚本每一步都会先检查状态，已完成的就跳过，中断后可以从原处接着跑。

## 已知的不确定性

- 在 `/cogentic` 技能里直接调用 swarm 工具，是否需要先用 `/swarm` 进入 swarm 模式？agy 1.5.13 的更新日志写着
  "the swarm skill is no longer offered to the agent"，但工具本身是否还暴露给普通会话，没有说明。技能里两种情况都处理了：
  没有 swarm 工具就改走 workflow 模式，或者提示用户用 `/swarm` 开场。
- 插件里 MCP 工具的名字在 agy 中是否会被加上命名空间前缀？目前文档没有说清楚。工具名本身都带 `cogentic_` 前缀，
  模型按描述找工具，所以不受影响。workflow 脚本的 `call_tool` 如果按名字找不到工具，会自动改用 clerk agent 代为调用。
- 开发机所在地区无法调用 agy（`User location is not supported`），所以只做了静态校验、引擎单元测试和 workflow 模拟，
  **没有跑过端到端的真实运行**。
