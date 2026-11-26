# Cogentic-In-agy

<p align="center">
  <a href="https://arxiv.org/abs/2609.40324"><img src="https://img.shields.io/badge/arXiv-2609.40324-B31B1B?logo=arxiv&logoColor=white" alt="arXiv"></a>
  <img src="https://img.shields.io/badge/Antigravity_CLI-1.5.9+-4285F4?logo=google&logoColor=white" alt="Antigravity CLI 1.5.9+">
  <img src="https://img.shields.io/badge/models-Gemini_4_only-8E75B2?logo=googlegemini&logoColor=white" alt="Gemini 4 only">
  <img src="https://img.shields.io/badge/runtime-agy--node,_zero_deps-339933?logo=nodedotjs&logoColor=white" alt="agy-node, zero dependencies">
  <a href="https://github.com/Cetirzine/Cogentic-In-agy/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/Cetirzine/Cogentic-In-agy/ci.yml?logo=github&label=tests" alt="Tests"></a>
  <a href="https://github.com/Cetirzine/Cogentic-In-agy/stargazers"><img src="https://img.shields.io/github/stars/Cetirzine/Cogentic-In-agy?logo=github" alt="Stars"></a>
</p>

[简体中文](README.md) · Paper: [arXiv:2609.40324](https://arxiv.org/abs/2609.40324)

An Antigravity CLI (`agy`) plugin that reproduces [Cogentic: Multi-Agent Orchestration for
Automated Proof Discovery](https://arxiv.org/abs/2609.40324) (arXiv:2609.40324). Type
`/cogentic <problem>` and the conversation becomes the orchestrator of a group of Gemini 4 agents
that follows Section 2 of the paper round by round:

1. literature review;
2. one independent briefing per prover;
3. parallel provers;
4. a solo verifier per draft and a cross verifier per round (a draft is accepted only if it passes
   both);
5. an auditor that restates confirmed fragments as lemmas, which an isolated verifier checks
   before they enter the ledger;
6. a process advisor that adjusts the next round's instructions.

Once a proof clears verification, a comparator, a formal writer and a final audit turn it into a
self-contained manuscript.

The UI is agy's native **swarm** (Board, Members, Graph, Overview). Runs spend the Antigravity
quota of your Google AI plan (any tier, no API key needed) and use **only the Gemini 4 family**.
`agy models` shows which Gemini 4 models your plan offers. If a preset model is not on your plan,
the orchestrator substitutes the nearest available model of the same family and tells you.

> The paper's code and prompts are not public. All prompts and the state machine here are an
> independent implementation of the paper's description. [docs/DESIGN.md](docs/DESIGN.md) maps
> each component to the paper.

## Install

You need Antigravity CLI, signed in. Swarm mode needs agy 1.5.5 or later, and `run_workflow` needs
1.5.9 or later.

```bash
git clone git@github.com:Cetirzine/Cogentic-In-agy.git
```

```bash
cd Cogentic-In-agy && ./scripts/install.sh
```

On Windows, run `scripts\install.ps1`. Restart agy afterwards.

## Use

```text
/cogentic Prove or disprove: <the full problem statement, without hints>
/cogentic --preset faithful <problem>      # every agent on Gemini 4 Argon High, as in the paper
/cogentic --resume
```

Flags: `--preset balanced|faithful|economy|max` (see [docs/MODELS.md](docs/MODELS.md)),
`--rounds` (default 8), `--provers` (maximum prover slots per round, default 6), `--budget`
(maximum number of agents per run, default 400), and `--mode swarm|workflow`.

Each run is stored as plain files in `<workspace>/.cogentic/<run_id>/`: the problem, literature
notes, per-round briefings, drafts and verdicts, `record.jsonl`, the verified ledger, the process
advisor's instructions, and `final/manuscript.md`.

## Development

```bash
node --test tests/engine.test.cjs
```

```bash
python3 -I tests/workflow_sim.py
```

```bash
agy plugin validate . --strict
```

## Status

The engine, the MCP protocol and the workflow script are tested: engine unit tests plus a
simulated run of the workflow script against the real engine. **The plugin has not yet been run
end-to-end on a live agy swarm**, because the development machine's region cannot reach the agy
API. As in the paper, every proof the system produces needs checking by experts.

## Acknowledgements

- Method: Cai, Gupta, Jiang, Liaw, Mehta, Velegkas and Wang, [Cogentic: Multi-Agent Orchestration
  for Automated Proof Discovery](https://arxiv.org/abs/2609.40324) (CC BY-NC-SA 4.0).
- Platform: [Antigravity CLI](https://antigravity.google/docs/cli) plugins, swarm,
  `run_workflow` and `agy-node`.
- Sister project: [SieveSci](https://github.com/Cetirzine/SieveSci).

Not affiliated with the paper's authors or with Google.

## Star History

<a href="https://star-history.com/#Cetirzine/Cogentic-In-agy&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=Cetirzine/Cogentic-In-agy&type=Date&theme=dark">
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=Cetirzine/Cogentic-In-agy&type=Date">
  </picture>
</a>

Every proof and manuscript Cogentic produces must be checked by the researcher: a finished run is
not a finished proof.
