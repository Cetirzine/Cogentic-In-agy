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
| 基础模型为 Gemini 3.1 Pro 或早期版 Gemini 4 Argon，整次运行只用一个模型 | 默认由 orchestrator 从订阅提供的模型列表里，按角色为每个智能体挑选模型（见 MODELS.md）；`--single-model` 可以复现"整次运行只用一个模型"的设定 | 不限制模型；引擎记录每个智能体用的模型，统计各模型的表现，并保证用户用 `--pin` 指定的模型生效 |

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
请用户把会话切到列表里最强的模型之一。脚本每一步都会先检查状态，已完成的就跳过，中断后可以从原处接着跑。

## 桌面版实测结果（2026-11-26，另一台机器）

在只装了 Antigravity 桌面版、没有 `agy` CLI 的机器上测出以下几点，已经据此修复：

- 插件复制到 `~/.gemini/config/plugins/cogentic` 后，桌面版约 15 秒自动热加载。两个技能都被识别；MCP 服务被命名为 `cogentic_cogentic`，23 个工具全部就绪；`cogentic_init` 和 `cogentic_status` 实际调用成功。MCP 启动时的工作目录是插件根目录，所以 `mcp_config.json` 里的相对路径可以正常解析。
- 原来的 `install.sh` 硬性要求 `agy` CLI。**已修复**：没有 CLI 时改为复制安装（加 `--copy` 参数可以强制走这条路），先在临时目录准备好再整体替换，并且不会覆盖别的插件。
- 主对话开着 Plan/Execute 模式时，workflow 用 `type_name="self"` 启动的子 agent 继承了计划审批钩子，所有工具调用和 `finish` 都被拦截，导致死锁。第二轮实测又发现：第一版 `cogentic-worker` 写的是 `subagent: false`，`run_workflow` 解析不到它（报 `not found or not allowed to be invoked`），于是悄悄退回 `self`，再次死锁。按官方文档（/docs/subagents、/docs/build-plugins、/docs/dynamic-workflows、/docs/mcp）**全部修复**：
  - `agents/cogentic-worker.md`：改为 `subagent: true`、`mainAgent: false`；只保留文档里有的字段（去掉了没有文档的 `hidden`）；`tools` 只用官方文档列出的或 Google 自带 agent 实际用过的工具名（文档写明：工具名写错或未映射，subagent 可能会卡住）；加上 `call_mcp_tool`，用来调用懒加载的插件 MCP 工具；`model: pro`。
  - workflow 每个 agent 都显式指定模型档位，默认 `pro`，不可用时依次退到 `flash`、`flash_lite`。**不再**用 `inherit` 继承对话的模型，因为在 Orchestrator（规划 + 执行）模型下，继承会把计划审批一起带进子 agent。
  - **不再静默退回 `self`**：解析不到 worker 就停下并给出诊断；只有显式传 `allow_self_fallback` 才退回 `self`。
  - 熔断与超时：agent 报错、超时（默认 90 分钟），或者完成了却没有记录产出，都计为失败；连续 3 次失败就停下并给出诊断，不再空转烧额度。开局时 orchestrator 失败，不会再继续启动文献检索。
  - swarm 模式下的同类问题：官方文档说 worker 不指定模型时会继承对话的模型，所以技能现在要求每个成员（包括 narrator 和 monitor）都写明具体的模型 id，并且永远不选 Orchestrator 这个规划 + 执行条目。
  - 新增 `tests/plugin.test.cjs`：按官方格式静态检查插件清单、agent 的 frontmatter（字段、工具名、枚举值、`subagent`）、技能、链接和 MCP 配置，防止以后再出同类错误。
- 第三轮实测：worker 已经能被正确解析，快速失败机制也生效了（4 秒内报错并停下），但 `tools` 里的 `call_mcp_tool` 不在 agy 的组件注册表里（`unknown component: tool "call_mcp_tool" not found in registry`）。原因是官方文档虽然提到了这个名字，但它并不能写进 `tools`；插件的 MCP 工具是通过 `inheritMcp` 注入给 agent 的。**已修复**：
  - 用新写的 `scripts/check-agent-tools.sh` 实测了注册表：agy 在调用模型之前就会先解析 agent 的组件，所以不消耗额度，地区不受支持的机器上也能跑。随便编的名字和 `call_mcp_tool` 都会报 not found；`view_file`、`list_dir`、`grep_search`、`find_by_name`、`write_to_file`、`replace_file_content`、`multi_replace_file_content`、`run_command`、`command_status`、`send_command_input`、`search_web`、`read_url_content`、`read_file`、`edit_file`、`write_file`、`manage_task`、`finish`、`send_message`、`invoke_subagent`、`define_subagent`、`ask_question` 全部能解析。
  - worker 的 `tools` 改成只用实测能解析的名字，去掉了 `call_mcp_tool`；也去掉了 `finish`，因为 `run_workflow` 会自己注入它。完整的 worker 定义（含 `model: pro`、`commandExecutionPolicy: auto`）整体实测解析通过。
  - 静态测试的白名单改为这份实测结果，并且明确禁止写 `call_mcp_tool` 和 `finish`。
- 引擎返回的错误现在都带 `[cogentic]` 标记。workflow 脚本据此区分两种情况：带标记的是真正的协议错误，照常抛出；其他报错一律当作 `call_tool` 在当前宿主里够不到这些工具（比如工具名被加了命名空间），之后统一改由 clerk agent 代为调用。

## 已知的不确定性

- 在 `/cogentic` 技能里能不能直接调用 swarm 工具，还是必须先用 `/swarm` 进入 swarm 模式？技能里两种情况都处理了：没有 swarm 工具就改走 workflow 模式，或者提示用户用 `/swarm` 开场。
- 修复后的 `cogentic-worker`（`subagent: true` + 显式 `pro` 档位）在 Plan/Execute 对话里能否完整跑通，还要在桌面版上实测。如果宿主仍然把计划审批带给子 agent，熔断会在 3 次失败内停下并给出诊断，不会空转。
- swarm 模式和 workflow 模式都还没有完整跑完一次端到端的真实运行。
