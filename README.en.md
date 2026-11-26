# Cogentic-In-agy

<p align="center">
  <a href="https://arxiv.org/abs/2609.40324"><img src="https://img.shields.io/badge/arXiv-2609.40324-B31B1B?logo=arxiv&logoColor=white" alt="arXiv"></a>
  <img src="https://img.shields.io/badge/Antigravity_CLI-1.5.9+-4285F4?logo=google&logoColor=white" alt="Antigravity CLI 1.5.9+">
  <img src="https://img.shields.io/badge/models-chosen_by_the_orchestrator-8E75B2?logo=googlegemini&logoColor=white" alt="Models chosen by the orchestrator">
  <img src="https://img.shields.io/badge/runtime-agy--node,_zero_deps-339933?logo=nodedotjs&logoColor=white" alt="agy-node, zero dependencies">
  <a href="https://github.com/Cetirzine/Cogentic-In-agy/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/Cetirzine/Cogentic-In-agy/ci.yml?logo=github&label=tests" alt="Tests"></a>
  <a href="https://github.com/Cetirzine/Cogentic-In-agy/stargazers"><img src="https://img.shields.io/github/stars/Cetirzine/Cogentic-In-agy?logo=github" alt="Stars"></a>
</p>

[简体中文](README.md) · Paper: [arXiv:2609.40324](https://arxiv.org/abs/2609.40324)

An Antigravity CLI (`agy`) plugin that reproduces [Cogentic: Multi-Agent Orchestration for
Automated Proof Discovery](https://arxiv.org/abs/2609.40324) (arXiv:2609.40324). Type
`/cogentic <problem>` and the conversation becomes the orchestrator of a group of agents
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
quota of your Google AI plan (any tier, no API key needed). Nothing about models is hard-coded.
When the swarm starts, the orchestrator looks at the models your plan offers. For every agent it
starts, it then picks a model, balancing accuracy, speed and quota: deeper models for provers,
verifiers and the final audit, faster ones for summaries and narration. It diversifies the provers
of a round, puts verifiers on a model different from the prover they check, and adapts from round
2 on to each model's results in the run. New Google models (Gemini 5 and later included) are usable
as soon as they appear in the list. See [docs/MODELS.md](docs/MODELS.md).

> The paper's code and prompts are not public. All prompts and the state machine here are an
> independent implementation of the paper's description. [docs/DESIGN.md](docs/DESIGN.md) maps
> each component to the paper.

## Install

Works in the **Antigravity desktop app** and in the **Antigravity CLI (`agy`)**: either one,
signed in. In the CLI, swarm mode needs agy 1.5.5 or later and `run_workflow` needs 1.5.9 or later.

```bash
git clone git@github.com:Cetirzine/Cogentic-In-agy.git
```

```bash
cd Cogentic-In-agy && ./scripts/install.sh
```

On Windows, run `scripts\install.ps1`.

The installer picks the method by itself:

- **With the `agy` CLI:** it runs `agy plugin validate`, then `agy plugin install`. Restart agy
  afterwards.
- **With only the desktop app** (or with `--copy` / `-Copy`): it copies the plugin into
  `~/.gemini/config/plugins/cogentic`. It stages the copy next to that folder and swaps it in
  whole, and it never replaces a folder that holds a different plugin. The desktop app loads the
  plugin within seconds, with no restart. Manage it on the app's Customizations page.

`/cogentic <problem>` is itself a swarm: the current conversation becomes its coordinator, as with
`/swarm`, and no extra agent is started to coordinate. If your Antigravity version or organization
does not offer the swarm tools, type `/swarm /cogentic <problem>` (slash commands combine).
In **Plan/Execute** (planner + executor) conversations, the orchestrator first
asks you to approve a run plan. Workflow agents run as the plugin's `cogentic-worker` subagent on an
explicit `pro` tier, never on the conversation's planner + executor model. If they are blocked
anyway, the run halts after 3 consecutive failures and says why, instead of spinning.

## Use

```text
/cogentic Prove or disprove: <the full problem statement, without hints>
/cogentic --priority economy <problem>                  # spare the quota
/cogentic --single-model gemini-4-carbon-high <problem>  # one model for every agent, as in the paper
/cogentic --resume
```

Flags: `--priority quality|balanced|economy`, `--pin <role>=<model>`, `--single-model <model>`,
`--rounds` (default 8), `--provers` (maximum prover slots per round, default 6), `--budget`
(maximum number of agents per run, default 400), and `--mode swarm|workflow`.

Each run is stored as plain files in `<workspace>/.cogentic/<run_id>/`: the problem, literature
notes, per-round briefings, drafts and verdicts, `record.jsonl`, the verified ledger, the process
advisor's instructions, and `final/manuscript.md`.

## Development

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
./scripts/check-agent-tools.sh   # check agents/*.md tool names against agy's registry (no quota used)
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
