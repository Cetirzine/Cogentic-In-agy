"""Runs skills/cogentic/workflow/cogentic_workflow.py against the real engine with scripted fake agents.

The run_workflow primitives (agent, parallel, phase, log, call_tool) are replaced by fakes; every fake
agent acts by calling the engine through its CLI, the way a real agent would through MCP.
Usage: python3 -I tests/workflow_sim.py   (exit status 0 = all scenarios passed)
"""
import ast
import asyncio
import json
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLI = os.path.join(ROOT, "mcp", "cogentic.cjs")
SCRIPT = os.path.join(ROOT, "skills", "cogentic", "workflow", "cogentic_workflow.py")
NODE = os.environ.get("NODE", "node")


class ToolError(Exception):
    def __init__(self, message):
        super().__init__(message)
        self.message = message
        self.denied = False


def engine(name, **kw):
    p = subprocess.run([NODE, CLI, "cli", name, json.dumps(kw)], capture_output=True, text=True)
    if p.returncode != 0:
        raise ToolError(p.stderr.strip())
    return p.stdout


def new_run(**extra):
    ws = tempfile.mkdtemp(prefix="cogentic-wf-")
    out = json.loads(engine("cogentic_init", workspace=ws, problem="Prove that sqrt(2) is irrational.", title="sqrt2", mode="workflow", **extra))
    return out["run_dir"]


class Crash(BaseException):
    """Kills the whole workflow (like stopping the conversation), unlike an agent failure."""


class World:
    def __init__(self, run, crash_after=None):
        self.run, self.calls, self.crash_after = run, [], crash_after
        self.plans = 0
        self.silent_roles = ()

    def st(self):
        return json.loads(engine("cogentic_status", run_dir=self.run))

    async def act(self, prompt, role):
        self.calls.append(role)
        if self.crash_after and len(self.calls) == self.crash_after:
            raise Crash()
        await asyncio.sleep(0)
        run = self.run
        if role.startswith("clerk: "):
            name = role[len("clerk: "):]
            kw = json.loads(prompt.split("\n")[1])
            try:
                return engine(name, **kw)
            except ToolError as e:
                return "ERROR: " + e.message
        if any(role.startswith(r) for r in self.silent_roles):
            return "done"  # claims success, records nothing
        m = re.search(r"Assignment: (.*)", prompt)
        assignment = m.group(1) if m else ""
        sid = assignment.replace("slot ", "").strip()
        if role == "Orchestrator":
            owed = re.search(r"calls:(\d+)", prompt)
            if owed:
                engine("cogentic_charge", run_dir=run, role="workflow", calls=int(owed.group(1)))
            st = self.st()
            if "Start of run" in prompt:
                return {"action": "literature", "literature_topics": ["definitions", "classical proofs"], "reason": "start"}
            if st["accepted_total"]:
                return {"action": "consolidate", "reason": "accepted draft"}
            engine("cogentic_open_round", run_dir=run, directions=[{"claim": "sqrt(2) is irrational", "provers": 2}])
            return {"action": "opened", "reason": "problem asks for it"}
        if role.startswith("Literature"):
            engine("cogentic_add_literature", run_dir=run, title=assignment, content="notes")
        elif role.startswith("Summarizer"):
            engine("cogentic_submit_briefing", run_dir=run, slot_id=sid, briefing="Try parity.")
        elif role.startswith("Prover"):
            engine("cogentic_submit_draft", run_dir=run, slot_id=sid, target_claim="sqrt(2) is irrational", method="parity", proof="Suppose p/q ...")
        elif role.startswith("Verifier"):
            if sid.endswith("p1"):
                engine("cogentic_submit_solo_verdict", run_dir=run, slot_id=sid, verdict="pass")
            else:
                engine("cogentic_submit_solo_verdict", run_dir=run, slot_id=sid, verdict="fail", objections=["assumes lowest terms without saying so"], confirmed_fragments=["p^2 even implies p even"])
        elif role.startswith("Cross verifier"):
            slots = [s["id"] for s in self.st()["round"]["slots"] if s["draft"]]
            engine("cogentic_submit_cross_verdict", run_dir=run, verdicts=[{"slot_id": s, "verdict": "pass"} for s in slots])
        elif role.startswith("Auditor"):
            engine("cogentic_propose_lemmas", run_dir=run, lemmas=[{"statement": "If p^2 is even then p is even.", "proof": "Contrapositive."}])
        elif role.startswith("Lemma verifier"):
            engine("cogentic_lemma_verdict", run_dir=run, lemma_id=assignment.replace("lemma ", ""), verdict="pass")
        elif role.startswith("Process advisor"):
            engine("cogentic_set_instructions", run_dir=run, for_provers="State lowest terms.")
        elif role == "Comparator":
            engine("cogentic_select_best", run_dir=run, slot_id=self.st()["accepted_total"][0], reason="only one")
        elif role.startswith("Formal writer"):
            engine("cogentic_submit_manuscript", run_dir=run, manuscript="# Theorem\n" + assignment)
        elif role.startswith("Final auditor"):
            v = int(assignment.split()[-1])
            if v == 1:
                engine("cogentic_submit_audit", run_dir=run, verdict="fail", objections=["Lemma restated wrongly"])
            else:
                engine("cogentic_submit_audit", run_dir=run, verdict="pass")
        else:
            raise AssertionError("unexpected role " + role)
        return "done"


async def run_script(world, with_call_tool=True, known_types=("self", "cogentic-worker"), call_tool_reaches=True,
                     extra_args=None, tiers=("pro", "flash", "flash_lite", "inherit"), hang_roles=(), fail_roles=()):
    """Runs the workflow script with fake run_workflow primitives; returns the script's `result`."""
    world.types, world.models = [], []

    def agent(prompt=None, schema=None, role=None, type_name="self", workspace="inherit", model=None):
        async def refuse(msg):
            raise ToolError(msg)
        if type_name not in known_types:  # what Antigravity said when the worker was not a subagent
            return refuse(f'failed to resolve agent "{type_name}": subagent "{type_name}" not found or not allowed to be invoked')
        if model not in tiers:
            return refuse(f"model tier {model!r} is not available; valid choices: {', '.join(tiers)}")
        if any(role.startswith(r) for r in fail_roles):
            world.calls.append(role)
            return refuse("the agent ended without calling finish")
        if any(role.startswith(r) for r in hang_roles):
            world.calls.append(role)
            async def hang():
                await asyncio.sleep(3600)
            return hang()
        world.types.append(type_name)
        world.models.append(model)
        return world.act(prompt, role)

    async def parallel(items, fn):
        return await asyncio.gather(*[fn(i) for i in items])

    g = {
        "args": {"run_dir": world.run, "roles_dir": os.path.join(ROOT, "skills", "cogentic-roles", "roles"), **(extra_args or {})},
        "agent": agent, "parallel": parallel,
        "phase": lambda name: None, "log": lambda *a: world.logs.append(" ".join(map(str, a))),
        "ToolError": ToolError, "__name__": "__workflow__",
    }
    world.logs = []
    if with_call_tool:
        async def call_tool(name, **kw):
            if not call_tool_reaches:  # e.g. the host namespaces plugin MCP tools differently
                raise ToolError(f"tool {name} is not available to call_tool")
            return engine(name, **kw)
        g["call_tool"] = call_tool
    code = compile(open(SCRIPT, encoding="utf-8").read(), SCRIPT, "exec", flags=ast.PyCF_ALLOW_TOP_LEVEL_AWAIT)
    coro = eval(code, g)
    if coro is not None:
        await coro
    return g.get("result")


def check_done(world):
    st = world.st()
    assert st["phase"] == "done", st["phase"]
    assert st["final"]["manuscript"]["version"] == 2
    assert len(st["ledger"]["verified"]) == 1
    assert st["accepted_total"] == ["r1-d1-p1"], st["accepted_total"]
    with open(os.path.join(world.run, "final", "manuscript.md")) as f:
        assert "version 2" in f.read()
    return st


def main():
    # 1. direct call_tool path
    w = World(new_run())
    asyncio.run(run_script(w))
    st = check_done(w)
    assert st["calls_used"] == len(w.calls), (st["calls_used"], len(w.calls))
    assert set(w.types) == {"cogentic-worker"}, set(w.types)
    print("ok: direct call_tool path,", len(w.calls), "agents on cogentic-worker,", st["calls_used"], "calls charged")

    # 2. no call_tool: clerk agents carry the tool calls, charges are settled through the orchestrator
    w = World(new_run())
    asyncio.run(run_script(w, with_call_tool=False))
    st = check_done(w)
    assert any(c.startswith("clerk: ") for c in w.calls)
    real = [c for c in w.calls if not c.startswith("clerk: ")]
    assert st["calls_used"] == len(real), (st["calls_used"], len(real))
    print("ok: clerk fallback path,", len(w.calls), "agents")

    # 3. crash mid-round, then rerun on the same run_dir: it resumes instead of starting over
    w = World(new_run(), crash_after=6)
    try:
        asyncio.run(run_script(w))
        raise AssertionError("the simulated crash did not happen")
    except Crash:
        pass
    before = w.st()
    assert before["phase"] == "rounds" and before["round"]["status"] == "open", before["phase"]
    w.crash_after = None
    asyncio.run(run_script(w))
    check_done(w)
    lit = [c for c in w.calls if c.startswith("Literature")]
    assert len(lit) == 2, lit
    print("ok: resume after crash; literature not repeated")

    # 4. host cannot resolve the custom agent type (the live failure: subagent: false). It must not silently
    #    fall back to "self" (which inherits Plan/Execute plan reviews): the run halts with a diagnosis...
    w = World(new_run())
    res = asyncio.run(run_script(w, known_types=("self",)))
    assert "halted" in res and "cogentic-worker" in res["halted"], res
    assert w.types == [], "no agent may run as self without permission"
    #    ...and only with allow_self_fallback does it run as self, and finish
    w = World(new_run())
    asyncio.run(run_script(w, known_types=("self",), extra_args={"allow_self_fallback": True}))
    check_done(w)
    assert set(w.types) == {"self"}
    print("ok: unresolved worker type halts with a diagnosis; self only when allowed")

    # 4b. agents never inherit the conversation's model (it may be the Orchestrator planner+executor) unless asked
    w = World(new_run())
    asyncio.run(run_script(w))
    assert set(w.models) == {"pro"}, set(w.models)
    w = World(new_run())
    asyncio.run(run_script(w, tiers=("flash", "flash_lite", "inherit")))
    check_done(w)
    assert set(w.models) == {"flash"}, set(w.models)
    print("ok: explicit model tier (pro), falling back to flash when pro is unavailable")

    # 5. call_tool exists but cannot reach the plugin's tools: clerk agents take over
    w = World(new_run())
    asyncio.run(run_script(w, call_tool_reaches=False))
    st = check_done(w)
    assert any(c.startswith("clerk: ") for c in w.calls)
    real = [c for c in w.calls if not c.startswith("clerk: ")]
    assert st["calls_used"] == len(real), (st["calls_used"], len(real))
    print("ok: clerk fallback when call_tool cannot reach the tools")

    # 6. a protocol error from the engine is not mistaken for an unreachable tool
    run = new_run()
    try:
        engine("cogentic_close_round", run_dir=run)
        raise AssertionError("expected a protocol error")
    except ToolError as e:
        assert "[cogentic]" in e.message, e.message
    print("ok: engine errors carry the [cogentic] marker")




    # 7. agents that keep failing (e.g. blocked tools, no finish) halt the run instead of spinning
    w = World(new_run())
    res = asyncio.run(run_script(w, fail_roles=("Literature", "Orchestrator")))
    assert "halted" in res, res
    assert len(w.calls) <= 4, w.calls
    print("ok: consecutive failures halt the run after", len(w.calls), "agents")

    # 8. the orchestrator fails at the start: no literature reviewers are launched
    w = World(new_run())
    res = asyncio.run(run_script(w, fail_roles=("Orchestrator",), extra_args={"max_consecutive_failures": 5}))
    assert "halted" in res and not any(c.startswith("Literature") for c in w.calls), (res, w.calls)
    print("ok: a failed start launches nothing")

    # 9. a hung agent times out and counts as a failure
    w = World(new_run())
    res = asyncio.run(run_script(w, hang_roles=("Literature",), extra_args={"agent_timeout_s": 0.2}))
    assert "halted" in res, res
    print("ok: hung agents time out")

    # 10. an agent that finishes without recording its output is a failure, not progress
    w = World(new_run())
    w.silent_roles = ("Prover",)
    res = asyncio.run(run_script(w))
    st = w.st()
    assert "halted" in res or st["phase"] in ("stopped",), (res, st["phase"])
    assert any("without recording" in l for l in w.logs), w.logs
    print("ok: silent agents are detected")


if __name__ == "__main__":
    main()
