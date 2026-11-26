# Cogentic as an Antigravity `run_workflow` script: the fallback when the swarm tools are unavailable.
#
# The script enforces the order of the protocol in code; the cogentic MCP engine enforces its
# invariants; agents do all judgement. Run it with:
#   run_workflow(ScriptPath="<this file>", Description="Cogentic: <title>",
#                Args={"run_dir": "<from cogentic_init>", "roles_dir": "<abs path of cogentic-roles/roles>"})
# Workflow agents can only pick a model tier, so every agent inherits the conversation's model:
# start the conversation on one of the strongest models in /model (per-role model choice needs swarm mode).

import json
import os

RUN = args["run_dir"]
ROLES_DIR = args.get("roles_dir", "")
MAX_AUDITS = int(args.get("max_audits", 3))
DONE = {"type": "string"}
_pending_charges = []


def state():
    with open(os.path.join(RUN, "state.json"), encoding="utf-8") as f:
        return json.load(f)


def ledger():
    with open(os.path.join(RUN, "ledger.json"), encoding="utf-8") as f:
        return json.load(f)


def role_path(name):
    return os.path.join(ROLES_DIR, name + ".md") if ROLES_DIR else "roles/" + name + ".md"


def brief(role, role_file, assignment):
    return (
        f"Cogentic {role}. Load the cogentic-roles skill and follow {role_path(role_file)}.\n"
        f"run_dir: {RUN}\nAssignment: {assignment}\n"
        "Record your output with your role's cogentic_* tool, then call finish with a one-line summary."
    )


async def tool(name, **kw):
    """Call a cogentic MCP tool: directly when call_tool can reach it, else through a one-step clerk agent."""
    try:
        out = await call_tool(name, **kw)
        return json.loads(out) if out.strip().startswith("{") else out
    except NameError:
        pass
    except Exception as e:  # ToolError: a protocol error is real, a missing/denied tool falls back
        if not getattr(e, "denied", False) and "not" not in str(getattr(e, "message", e)).lower():
            raise
    res = await agent(
        f"Call the MCP tool `{name}` with exactly these arguments and nothing else:\n{json.dumps(kw)}\n"
        "Then call finish with the tool's output verbatim (or 'ERROR: <message>' if it failed).",
        schema=DONE, role=f"clerk: {name}", model="inherit")
    if res.startswith("ERROR:"):
        raise RuntimeError(res)
    try:
        return json.loads(res)
    except Exception:
        return res


async def charge(role, calls=1):
    try:
        await call_tool("cogentic_charge", run_dir=RUN, role=role, calls=calls)
    except Exception:
        _pending_charges.append((role, calls))


async def run_agent(role, role_file, assignment, title):
    await charge(role)
    try:
        return await agent(brief(role, role_file, assignment), schema=DONE, role=title, model="inherit")
    except Exception as e:  # one failed agent must not cancel its siblings in parallel()
        log(f"{title} failed: {e}")
        return None


async def plan(note):
    pending = ""
    if _pending_charges:
        total = sum(c for _, c in _pending_charges)
        pending = f"\nFirst call cogentic_charge{{run_dir, role:'workflow', calls:{total}}} for agents already started."
        _pending_charges.clear()
    await charge("orchestrator")
    return await agent(
        brief("orchestrator (workflow mode)", "orchestrator", note) + pending,
        schema={
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["opened", "literature", "consolidate", "stop"]},
                "literature_topics": {"type": "array", "items": {"type": "string"}},
                "reason": {"type": "string"},
            },
            "required": ["action", "reason"],
        },
        role="Orchestrator", model="inherit")


async def literature(topics, tag):
    await parallel(list(enumerate(topics)), lambda it: run_agent(
        "literature reviewer", "literature-reviewer", f"topic: {it[1]}", f"Literature {tag}-{it[0] + 1}"))


def _slot(sid):
    return next(s for s in state()["rounds"][-1]["slots"] if s["id"] == sid)


async def slot_pipeline(slot):
    """summarizer -> prover -> solo verifier for one slot, skipping steps already recorded."""
    sid = slot["id"]
    if not _slot(sid)["briefing"]:
        await run_agent("summarizer", "summarizer", f"slot {sid}", f"Summarizer {sid}")
        if not _slot(sid)["briefing"]:
            return
    if not _slot(sid)["draft"]:
        await run_agent("prover", "prover", f"slot {sid}", f"Prover {sid}")
        if not _slot(sid)["draft"]:
            return
    if not _slot(sid)["solo"]:
        await run_agent("solo verifier", "solo-verifier", f"slot {sid}", f"Verifier {sid}")


async def complete_round():
    """Every remaining step of the latest round, in protocol order; safe to rerun after an interruption."""
    r = state()["rounds"][-1]
    n = r["n"]
    if r["status"] == "open":
        todo = [s for s in r["slots"] if not s.get("abandoned") and not (s["draft"] and s["solo"])]
        log(f"round {n}: {len(todo)} slot pipelines on {', '.join(sorted({s['direction_id'] for s in todo}))}")
        await parallel(todo, slot_pipeline)
        for s in state()["rounds"][-1]["slots"]:
            if s["draft"] and not s["solo"]:
                await run_agent("solo verifier", "solo-verifier", f"slot {s['id']}", f"Verifier {s['id']} (retry)")
        for s in state()["rounds"][-1]["slots"]:
            if not s["draft"] and not s.get("abandoned"):
                await tool("cogentic_abandon_slot", run_dir=RUN, slot_id=s["id"], reason="no draft after its prover ran (workflow mode)")
        r = state()["rounds"][-1]
        if any(s["draft"] for s in r["slots"]) and not r["cross"]:
            await run_agent("cross verifier", "cross-verifier", f"round {n}", f"Cross verifier r{n}")
            if not state()["rounds"][-1]["cross"]:
                await run_agent("cross verifier", "cross-verifier", f"round {n}", f"Cross verifier r{n} (retry)")
        closed = await tool("cogentic_close_round", run_dir=RUN)
        if isinstance(closed, dict):
            log(f"round {n} accepted: {[a['slot_id'] for a in closed.get('accepted', [])]}")
    if not state()["rounds"][-1]["audit_done"]:
        await run_agent("auditor", "auditor", f"round {n}", f"Auditor r{n}")
        if not state()["rounds"][-1]["audit_done"]:
            await tool("cogentic_propose_lemmas", run_dir=RUN, lemmas=[])
    pending = [l["id"] for l in ledger()["lemmas"] if l["status"] == "pending" and l["round"] == n]
    await parallel(pending, lambda lid: run_agent("lemma verifier", "lemma-verifier", f"lemma {lid}", f"Lemma verifier {lid}"))
    still = [l["id"] for l in ledger()["lemmas"] if l["status"] == "pending" and l["round"] == n]
    for lid in still:  # a lemma nobody managed to verify is not a result
        await tool("cogentic_lemma_verdict", run_dir=RUN, lemma_id=lid, verdict="fail",
                   objections=[{"issue": "no isolated verifier produced a verdict", "severity": "major"}])
    if state()["instructions_version"] < n:
        await run_agent("process advisor", "process-advisor", f"round {n}", f"Process advisor r{n}")
        if state()["instructions_version"] < n:
            await tool("cogentic_set_instructions", run_dir=RUN, observations=["process advisor produced no output this round"])


# ---------------- the run ----------------

st = state()
if st["phase"] == "literature" and not os.listdir(os.path.join(RUN, "literature")):
    phase("Literature")
    p = await plan("Start of run: choose 1-3 literature topics (action 'literature'). Do not open a round yet.")
    await literature(p.get("literature_topics") or ["the problem's setting, definitions and the papers it names"], "start")

while state()["phase"] in ("literature", "rounds"):
    st = state()
    if st["rounds"]:
        phase(f"Round {st['rounds'][-1]['n']}")
        await complete_round()
    n = len(state()["rounds"]) + 1
    phase(f"Plan round {n}")
    p = await plan(f"Plan round {n}: record any evidence-backed exclusions, then open the round with cogentic_open_round (action 'opened'), "
                   "or ask for a targeted literature search first (action 'literature'), or choose 'consolidate' or 'stop'.")
    if p["action"] == "literature":
        await literature(p.get("literature_topics") or [], f"r{n}")
        p = await plan(f"Targeted literature search done. Now open round {n} (action 'opened'), or 'consolidate' / 'stop'.")
    if p["action"] in ("consolidate", "stop"):
        break
    st = state()
    if len(st["rounds"]) < n or st["rounds"][-1]["status"] != "open":
        log(f"orchestrator did not open round {n}: {p.get('reason')}")
        break

phase("Consolidation")
st = state()
if not any(r["accepted"] for r in st["rounds"]):
    if st["phase"] not in ("stopped", "done"):
        await tool("cogentic_stop", run_dir=RUN, reason="no draft cleared verification")
    print(json.dumps({"result": "no verified proof", "ledger": RUN + "/ledger.json"}))
elif st["phase"] != "done":
    if st["phase"] == "rounds":
        await tool("cogentic_begin_consolidation", run_dir=RUN)
    for attempt in range(2):
        if not state()["final"]["choice"]:
            await run_agent("comparator", "comparator", "choose the strongest accepted proof", "Comparator")
    while state()["phase"] == "consolidation" and len(state()["final"]["audits"]) < MAX_AUDITS:
        fin = state()["final"]
        audited = fin["audits"] and fin["manuscript"] and fin["audits"][-1]["version"] == fin["manuscript"]["version"]
        v = (fin["manuscript"]["version"] if fin["manuscript"] else 0) + (1 if (not fin["manuscript"] or audited) else 0)
        if not fin["manuscript"] or audited:
            await run_agent("formal writer", "formal-writer", f"manuscript version {v}", f"Formal writer v{v}")
            if (state()["final"]["manuscript"] or {}).get("version") != v:
                log(f"formal writer v{v} produced no manuscript")
                break
        await run_agent("final auditor", "final-auditor", f"manuscript version {v}", f"Final auditor v{v}")
        if len(state()["final"]["audits"]) == len(fin["audits"]):
            log(f"final auditor v{v} produced no verdict")
            break
    st = state()
if _pending_charges:  # charges the script could not record directly: settle them in one call
    await tool("cogentic_charge", run_dir=RUN, role="workflow", calls=sum(c for _, c in _pending_charges))
    _pending_charges.clear()
    st = state()
if any(r["accepted"] for r in st["rounds"]):
    print(json.dumps({"phase": st["phase"], "manuscript": RUN + "/final/manuscript.md", "rounds": len(st["rounds"]), "calls_used": st["calls_used"]}))
