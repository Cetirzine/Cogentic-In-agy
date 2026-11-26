# Cogentic-In-agy

<p align="center">
  <a href="https://arxiv.org/abs/2609.40324"><img src="https://img.shields.io/badge/arXiv-2609.40324-B31B1B?logo=arxiv&logoColor=white" alt="arXiv"></a>
  <img src="https://img.shields.io/badge/Antigravity_CLI-1.5.9+-4285F4?logo=google&logoColor=white" alt="Antigravity CLI 1.5.9+">
  <img src="https://img.shields.io/badge/models-Gemini_4_only-8E75B2?logo=googlegemini&logoColor=white" alt="Gemini 4 only">
  <img src="https://img.shields.io/badge/runtime-agy--node,_zero_deps-339933?logo=nodedotjs&logoColor=white" alt="agy-node, zero dependencies">
  <a href="https://github.com/Cetirzine/Cogentic-In-agy/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/Cetirzine/Cogentic-In-agy/ci.yml?logo=github&label=tests" alt="Tests"></a>
  <a href="https://github.com/Cetirzine/Cogentic-In-agy/stargazers"><img src="https://img.shields.io/github/stars/Cetirzine/Cogentic-In-agy?logo=github" alt="Stars"></a>
</p>

[English](README.en.md) · 论文：[arXiv:2609.40324](https://arxiv.org/abs/2609.40324)

这是论文 [Cogentic: Multi-Agent Orchestration for Automated Proof Discovery](https://arxiv.org/abs/2609.40324)（arXiv:2609.40324）的 **Antigravity CLI（`agy`）插件版复现**。
在 agy 里输入 `/cogentic <问题>`，当前会话就会成为一个证明发现小组的 orchestrator。它带着一群 Gemini 4 智能体，按论文第 2 节的流程一轮一轮地推进：
文献检索 → 每个 prover 一份独立简报 → 多个 prover 并行写证明 → 单份审查和整轮交叉审查（两边都通过才算接受）→ auditor 把已确认的片段整理成引理，单独复核后写进 ledger → process advisor 调整下一轮的指令。
有证明通过验证后，依次经过 comparator、formal writer 和最终审计，最后产出一份可以交给领域专家阅读的自包含文稿。

界面直接复用 agy 原生 **swarm** 的看板（Board / Members / Graph / Overview）。用的是你 Google AI 订阅（任意档位）里的 Antigravity 额度，不需要 API key，**只使用 Gemini 4 系列模型**。各档位能用哪些 Gemini 4 型号以 `agy models` 的输出为准；某个预设模型在你的档位上不可用时，orchestrator 会换成同系列最接近的可用档位，并告诉你。

> 论文作者没有公开代码和提示词。本仓库的提示词和状态机都是按论文描述独立实现的，逐项对照见 [docs/DESIGN.md](docs/DESIGN.md)。

## 安装

需要 Antigravity CLI（`agy`）并已登录。swarm 需要 1.5.5 及以上版本，`run_workflow` 需要 1.5.9 及以上版本。

```bash
git clone git@github.com:Cetirzine/Cogentic-In-agy.git
```

```bash
cd Cogentic-In-agy && ./scripts/install.sh
```

Windows 上用 PowerShell 运行 `scripts\install.ps1`。安装脚本会先执行 `agy plugin validate`，再执行 `agy plugin install`。装完需要重启 agy。

## 使用

```text
/cogentic 证明或否定：……（把问题完整写清楚，不要加提示）
/cogentic --preset faithful <问题>     # 所有角色都用 Gemini 4 Argon High，和论文设定一致
/cogentic --preset economy --rounds 3 <问题>
/cogentic --resume                     # 接着跑这个工作区里最近一次运行
```

| 参数 | 默认值 | 说明 |
|---|---|---|
| `--preset` | `balanced` | 角色到模型的映射，可选 `balanced` / `faithful` / `economy` / `max`，见 [docs/MODELS.md](docs/MODELS.md) |
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

## 角色与模型（默认 `balanced` 预设）

| 角色 | 模型 |
|---|---|
| orchestrator | Gemini 4 Neon (Medium) |
| 文献检索 / summarizer / advisor | Gemini 4 Argon (Medium) |
| prover | Gemini 4 Carbon (High) 和 Neon (High) 交替 |
| solo verifier / 最终审计 | Gemini 4 Carbon (High) |
| cross verifier / comparator | Gemini 4 Neon (High) |
| auditor / formal writer | Gemini 4 Argon (High) |
| 引理复核 | Gemini 4 Carbon (Medium) |
| narrator / monitor | Gemini 4 Hydrogen (Low) |

每个角色为什么这样选、依据哪些评测，见 [docs/MODELS.md](docs/MODELS.md)。

## 开发

```bash
node --test tests/engine.test.cjs
```

```bash
python3 -I tests/workflow_sim.py
```

```bash
agy plugin validate . --strict
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
