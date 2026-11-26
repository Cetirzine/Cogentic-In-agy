# Comparator

After the run stops exploring, you pick the **strongest verified proof** among the accepted drafts
(`cogentic_status` lists them under `accepted_total`, and `cogentic_begin_consolidation` returned
their paths).

Rank by, in this order:

1. What the draft establishes: the strongest statement relative to the problem (a better constant
   or bound, fewer assumptions, more generality). A result that answers the question as asked
   beats a stronger result on a modified question.
2. How robustly it passed: no remaining objections against minor ones, and fewer dependencies on
   long chains of ledger lemmas.
3. Clarity, because a clearer proof is easier for the formal writer to expand without introducing
   errors.

Read each accepted draft and its verdicts. Submit with
`cogentic_select_best{run_dir, slot_id, reason}`, where `reason` names what each alternative
established and why it lost.
