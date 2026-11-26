# Cogentic-In-agy

<p align="center">
  <a href="https://arxiv.org/abs/2609.40324"><img src="https://img.shields.io/badge/arXiv-2609.40324-B31B1B?logo=arxiv&logoColor=white" alt="arXiv"></a>
  <img src="https://img.shields.io/badge/Antigravity_CLI-1.5.9+-4285F4?logo=google&logoColor=white" alt="Antigravity CLI 1.5.9+">
  <img src="https://img.shields.io/badge/models-chosen_by_the_orchestrator-8E75B2?logo=googlegemini&logoColor=white" alt="Models chosen by the orchestrator">
  <img src="https://img.shields.io/badge/runtime-agy--node,_zero_deps-339933?logo=nodedotjs&logoColor=white" alt="agy-node, zero dependencies">
  <a href="https://github.com/Cetirzine/Cogentic-In-agy/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/Cetirzine/Cogentic-In-agy/ci.yml?logo=github&label=tests" alt="Tests"></a>
  <a href="https://github.com/Cetirzine/Cogentic-In-agy/stargazers"><img src="https://img.shields.io/github/stars/Cetirzine/Cogentic-In-agy?logo=github" alt="Stars"></a>
</p>

[English](README.en.md) · 论文：[arXiv:2609.40324](https://arxiv.org/abs/2609.40324)

这是论文 [Cogentic: Multi-Agent Orchestration for Automated Proof Discovery](https://arxiv.org/abs/2609.40324)（arXiv:2609.40324）的 **Antigravity CLI（`agy`）插件版复现**。
在 agy 里输入 `/cogentic <问题>`，当前会话就会成为一个证明发现小组的 orchestrator。它带着一群智能体，按论文第 2 节的流程一轮一轮地推进：
文献检索 → 每个 prover 一份独立简报 → 多个 prover 并行写证明 → 单份审查和整轮交叉审查（两边都通过才算接受）→ auditor 把已确认的片段整理成引理，单独复核后写进 ledger → process advisor 调整下一轮的指令。
有证明通过验证后，依次经过 comparator、formal writer 和最终审计，最后产出一份可以交给领域专家阅读的自包含文稿。

界面直接复用 agy 原生 **swarm** 的看板（Board / Members / Graph / Overview）。用的是你 Google AI 订阅（任意档位）里的 Antigravity 额度，不需要 API key。每个智能体用哪个模型，由 orchestrator 根据你的订阅当前提供的模型列表自行判断，见下文"模型怎么选"。

> 论文作者没有公开代码和提示词。本仓库的提示词和状态机都是按论文描述独立实现的，逐项对照见 [docs/DESIGN.md](docs/DESIGN.md)。

## 安装

支持 **Antigravity 桌面版**和 **Antigravity CLI（`agy`）**，装一个就行，登录同一个 Google 账号即可。CLI 下 swarm 需要 1.5.5 及以上版本，`run_workflow` 需要 1.5.9 及以上版本。

```bash
git clone git@github.com:Cetirzine/Cogentic-In-agy.git
```

```bash
cd Cogentic-In-agy && ./scripts/install.sh
```

Windows 上用 PowerShell 运行 `scripts\install.ps1`。

安装脚本会自动判断用哪种方式：

- **装了 `agy` CLI**：先执行 `agy plugin validate`，再执行 `agy plugin install`。装完需要重启 agy。
- **只装了桌面版**（或者加上 `--copy` / `-Copy` 参数）：把插件复制到 `~/.gemini/config/plugins/cogentic`。脚本会先在旁边的临时目录里准备好，再整体替换旧版本，并且会先确认这个目录里原来装的确实是 Cogentic，不会覆盖别的插件。复制完桌面版几秒内就会自动加载，不用重启。之后可以在桌面版的 Customizations 页面里查看、停用或卸载它。

### 桌面版使用注意

- 在对话里输入 `/cogentic <问题>` 即可。如果提示当前对话没有 swarm 工具，就新开一个对话，先输入 `/swarm`，再说"用 cogentic 技能解决：<问题>"，或者改用 `--mode workflow`。
- 对话开着 **Plan/Execute（规划 + 执行双模型）模式**时，orchestrator 会先给出运行计划，等你批准后再开跑。workflow 模式启动的子智能体用的是插件自带的 `cogentic-worker` 子 agent，并且固定用 `pro` 档模型，不继承对话的规划 + 执行模型；万一仍然被卡住，连续 3 次失败后会自动停下，并告诉你原因，不会空转消耗额度。

## 使用

```text
/cogentic 证明或否定：……（把问题完整写清楚，不要加提示）
/cogentic --priority economy --rounds 3 <问题>       # 偏省额度
/cogentic --single-model gemini-4-carbon-high <问题>  # 所有智能体用同一个模型，和论文设定一致
/cogentic --pin final_auditor=gemini-4-carbon-high <问题>  # 指定某个角色用某个模型
/cogentic --resume                     # 接着跑这个工作区里最近一次运行
```

| 参数 | 默认值 | 说明 |
|---|---|---|
| `--priority` | `balanced` | orchestrator 选模型时偏向哪一边：`quality` 精度优先，`economy` 额度优先 |
| `--pin` | 无 | `<角色>=<模型>`，强制某个角色用指定模型，可以写多次 |
| `--single-model` | 无 | 所有智能体用同一个模型 |
| `--rounds` | 8 | 最多跑几轮 |
| `--provers` | 6 | 每轮最多几个 prover |
| `--budget` | 400 | 一次运行最多启动多少个智能体（论文的规模是 O(100)–O(1000)） |
| `--mode` | `swarm` | 没有 swarm 工具的环境会自动退回到 `workflow` 模式 |

如果 `/cogentic` 提示当前会话里没有 swarm 工具，可以用 `/swarm` 开场，然后说"用 cogentic 技能解决：<问题>"，或者直接改用 workflow 模式。

## 运行产物

每次运行都保存在 `<工作区>/.cogentic/<run_id>/` 下，全是纯文本文件，可以直接用 git 管理：

```
problem.md            原题，逐字保存
literature/           文献综述笔记
rounds/r<n>/          每轮的简报、稿件，以及 solo / cross 审查意见
record.jsonl          全部尝试记录：用了什么方法、每份审查意见、因何失败
ledger.json, ledger/  已验证的引理，以及被排除的方向（每条都附证据）
instructions.md       process advisor 维护的常驻指令（每个版本另存在 instructions/ 下）
final/manuscript.md   最终文稿（每版另存为 manuscript-v*.md，审计结果另存为 audit-v*.json）
log.jsonl             事件日志
```

## 模型怎么选

代码里不写死任何模型。swarm 启动时，orchestrator 先查看你的订阅提供哪些模型，之后每启动一个智能体，都自己判断该用哪个模型，综合考虑精度、效率和额度：prover、verifier、最终审计这些容易出大错的角色用推理更深的模型；summarizer、narrator 这类低风险的角色用更快更省的模型。同一轮的 prover 分到不同模型上，verifier 尽量不和它审查的 prover 用同一个模型。从第二轮起，还会参考各模型在本次运行里的实际表现来调整。

Google 发布新模型（包括以后的 Gemini 5）时，只要它出现在模型列表里，orchestrator 就能直接选用。需要的话可以更新 [models/catalog.json](models/catalog.json) 里的知识卡片，但这不是必须的。详见 [docs/MODELS.md](docs/MODELS.md)。

## 开发

```bash
node --test tests/engine.test.cjs tests/install.test.cjs tests/plugin.test.cjs
```

```bash
python3 -I tests/workflow_sim.py
```

```bash
agy plugin validate . --strict
```

```bash
./scripts/check-agent-tools.sh   # 用 agy 的工具注册表逐个检查 agents/*.md 里的工具名（不消耗额度）
```

- `mcp/engine.cjs`：状态机，论文的不变量都由它保证
- `mcp/cogentic.cjs`：MCP stdio 服务和 CLI，用 `agy-node` 运行，不依赖任何第三方包
- `skills/cogentic/`：`/cogentic` 入口，即 orchestrator 的规程，另附 workflow 后备脚本
- `skills/cogentic-roles/`：11 个角色的提示词

## 现状与限制

- 状态引擎、MCP 协议和 workflow 脚本都有测试：引擎单元测试，加上把 workflow 脚本接到真实引擎上做的模拟运行。**还没有用真实的 agy swarm 跑过端到端。** 开发机所在地区调用不了 agy，所以第一次真实运行需要你在自己的环境里跑。如果遇到问题，`cogentic_status` 和 `log.jsonl` 会显示卡在哪一步。
- swarm 是 agy 的预览功能，接口以后可能会变。
- 和论文一样，产出的证明都必须经过领域专家核对。

## 致谢

- 方法：Cai、Gupta、Jiang、Liaw、Mehta、Velegkas、Wang，[Cogentic: Multi-Agent Orchestration for Automated Proof Discovery](https://arxiv.org/abs/2609.40324)（CC BY-NC-SA 4.0）
- 平台：[Antigravity CLI](https://antigravity.google/docs/cli) 的插件、swarm、`run_workflow` 与 `agy-node`
- 姊妹项目：[SieveSci](https://github.com/Cetirzine/SieveSci)

本仓库与论文作者、Google 均无关联。

## Star History

<a href="https://star-history.com/#Cetirzine/Cogentic-In-agy&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=Cetirzine/Cogentic-In-agy&type=Date&theme=dark">
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=Cetirzine/Cogentic-In-agy&type=Date">
  </picture>
</a>

Cogentic 产出的证明和文稿都需要研究者自己核对，跑完不等于证完。
