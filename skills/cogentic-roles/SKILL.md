---
name: cogentic-roles
description: >-
  Role instructions for members of a Cogentic proof-discovery swarm or workflow (literature
  reviewer, summarizer, prover, solo verifier, cross verifier, auditor, lemma verifier, process
  advisor, comparator, formal writer, final auditor). Load only when your brief says
  "Cogentic <role>"; the orchestrator itself uses the cogentic skill instead.
---

# Cogentic roles

Your brief names your role, a `run_dir` and your assignment. Read your role file and follow it:

| Role | File |
|---|---|
| literature reviewer | [roles/literature-reviewer.md](roles/literature-reviewer.md) |
| summarizer | [roles/summarizer.md](roles/summarizer.md) |
| prover | [roles/prover.md](roles/prover.md) |
| solo verifier | [roles/solo-verifier.md](roles/solo-verifier.md) |
| cross verifier | [roles/cross-verifier.md](roles/cross-verifier.md) |
| auditor | [roles/auditor.md](roles/auditor.md) |
| lemma verifier | [roles/lemma-verifier.md](roles/lemma-verifier.md) |
| process advisor | [roles/process-advisor.md](roles/process-advisor.md) |
| comparator | [roles/comparator.md](roles/comparator.md) |
| formal writer | [roles/formal-writer.md](roles/formal-writer.md) |
| final auditor | [roles/final-auditor.md](roles/final-auditor.md) |

## Rules for every role

- **The run directory is shared memory.** `<run_dir>/problem.md` holds the problem.
  `literature/` holds the survey. `ledger.json` and `ledger/L*.md` hold verified lemmas and
  excluded claims. `record.jsonl` holds every past attempt with its verdicts (use
  `cogentic_read_record`). `instructions.md` holds the process advisor's standing instructions.
  `rounds/r<n>/` holds briefings, drafts and verdicts. Open what you need, by path. Do not ask
  for it to be pasted to you.
- **Record your output only through your role's `cogentic_*` tool.** Its error messages are
  protocol rules. Read them and fix your call; do not work around them. The tools belong to the
  plugin's MCP server `cogentic_cogentic`. Call one directly if it is in your tool list (for
  example `mcp_cogentic_cogentic_cogentic_submit_draft`). Otherwise use `call_mcp_tool` with
  `ServerName: "cogentic_cogentic"`, `ToolName` (for example `cogentic_submit_draft`) and
  `Arguments`.
- **Never wait for approval.** Nobody can answer you during a run. Do not write an implementation
  plan for review. If a tool is blocked, finish your turn at once and say why in one line, instead
  of retrying it.
- **The board is for one line only.** When you are done, post `@coordinator [done] <one line>` and
  nothing more. Never paste mathematics into the board. Do not read other members' work unless
  your role file tells you to.
- **Write mathematics in Markdown with LaTeX** (`$…$`, `$$…$$`). State every definition you use.
- **Honesty beats completion.** A clearly labelled partial result or a "fail" verdict with a
  precise objection is worth more than a confident gap.
- **The ledger may be cited without proof.** Only lemmas whose status is `verified` count;
  cite them by id (`L3`). Pending or rejected lemmas are not results.
- **Respect the standing instructions** in `instructions.md` for your role.
- You may run code (Python, a CAS, numerical experiments) to explore or to sanity-check. A
  computation supports a proof but never replaces one, unless it is an exact, reproducible
  verification of a finite statement, and then you include the code.
