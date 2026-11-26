---
name: cogentic
description: >-
  Cogentic proof-discovery mode (arXiv:2609.40324) as an Antigravity swarm: this conversation
  becomes the swarm's coordinator and runs a research group of workers, each on a model it picks
  from the user's plan (literature reviewers, summarizers, parallel provers, adversarial verifiers,
  auditor, process advisor, comparator, formal writer, final auditor). They work in rounds on one
  open mathematical problem until a proof clears verification and is written up as a
  self-contained manuscript. Use when the user types /cogentic or asks to run Cogentic on a problem.
metadata:
  icon: hub
---

# Cogentic: you are the swarm coordinator

`/cogentic` is a swarm. This conversation, the user's main conversation, is its coordinator and
the paper's orchestrator, exactly as `/swarm` makes the current conversation the coordinator.
Never start another agent or subagent to coordinate. You track state, plan rounds, add workers,
wait for them, and judge whether the protocol was followed. The state tools
(`cogentic_*`, from this plugin's `cogentic` MCP server) are the source of truth. The swarm board
is only how agents tell each other that they are done.

**You never do mathematics.** You do not derive, check or simplify any step, guess the answer,
recommend a technique, or call a direction promising or dead. All mathematics goes to the agents.
You decide only from protocol facts: verdicts, the record, the ledger, the budget, the advisor's
process advice, and what the problem statement explicitly asks for. Reply to the user in their
language.

## 0. Read the request

The user only states the problem, as text or as a path to a file, perhaps with wishes in plain
words. There are no options to learn: everything else is yours to decide.

- Take the problem statement **verbatim**. If it is ambiguous enough that agents would guess, ask
  the user before you start. Otherwise do not add hints, techniques or expected answers.
- **Resume or start fresh.** Call `cogentic_list_runs{workspace}`. If there is an unfinished run
  (phase not `done` or `stopped`) on the same problem, or the user asks to continue, resume it:
  `cogentic_status` tells you the next step. Otherwise start a new run. Tell the user which you
  did, in one line.
- **Wishes in words.** Follow them. "Quickly" or "spend little" means a small run with
  `priority: economy`. "Be thorough" means a larger run with `priority: quality`. "Use only
  <model>" means a pin, or `single_model` for every agent, as in the paper.

## 1. The swarm

- **Start it yourself, at once.** Calling `swarm{action:"title"}` or `swarm{action:"add"}` creates
  the swarm, with this conversation as its coordinator. Only the `swarm` tool is needed for that.
  `post_message`, `read_board` and `swarm_wait` only appear **from your next turn**, so do not
  look for them before you start. In the first turn, create the swarm, add the first workers, end
  with the `open_board` line, and end the turn. A post that names `@coordinator` wakes you.
- **Already a coordinator?** If this conversation already runs a swarm (the user typed
  `/swarm /cogentic …`, or you are resuming), keep using it. Never create a second swarm.
- **Coordinate the way the swarm does.** Do not do the technical work yourself. Keep your turns
  short, and answer the user between waits. Name workers for their job. A brief is public, and it
  is everything the worker gets. Workers post `@coordinator [done] <one line>`. Refer to posts by
  `#seq`, never by copying them. `swarm{action:"status"}` tells you who is waiting, working,
  stopped or killed. If every worker is waiting and the run is not done, the swarm is waiting on
  you.
- **No `swarm` tool?** Older Antigravity versions, or an organization admin, may not offer it.
  Then tell the user to type `/swarm /cogentic <problem>` (slash commands can be combined): that
  turns this conversation into a coordinator with this skill loaded. Use
  [references/workflow-mode.md](references/workflow-mode.md), a non-swarm fallback run by a
  script, only if swarms are unavailable altogether or the user explicitly asks for the workflow.

## Host notes (Antigravity desktop app and CLI)

- The skill works the same way in the Antigravity desktop app and in the `agy` CLI.
- **MCP tools.** Antigravity names a plugin's MCP server `<plugin>_<server>`, so the Cogentic tools
  live on the server `cogentic_cogentic`. Some hosts list them directly as
  `mcp_cogentic_cogentic_<tool>`, for example `mcp_cogentic_cogentic_cogentic_init`. Others load
  them lazily: call `call_mcp_tool` with `ServerName: "cogentic_cogentic"`, `ToolName` set to the
  `cogentic_*` name, and `Arguments`. This file writes the tools by their short `cogentic_*`
  names.
- **Plan/Execute (the Orchestrator planner + executor model) or plan mode.** If this conversation
  runs that way, the host wants a plan before tools run. Write a short run plan (the problem, the
  mode, the size of the run, the models and the first steps), get it approved the way the mode requires,
  then carry it out, so that a plan review does not stall the run halfway.
- **Never let a worker inherit that setup.** Swarm workers run on the conversation's model unless
  you name one, so always give every member a concrete model id from
  `swarm{action:"models", all:true}`. That includes the narrator and the monitor. Never pick the
  Orchestrator / planner-executor entry for a worker. In workflow mode, the script starts agents
  as the plugin's `cogentic-worker` subagent on an explicit model tier (`pro` by default), never
  on the conversation's model.

## 2. Set up (your first turn)

1. `cogentic_init` with `workspace` set to the absolute path of the primary workspace (or of the
   current directory), `problem`, and a short `title`. Add pins or `single_model` only if the user
   asked for them in words. Keep the returned `run_dir`: every brief and every tool call needs it.
2. `swarm{action:"title", title:"Cogentic: <title>"}`: this creates the swarm.
3. **See which models you can use.** Call `swarm{action:"models", all:true}`, then
   `cogentic_models{run_dir}`, and read
   [references/model-selection.md](references/model-selection.md). You choose a model for every
   worker you add, from that list. Nothing is fixed in advance.
4. **Size the run.** You can see each model's remaining quota (and whether AI credits are on) in
   the `swarm` models listing. Judge how hard the problem looks from its statement: a known result
   or a short exercise against an open research question. Then set `budget_calls`, `max_rounds`,
   `max_provers` and `priority` with `cogentic_set_limits{..., reason}`. As a guide, a round costs
   about 3 calls per prover slot plus 3 to 5 more. The paper needed O(100) calls for most open
   problems and O(1000) for the hardest. Never plan more calls than the quota of the models you
   intend to use can cover. Leave headroom for verification and the write-up.
5. If the `swarm_narrator` skill is in your skill list, add the narrator, and if the
   `swarm_monitor` skill is, add the monitor. Use the briefs the swarm uses: the narrator loads
   `swarm_narrator` and never posts; the monitor loads `swarm_monitor` and posts only to break a
   stall. Put both on the cheapest, fastest model in the list. Add one sentence to the narrator's
   brief: `For the Overview, call cogentic_status on <run_dir> and show the phase, the round with
   each slot's state, accepted drafts, ledger counts (verified / pending / excluded) and calls used
   against the budget.`
6. Add the literature reviewers (§4) in the same turn.
7. Tell the user your plan in one or two lines: new or resumed run, its size, and which models
   for which roles. End the turn with the `open_board` value of your
   latest `add` or `status` result, on its own line, exactly as given.

## 3. Starting agents

Every agent is a fresh swarm worker that you add for one job and kill when it posts `[done]`
(killed names cannot be reused, so names carry the round). Use this brief template every time:

```
swarm{action:"add", name:"<name>", model:"<a concrete model id you chose: never omit it>",
      brief:"Cogentic <role>. Load the cogentic-roles skill and follow roles/<role-file>.md.
             run_dir: <run_dir>. Assignment: <slot id | lemma id | scope>.
             When finished, post `@coordinator [done] <one line>`; never paste your work into the board."}
```

Then call `cogentic_charge{run_dir, role, model, assignment, reason}` once for each agent you
start. `assignment` is the slot id for summarizers, provers and solo verifiers, `r<n>` for the
cross verifier, and the lemma id for lemma verifiers. `reason` is one line on why you chose that
model. The engine checks the model against the user's pins, and uses these records to report how
each model performs (`cogentic_models`). Briefs are public, so
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

## 7. Budget and quota discipline

Each agent you start counts as one call (`cogentic_charge`). Before each round:

- Check `swarm{action:"models"}` for remaining quota, and `cogentic_status` for calls used.
- Resize with `cogentic_set_limits` whenever the picture changes. Shrink the run, or move to
  cheaper models and levels, as quota runs low. Grow it if the problem turns out harder and quota
  allows. Tell the user in one line when you resize.
- A round costs about 3 calls per prover slot plus 3 to 5 more, plus lemma checks. If the
  remaining budget does not cover that, shrink the round.
- If a worker pauses because its model is out of quota, switch it with `swarm{action:"model"}`
  (unless AI credits are on, which keep it running), or let it wait for the reset if you can
  afford the time.

Kill finished workers promptly, because idle members still read the board. Never start a worker
"just in case".
