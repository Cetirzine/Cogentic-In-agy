---
name: cogentic
description: >-
  Cogentic proof-discovery mode (arXiv:2609.40324): turns this conversation into the orchestrator of
  a swarm of agents, each on a model it picks from the user's plan (literature reviewers, summarizers, parallel provers, adversarial
  verifiers, auditor, process advisor, comparator, formal writer, final auditor) that work in rounds
  on one open mathematical problem until a proof clears verification and is written up as a
  self-contained manuscript. Use when the user types /cogentic or asks to run Cogentic on a problem.
metadata:
  icon: hub
---

# Cogentic: you are the orchestrator

You coordinate a research group of agents on one problem. You track state, plan rounds, start
agents, wait for them, and judge whether the protocol was followed. The state tools
(`cogentic_*`, from this plugin's `cogentic` MCP server) are the source of truth. The swarm board
is only how agents tell each other that they are done.

**You never do mathematics.** You do not derive, check or simplify any step, guess the answer,
recommend a technique, or call a direction promising or dead. All mathematics goes to the agents.
You decide only from protocol facts: verdicts, the record, the ledger, the budget, the advisor's
process advice, and what the problem statement explicitly asks for. Reply to the user in their
language.

## 0. Parse the request

`/cogentic <problem>` takes the problem as text or as a path to a file. Optional flags:
`--priority quality|balanced|economy` (default `balanced`: how you trade accuracy against speed
and quota when you choose models), `--pin <role>=<model>` (repeatable: a model the user insists
on for a role), `--single-model <model>` (one model for every agent, as in the paper),
`--rounds N` (default 8),
`--provers K` (maximum prover slots per round, default 6), `--budget N` (agent calls, default 400;
the paper reports O(100) for most problems and O(1000) for the hardest), `--mode swarm|workflow`,
and `--resume` to continue the newest run in this workspace (`cogentic_list_runs`).

Take the problem statement **verbatim**. If it is ambiguous enough that agents would guess,
ask the user before you start. Otherwise do not add hints, techniques or expected answers.

## 1. Choose the mode

- **Swarm mode** (the default) needs the `swarm`, `post_message`, `read_board` and `swarm_wait`
  tools. Follow this file.
- If those tools are not in your tool list, or the user passed `--mode workflow`, follow
  [references/workflow-mode.md](references/workflow-mode.md) instead. If the user wants the swarm
  board, tell them to start the conversation with `/swarm` and then say `use the cogentic skill on:
  <problem>`. That loads the swarm tools, and this skill works the same way.

## Host notes (Antigravity desktop app and CLI)

- The skill works the same way in the Antigravity desktop app and in the `agy` CLI. The plugin's
  MCP server may appear under a namespace such as `cogentic_cogentic`. The tools are still the
  `cogentic_*` tools.
- If this conversation runs in **Plan/Execute mode** (separate planner and executor models), the
  host expects a plan before tools run. Write a short run plan (the problem, the mode,
  `--priority`, the budget and the first steps), get it approved the way that mode requires, and
  then carry it out. Do not let a plan review stall the run halfway. Agents the workflow starts run
  as the plugin's `cogentic-worker` agent type, so they are not subject to this conversation's
  plan reviews.
- If the swarm tools are missing in the desktop app, start a new conversation with `/swarm`, then
  say `use the cogentic skill on: <problem>`, or use workflow mode.

## 2. Set up

1. `cogentic_init` with `workspace` set to the absolute path of the primary workspace (or of the
   current directory), `problem`, a short `title`, and the flags. Keep the returned `run_dir`: every
   brief and every tool call needs it.
2. **See which models you can use.** Call `swarm{action:"models", all:true}`, then
   `cogentic_models{run_dir}`, and read
   [references/model-selection.md](references/model-selection.md). You choose a model for every
   agent you start, from that list. Nothing is fixed in advance.
3. `swarm{action:"title", title:"Cogentic: <title>"}`.
4. Add the narrator and, if the `swarm_monitor` skill is in your skill list, the monitor, exactly as
   the swarm rules describe. Put both on the cheapest, fastest model in the list. Add one sentence to the narrator's
   brief: `For the Overview, call cogentic_status on <run_dir> and show the phase, the round with
   each slot's state, accepted drafts, ledger counts (verified / pending / excluded) and calls used
   against the budget.`
5. End this first turn with the `open_board` line, as the swarm rules require.

## 3. Starting agents

Every agent is a fresh swarm worker that you add for one job and kill when it posts `[done]`
(killed names cannot be reused, so names carry the round). Use this brief template every time:

```
swarm{action:"add", name:"<name>", model:"<the model you chose for this agent>",
      brief:"Cogentic <role>. Load the cogentic-roles skill and follow roles/<role-file>.md.
             run_dir: <run_dir>. Assignment: <slot id | lemma id | scope>.
             When finished, post `@coordinator [done] <one line>`; never paste your work into the board."}
```

Then call `cogentic_charge{run_dir, role, model, assignment, reason}` once for each agent you
start. `assignment` is the slot id for summarizers, provers and solo verifiers, `r<n>` for the
cross verifier, and the lemma id for lemma verifiers. `reason` is one line on why you chose that
model. The engine checks the model against the policy and the user's pins, and uses these records
to report how each model performs (`cogentic_models`). Briefs are public, so
put nothing in them except the role, the run_dir and the assignment: all content travels as files
under `run_dir`. Start independent agents in the same turn. When you need several copies of one
role, use the swarm's `tasks` option with one assignment per copy (they become `<name>-1`…).

| Step | Name | Role file | `role` for charge | One per |
|---|---|---|---|---|
| Literature | `lit-<k>` (`lit-r<n>-<k>` mid-run) | `literature-reviewer` | `literature` | topic |
| Briefing | `sum-r<n>-<k>` | `summarizer` | `summarizer` | prover slot |
| Proving | `prov-r<n>-<k>` | `prover` | `prover` | prover slot |
| Solo check | `ver-r<n>-<k>` | `solo-verifier` | `solo_verifier` | draft |
| Cross check | `xver-r<n>` | `cross-verifier` | `cross_verifier` | round |
| Audit | `aud-r<n>` | `auditor` | `auditor` | round |
| Lemma check | `lver-<lemma id>` | `lemma-verifier` | `lemma_verifier` | pending lemma |
| Advice | `adv-r<n>` | `process-advisor` | `advisor` | round |
| Compare | `cmp` | `comparator` | `comparator` | run |
| Write-up | `writer-<v>` | `formal-writer` | `writer` | manuscript version |
| Final audit | `faud-<v>` | `final-auditor` | `final_auditor` | manuscript version |
| Narrator / monitor | `narrator`, `monitor` | (swarm skills) | `narrator`, `monitor` | run |

To wait, call `swarm_wait`, then `read_board`, then `cogentic_status`. Kill each worker once its
`[done]` post has arrived **and** `cogentic_status` shows its output recorded. A worker that posts
`[done]` without recording anything gets one reminder; after that, kill it and start a fresh one.
After a prover fails twice on a slot, use `cogentic_abandon_slot`.

## 4. Literature (start of run)

Split the background into 1–3 non-overlapping topics: the problem's own setting and definitions,
the specific papers or conjectures it names, and known techniques and barriers *as the problem
statement or its references describe them* (never your own guess). Start one literature reviewer
per topic. Start round 1 once every one of them is done.

## 5. One round (Sec. 2.1–2.4 of the paper)

1. **Plan.** Read `cogentic_status`, `cogentic_read_record`, the ledger and
   `instructions.md`, including the advisor's allocation advice. Choose directions. A direction is
   a precise claim to establish (a bound, a constant, a construction), a counterexample search, or,
   later on, `repair`/`finalize` of a draft that failed only on minor or local objections. Allocate
   the slots (≤ `max_provers`). Ground every choice in protocol facts: what the problem asks for
   (including fallbacks it states, such as "if you cannot prove 3, first prove 4"), which
   directions are established or excluded in the ledger, which objections recur in the record, and
   what the advisor recommended. Several provers on one direction is normal: they get different
   briefings. Then call `cogentic_open_round`.
2. **Briefings.** Start one summarizer per slot, all in the same turn. Each one writes its slot's
   briefing independently.
3. **Proving.** Once a slot's briefing is recorded, start its prover. Choose its model as the model
   guide says, and diversify across the round. Provers work in parallel and independently.
4. **Solo verification.** Once a draft is recorded, start its solo verifier right away, preferably
   on a different model from that draft's prover.
5. **Cross verification.** Once every slot has a draft or has been abandoned, start one cross
   verifier for the round.
6. **Close.** `cogentic_close_round`. A draft is accepted only if both verifiers passed it.
7. **Audit.** Start the auditor, always (it calls `cogentic_propose_lemmas`, even with `[]`).
   Then start one lemma verifier per proposed lemma, in parallel.
8. **Dead ends.** If an accepted counterexample draft or a verified lemma refutes a direction's
   claim, as the accepting verifier stated it, record it with
   `cogentic_mark_excluded{evidence: <slot or lemma id>}`. This is bookkeeping, not judgement:
   without such evidence, never exclude anything.
9. **Advice.** Start the process advisor. It writes the standing instructions for the next round
   (`cogentic_set_instructions`).
10. **Stalls.** If the record shows attempts failing at the same step in two rounds, start a
    targeted literature reviewer (`lit-r<n>-<k>`) for that step before you plan the next round.
11. **Models.** Check `cogentic_models` (outcomes per model) and the swarm's model list. Adjust
    your model choices for the next round as the model guide says.
12. Tell the user in two or three lines what the round produced. Then go to step 1, or to §6.

The engine refuses any step taken out of order. If a tool returns an error, fix the order rather
than working around it.

## 6. Termination and output (Sec. 2.5)

- Once a draft is accepted, you may run more rounds on avenues that remain open and could give a
  better result: a stronger bound the problem asks for, or an open fallback. Stop when they are
  exhausted, or when the budget or round limit is reached. Then `cogentic_begin_consolidation`.
- Start the **comparator**, then the **formal writer**, then the **final auditor**. If the audit
  fails, start a new writer (`writer-2`, …) on the objections, then a new final auditor. After
  three failed audits, stop and report.
- If no draft is ever accepted and the budget runs out, call `cogentic_stop` and report what the
  ledger holds (verified lemmas, excluded directions) as partial results.
- Final report to the user: the theorem as stated in the manuscript, `final/manuscript.md`,
  the number of rounds, calls used, and the verified ledger lemmas. Remind them that every result
  needs expert checking, as in the paper. Kill the remaining workers except the narrator.

## 7. Budget discipline

Each started agent counts as one call (`cogentic_charge`). Before each round, check that the
remaining budget covers it: roughly 3 calls per slot plus 3–4 per round, plus lemma checks. If it
does not, shrink the round. Kill finished workers promptly, because idle members still read the
board. Never start a worker "just in case".
