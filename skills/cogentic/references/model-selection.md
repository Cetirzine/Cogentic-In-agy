# Choosing a model for each agent

Nothing is hard-coded. For every agent you start, you choose the model, from the list that
`swarm{action:"models", all:true}` shows you. That list is whatever the user's Google AI plan
offers today, so it changes as Google ships and retires models. Re-check it at the start of each
round, or whenever an `add` fails on a model.

## Inputs

- **The list** (`swarm{action:"models", all:true}`): what you can choose from.
- **`cogentic_models{run_dir}`** gives you:
  - `priority`: `quality`, `balanced` or `economy`. It is your choice, set with `cogentic_set_limits`
    unless the user said what they want;
  - `pins` and `single_model`: the user's explicit choices, which always win;
  - `catalog`: model cards for known families, what each role needs, and selection principles.
    It is advice, not rules;
  - `outcomes_by_model`: how each model has done **in this run**, for example drafts
    accepted/rejected per prover model, and the times a verifier model missed an error the other
    verifier caught;
  - the budget used and remaining.

## How to decide

1. Take each role's needs from `catalog.roles`. Provers, verifiers and the final auditor need
   depth and strictness. Summarizers, the process advisor, the narrator and the monitor need
   economy. The writer needs long output and faithfulness. The literature reviewer needs exact
   citations and speed.
2. Match the needs to `catalog.families` and to the thinking levels on offer. Use the lowest level
   the role's difficulty needs. `priority` moves you up (`quality`) or down (`economy`).
3. Prefer the newest strong generation in the list. Avoid models older than Gemini 4, and models
   that the catalog notes as being retired.
4. **Diversify.** Put the provers of a round on different models or levels, so they do not share
   blind spots. Run each solo verifier on a different model from its draft's prover. Run the cross
   verifier on a model different from most of the round's provers.
5. **Adapt on evidence**, from round 2 on, using `outcomes_by_model`:
   - a prover model whose drafts keep failing on substantive objections: escalate its level or
     switch the model;
   - a verifier model that missed errors the other verifier caught: replace it in that role;
   - a cheap model that keeps doing a low-stakes role well: keep it there.
6. **Budget and quota.** As the budget runs down, move low-stakes roles to cheaper models before
   you cut prover slots. If a worker pauses because its model is out of quota, switch it with
   `swarm{action:"model", name, model}` to the next suitable model, and record the switch with
   `cogentic_charge{..., calls: 1, reason: "quota switch"}`.
7. **New models** (in the list but without a catalog card): try them first on low-stakes roles or
   as one prover among several, compare outcomes, then promote them.

Write a one-line `reason` in every `cogentic_charge` call, for example `"prover: deepest model,
slot r2-d1-p1 is a repair of a near-miss; neon-high on p2 for diversity"`. Tell the user your
model plan in one line when the run starts, and again whenever you change it.
