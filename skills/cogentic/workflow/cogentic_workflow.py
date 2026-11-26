# Cogentic as an Antigravity `run_workflow` script: the fallback when the swarm tools are unavailable.
#
# The script enforces the order of the protocol in code; the cogentic MCP engine enforces its
# invariants; agents do all judgement. Run it with:
#   run_workflow(ScriptPath="<this file>", Description="Cogentic: <title>",
#                Args={"run_dir": "<from cogentic_init>", "roles_dir": "<abs path of cogentic-roles/roles>"})
#
# Optional Args:
#   model_tier            "pro" (default), "flash", "flash_lite" or "inherit". run_workflow agents can only pick a
#                         tier. "inherit" takes the conversation's model, which, under the Orchestrator
#                         (planner + executor) model, also brings its plan reviews into every agent, so it is
#                         never used unless asked for. An unavailable tier falls back to the next one.
#   agent_type            custom agent for every agent (default "cogentic-worker", a subagent this plugin ships).
#   allow_self_fallback   true to run agents as "self" if the host cannot resolve agent_type. Off by default:
#                         "self" inherits the conversation's configuration, plan reviews included.
#   agent_timeout_s       per-agent time limit (default 5400; clerk agents get 600).
#   max_consecutive_failures  halt the run after this many agent failures in a row (default 3).
#   max_audits            final-audit attempts (default 3).

import json
import os

RUN = args["run_dir"]


def _find_roles_dir():
    """The cogentic-roles/roles folder: from Args, else the standard install places (CLI and desktop app)."""
    if args.get("roles_dir"):
        return args["roles_dir"]
    home = os.path.expanduser("~")
    for base in (os.environ.get("COGENTIC_PLUGINS_DIR", ""), os.path.join(home, ".gemini", "config", "plugins")):
        if not base:
            continue
        cand = os.path.join(base, "cogentic", "skills", "cogentic-roles", "roles")
        if os.path.isdir(cand):
            return cand
    for ws in WORKSPACES if "WORKSPACES" in globals() else ():
        for dot in (".agents", ".agent", "_agents", "_agent"):
            cand = os.path.join(ws, dot, "plugins", "cogentic", "skills", "cogentic-roles", "roles")
            if os.path.isdir(cand):
                return cand
    return ""


ROLES_DIR = _find_roles_dir()
# <plugin_dir>/skills/cogentic-roles/roles -> <plugin_dir>
PLUGIN_DIR = os.path.dirname(os.path.dirname(os.path.dirname(ROLES_DIR))) if ROLES_DIR else ""
CLI = os.path.join(PLUGIN_DIR, "mcp", "cogentic.cjs") if PLUGIN_DIR else "<plugin_dir>/mcp/cogentic.cjs"
MAX_AUDITS = int(args.get("max_audits", 3))
TIMEOUT = float(args.get("agent_timeout_s", 5400))
MAX_FAILS = int(args.get("max_consecutive_failures", 3))
DONE = {"type": "string"}
ENGINE_ERROR = "[cogentic]"  # marks protocol errors raised by the engine itself
SERVER = "cogentic_cogentic"  # the plugin's MCP server, namespaced as <plugin>_<server>

_tiers = []
for t in (args.get("model_tier", "pro"), "pro", "flash", "flash_lite"):
    if t not in _tiers:
        _tiers.append(t)
_cfg = {"type": args.get("agent_type", "cogentic-worker"), "tier": 0, "direct": True, "fails": 0}
_pending_charges = []


class WorkflowHalted(Exception):
    """Stops the whole workflow with a diagnosis instead of letting agents spin."""


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
        f"Cogentic {role}. Read and follow {role_path(role_file)} (from the cogentic-roles skill).\n"
        f"run_dir: {RUN}\nplugin_dir: {PLUGIN_DIR}\nAssignment: {assignment}\n"
        f"Record your output with your role's cogentic_* tool (MCP server {SERVER}): directly, via call_mcp_tool, or via "
        f"the engine CLI, all equally official: write the arguments to a JSON file, then run "
        f"agy-node \"{CLI}\" cli <tool> --file <args.json> (node if agy-node is missing). "
        "Then call finish with a one-line summary. Work without asking for approval; if something blocks you, "
        "call finish at once and say why."
    )


def _msg(e):
    return str(getattr(e, "message", e)).lower()


def _type_unresolved(e):
    m = _msg(e)
    return "agent" in m and any(w in m for w in ("not found", "not allowed", "unknown", "no such", "failed to resolve"))


def _tier_unavailable(e):
    m = _msg(e)
    return ("tier" in m or "model" in m) and any(w in m for w in ("not available", "unavailable", "valid choices", "invalid", "not allowed"))


async def _with_timeout(awaitable, seconds):
    try:
        import asyncio
        return await asyncio.wait_for(awaitable, seconds)
    except ImportError:
        return await awaitable


async def spawn(prompt, schema, role, timeout=None):
    """One agent on the configured custom type and model tier, adapting once per kind of host limitation."""
    while True:
        tier = _tiers[_cfg["tier"]]
        try:
            return await _with_timeout(
                agent(prompt, schema=schema, role=role, type_name=_cfg["type"], model=tier), timeout or TIMEOUT)
        except Exception as e:
            if _type_unresolved(e) and _cfg["type"] != "self":
                if not args.get("allow_self_fallback"):
                    raise WorkflowHalted(
                        f"The host cannot run agent type {_cfg['type']!r} ({e}). Reinstall the Cogentic plugin "
                        "(its agents/cogentic-worker.md must be loaded), or rerun with Args allow_self_fallback=true "
                        "in a conversation that is not on the Orchestrator (planner + executor) model.")
                log(f"agent type {_cfg['type']} unavailable ({e}); using self as allowed")
                _cfg["type"] = "self"
                continue
            if _tier_unavailable(e) and _cfg["tier"] + 1 < len(_tiers):
                log(f"model tier {tier} unavailable ({e}); trying {_tiers[_cfg['tier'] + 1]}")
                _cfg["tier"] += 1
                continue
            raise


def _failed(title, why):
    _cfg["fails"] += 1
    log(f"{title}: {why} ({_cfg['fails']} failure(s) in a row)")
    if _cfg["fails"] >= MAX_FAILS:
        raise WorkflowHalted(
            f"{_cfg['fails']} agents in a row failed; last: {title}: {why}. The run state is intact: check "
            "cogentic_status and the agents' transcripts, fix the cause (model tier, plan reviews, tool access), "
            "then start the workflow again with the same run_dir to resume.")


def _ok():
    _cfg["fails"] = 0


async def tool(name, **kw):
    """Call a cogentic MCP tool: directly when call_tool can reach it, else through a one-step clerk agent."""
    if _cfg["direct"]:
        try:
            out = await call_tool(name, **kw)
            return json.loads(out) if out.strip().startswith("{") else out
        except NameError:
            _cfg["direct"] = False
        except Exception as e:
            if ENGINE_ERROR in str(getattr(e, "message", e)):
                raise  # a real protocol error from the engine
            log(f"call_tool cannot reach {name} here ({e}); using clerk agents")
            _cfg["direct"] = False
    try:
        res = await spawn(
            f"Call the cogentic tool `{name}` of MCP server {SERVER} (directly, via call_mcp_tool, or via the engine CLI: "
            f"agy-node \"{CLI}\" cli {name} --file <a JSON file holding the arguments>) "
            f"with exactly these arguments and nothing else:\n{json.dumps(kw)}\n"
            "Then call finish with the tool's output verbatim (or 'ERROR: <message>' if it failed).",
            DONE, f"clerk: {name}", timeout=600)
    except WorkflowHalted:
        raise
    except Exception as e:
        _failed(f"clerk {name}", e)
        raise RuntimeError(f"clerk for {name} failed: {e}")
    _ok()
    if res.startswith("ERROR:"):
        raise RuntimeError(res)
    try:
        return json.loads(res)
    except Exception:
        return res


async def charge(role, calls=1):
    if _cfg["direct"]:
        try:
            await call_tool("cogentic_charge", run_dir=RUN, role=role, calls=calls)
            return
        except NameError:
            _cfg["direct"] = False
        except Exception as e:
            if ENGINE_ERROR in str(getattr(e, "message", e)):
                raise
            _cfg["direct"] = False
    _pending_charges.append((role, calls))


async def run_agent(role, role_file, assignment, title, recorded=None):
    """One role agent. `recorded()` says whether it left its output in the run state; if not, it failed."""
    await charge(role)
    try:
        out = await spawn(brief(role, role_file, assignment), DONE, title)
    except WorkflowHalted:
        raise
    except Exception as e:  # one failed agent must not cancel its siblings in parallel()
        _failed(title, e)
        return None
    if recorded is not None and not recorded():
        _failed(title, f"finished without recording its output ({out!r})")
        return None
    _ok()
    return out


PLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "action": {"type": "string", "enum": ["opened", "literature", "consolidate", "stop"]},
        "literature_topics": {"type": "array", "items": {"type": "string"}},
        "reason": {"type": "string"},
    },
    "required": ["action", "reason"],
}


async def plan(note):
    pending = ""
    if _pending_charges:
        total = sum(c for _, c in _pending_charges)
        pending = f"\nFirst call cogentic_charge{{run_dir, role:'workflow', calls:{total}}} for agents already started."
        _pending_charges.clear()
    await charge("orchestrator")
    prompt = brief("orchestrator (workflow mode)", "orchestrator", note) + pending
    for attempt in range(2):
        try:
            out = await spawn(prompt, PLAN_SCHEMA, "Orchestrator")
            _ok()
            return out
        except WorkflowHalted:
            raise
        except Exception as e:
            _failed(f"Orchestrator (attempt {attempt + 1})", e)
    return {"action": "stop", "reason": "the orchestrator agent failed twice"}


def _lit_count():
    return len([f for f in os.listdir(os.path.join(RUN, "literature")) if f.endswith(".md")])


async def literature(topics, tag):
    topics = [t for t in topics if t]
    before = _lit_count()
    await parallel(list(enumerate(topics)), lambda it: run_agent(
        "literature reviewer", "literature-reviewer", f"topic: {it[1]}", f"Literature {tag}-{it[0] + 1}"))
    return _lit_count() > before


def _slot(sid):
    return next(s for s in state()["rounds"][-1]["slots"] if s["id"] == sid)


async def slot_pipeline(slot):
    """summarizer -> prover -> solo verifier for one slot, skipping steps already recorded."""
    sid = slot["id"]
    if not _slot(sid)["briefing"]:
        await run_agent("summarizer", "summarizer", f"slot {sid}", f"Summarizer {sid}", lambda: _slot(sid)["briefing"])
        if not _slot(sid)["briefing"]:
            return
    if not _slot(sid)["draft"]:
        await run_agent("prover", "prover", f"slot {sid}", f"Prover {sid}", lambda: _slot(sid)["draft"])
        if not _slot(sid)["draft"]:
            return
    if not _slot(sid)["solo"]:
        await run_agent("solo verifier", "solo-verifier", f"slot {sid}", f"Verifier {sid}", lambda: _slot(sid)["solo"])


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
                sid = s["id"]
                await run_agent("solo verifier", "solo-verifier", f"slot {sid}", f"Verifier {sid} (retry)", lambda: _slot(sid)["solo"])
        for s in state()["rounds"][-1]["slots"]:
            if not s["draft"] and not s.get("abandoned"):
                await tool("cogentic_abandon_slot", run_dir=RUN, slot_id=s["id"], reason="no draft after its prover ran (workflow mode)")
        unverified = [s["id"] for s in state()["rounds"][-1]["slots"] if s["draft"] and not s["solo"]]
        if unverified:
            raise WorkflowHalted(f"no solo verdict for {', '.join(unverified)} after a retry; the round cannot close")
        r = state()["rounds"][-1]
        if any(s["draft"] for s in r["slots"]) and not r["cross"]:
            for attempt in range(2):
                await run_agent("cross verifier", "cross-verifier", f"round {n}", f"Cross verifier r{n}" + (" (retry)" if attempt else ""),
                                lambda: state()["rounds"][-1]["cross"])
                if state()["rounds"][-1]["cross"]:
                    break
            if not state()["rounds"][-1]["cross"]:
                raise WorkflowHalted(f"no cross verdict for round {n} after a retry; the round cannot close")
        closed = await tool("cogentic_close_round", run_dir=RUN)
        if isinstance(closed, dict):
            log(f"round {n} accepted: {[a['slot_id'] for a in closed.get('accepted', [])]}")
    if not state()["rounds"][-1]["audit_done"]:
        await run_agent("auditor", "auditor", f"round {n}", f"Auditor r{n}", lambda: state()["rounds"][-1]["audit_done"])
        if not state()["rounds"][-1]["audit_done"]:
            await tool("cogentic_propose_lemmas", run_dir=RUN, lemmas=[])
    pending = [l["id"] for l in ledger()["lemmas"] if l["status"] == "pending" and l["round"] == n]

    def lemma_done(lid):
        return lambda: next(l for l in ledger()["lemmas"] if l["id"] == lid)["status"] != "pending"

    await parallel(pending, lambda lid: run_agent("lemma verifier", "lemma-verifier", f"lemma {lid}", f"Lemma verifier {lid}", lemma_done(lid)))
    still = [l["id"] for l in ledger()["lemmas"] if l["status"] == "pending" and l["round"] == n]
    for lid in still:  # a lemma nobody managed to verify is not a result
        await tool("cogentic_lemma_verdict", run_dir=RUN, lemma_id=lid, verdict="fail",
                   objections=[{"issue": "no isolated verifier produced a verdict", "severity": "major"}])
    if state()["instructions_version"] < n:
        await run_agent("process advisor", "process-advisor", f"round {n}", f"Process advisor r{n}", lambda: state()["instructions_version"] >= n)
        if state()["instructions_version"] < n:
            await tool("cogentic_set_instructions", run_dir=RUN, observations=["process advisor produced no output this round"])


async def run():
    st = state()
    if st["phase"] == "literature" and _lit_count() == 0:
        phase("Literature")
        p = await plan("Start of run: choose 1-3 literature topics (action 'literature'). Do not open a round yet.")
        if p["action"] == "stop":
            raise WorkflowHalted(f"the orchestrator stopped the run before it started: {p.get('reason')}")
        topics = p.get("literature_topics") or ["the problem's setting, definitions and the papers it names"]
        if not await literature(topics, "start"):
            raise WorkflowHalted("no literature reviewer recorded a note; the run cannot start")

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
        return {"result": "no verified proof", "ledger": RUN + "/ledger.json"}
    if st["phase"] != "done":
        if st["phase"] == "rounds":
            await tool("cogentic_begin_consolidation", run_dir=RUN)
        for attempt in range(2):
            if not state()["final"]["choice"]:
                await run_agent("comparator", "comparator", "choose the strongest accepted proof", "Comparator",
                                lambda: state()["final"]["choice"])
        if not state()["final"]["choice"]:
            raise WorkflowHalted("the comparator did not choose a proof after a retry")
        while state()["phase"] == "consolidation" and len(state()["final"]["audits"]) < MAX_AUDITS:
            fin = state()["final"]
            audited = fin["audits"] and fin["manuscript"] and fin["audits"][-1]["version"] == fin["manuscript"]["version"]
            v = (fin["manuscript"]["version"] if fin["manuscript"] else 0) + (1 if (not fin["manuscript"] or audited) else 0)
            if not fin["manuscript"] or audited:
                await run_agent("formal writer", "formal-writer", f"manuscript version {v}", f"Formal writer v{v}",
                                lambda: (state()["final"]["manuscript"] or {}).get("version") == v)
                if (state()["final"]["manuscript"] or {}).get("version") != v:
                    raise WorkflowHalted(f"formal writer v{v} produced no manuscript")
            before = len(fin["audits"])
            await run_agent("final auditor", "final-auditor", f"manuscript version {v}", f"Final auditor v{v}",
                            lambda: len(state()["final"]["audits"]) > before)
            if len(state()["final"]["audits"]) == before:
                raise WorkflowHalted(f"final auditor v{v} produced no verdict")
    st = state()
    return {"phase": st["phase"], "manuscript": RUN + "/final/manuscript.md", "rounds": len(st["rounds"]), "calls_used": st["calls_used"]}


try:
    result = await run()
except WorkflowHalted as e:
    log(f"HALTED: {e}")
    result = {"halted": str(e), "run_dir": RUN, "next": "cogentic_status shows where the run stopped; rerun with the same run_dir to resume"}
finally:
    if _pending_charges:  # charges the script could not record directly: settle them in one call
        try:
            await tool("cogentic_charge", run_dir=RUN, role="workflow", calls=sum(c for _, c in _pending_charges))
            _pending_charges.clear()
        except Exception as e:
            log(f"could not settle {len(_pending_charges)} pending charges: {e}")
print(json.dumps(result))
