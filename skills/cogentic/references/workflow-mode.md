# Workflow mode (fallback)

Use workflow mode when the swarm tools (`swarm`, `post_message`, `read_board`, `swarm_wait`) are
not available, or when the user asked for `--mode workflow`. It runs the same protocol through
Antigravity's built-in `run_workflow` engine. Each agent appears as a card in the workflow step,
in place of the swarm board.

**Models.** Workflow agents can only choose a model tier, so every agent inherits this
conversation's model, and you cannot choose models per role. Check the conversation's model
against [model-selection.md](model-selection.md): it should be one of the strongest models in the
`/model` list. If it is not, suggest a switch to the user. Tell the user in one line that per-role
model choice is only available in swarm mode.

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
   next to it, under the plugin's `skills/` folder.
4. The workflow runs in the background, and you are notified when it ends. In the meantime you can
   answer the user from `cogentic_status`.
5. When it ends, report as in §6 of the main skill. If it failed partway, `cogentic_status` shows
   where it stopped. The state is intact, so start the workflow again with the same `run_dir`:
   the script continues from the current phase.
