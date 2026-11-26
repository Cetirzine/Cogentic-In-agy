# Workflow mode (fallback)

Cogentic is a swarm. Use this mode only when swarms are unavailable altogether: no `swarm` tool,
and `/swarm /cogentic <problem>` does not work either (an older version, or an organization admin
turned swarms off). Also use it when the user explicitly asks for the workflow. In this mode,
orchestrator decisions are made by orchestrator agents that the script starts, not by this
conversation, so tell the user it is a fallback. It runs the same protocol through
Antigravity's built-in `run_workflow` engine, in both the desktop app and the `agy` CLI. Each
agent appears as a card in the workflow step, in place of the swarm board.

## How the script starts agents

- **Agent type.** Every agent is the plugin's `cogentic-worker` subagent
  (`agents/cogentic-worker.md`: `subagent: true`). Its tool list holds only documented tool
  names, plus `call_mcp_tool` for the Cogentic MCP tools.
- **Model.** Every agent runs on an explicit `run_workflow` tier: `pro` by default, falling back
  to `flash` and then `flash_lite` if a tier is unavailable. It never inherits the conversation's
  model, because under the Orchestrator (planner + executor) model that would also bring the
  conversation's plan reviews into every agent and block their tools and `finish`. Pass
  `model_tier: "inherit"` only if the user asks for it and the conversation runs on a single
  concrete model.
- **No silent fallback to `self`.** If the host cannot resolve `cogentic-worker`, the run halts
  with a diagnosis. Rerun with `allow_self_fallback: true` only in a conversation that is not
  on the Orchestrator model and not in plan mode.
- **Fail fast.** An agent that errors, times out (`agent_timeout_s`, default 90 minutes), or
  finishes without recording its output counts as a failure. After
  `max_consecutive_failures` failures in a row (default 3), the run halts with a diagnosis
  instead of burning quota. The state stays intact, so a rerun with the same `run_dir` resumes it.

Per-role model choice is only available in swarm mode. Tell the user this in one line.

## Steps

1. Run `cogentic_init` as in swarm mode, with `mode: "workflow"`.
2. Read the `run-workflow` skill if you have not done so in this conversation.
3. Start the workflow:

   ```
   run_workflow(
     ScriptPath = "<absolute path of this skill>/workflow/cogentic_workflow.py",
     Description = "Cogentic: <title>",
     Args = {"run_dir": "<run_dir>",
             "roles_dir": "<absolute path of the cogentic-roles skill>/roles"})
   ```

   This skill's directory is the folder that holds this `SKILL.md`. The `cogentic-roles` skill sits
   next to it, under the plugin's `skills/` folder. A global install puts it at
   `~/.gemini/config/plugins/cogentic/skills/`. If you leave `roles_dir` out, the script looks
   there and in the workspace's `.agents/plugins/`. Further optional Args are documented at the top
   of the script.
4. The workflow runs in the background, and you are notified when it ends. In the meantime you can
   answer the user from `cogentic_status`.
5. When it ends, its output is either the result or `{"halted": <diagnosis>}`. Report the result as
   in §6 of the main skill, or tell the user the diagnosis and what would fix it. The state is
   intact, so rerunning the workflow with the same `run_dir` resumes from the current phase.
