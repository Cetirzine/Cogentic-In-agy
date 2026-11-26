'use strict';
// Cogentic state engine: the record, the verified ledger, rounds and the consolidation stage of
// "Cogentic: Multi-Agent Orchestration for Automated Proof Discovery" (arXiv:2609.40324, Sec. 2).
//
// The engine holds no mathematical opinion. It only enforces the protocol the paper describes:
//   - a round is planned (directions + prover slots), each prover gets a summarizer's briefing,
//   - every draft is read by a solo verifier and, with the round's other drafts, by a cross verifier,
//   - a draft is accepted only when it passes both (Sec. 2.2),
//   - the record pools attempts by target, with method and the objection they failed on (Sec. 2.3),
//   - fragments go to the ledger only after an auditor restates them and an isolated verifier passes
//     them; dead ends are written down only with verified evidence (Sec. 2.3),
//   - the process advisor runs at the end of every round before the next one opens (Sec. 2.4),
//   - consolidation: comparator -> formal writer -> final audit (Sec. 2.5).
// All state lives in plain files under <workspace>/.cogentic/<run_id>/ so every agent can read it.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VERSION = 1;
const DIRECTION_KINDS = ['claim', 'counterexample', 'repair', 'finalize'];
const VERDICTS = ['pass', 'fail'];

// Models are not hard-coded and not restricted. The orchestrator picks a model for every agent it
// starts from the list the swarm shows it, guided by models/catalog.json (advice, not rules) and by
// the run's own per-model outcomes. The engine only records the choices and honours user pins.
const ROLES = ['orchestrator', 'literature', 'summarizer', 'prover', 'solo_verifier', 'cross_verifier', 'auditor', 'lemma_verifier', 'advisor', 'comparator', 'writer', 'final_auditor', 'narrator', 'monitor'];
const MODELS_DIR = path.join(__dirname, '..', 'models');
const PRIORITIES = ['quality', 'balanced', 'economy'];
const loadCatalog = () => readJSON(path.join(MODELS_DIR, 'catalog.json'), { families: {} });
const modelId = (id, what) => str(id, what, { max: 120 });

class CogenticError extends Error {}
const fail = (msg) => { throw new CogenticError(msg); };

// ---------- files ----------

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}
const readJSON = (file, dflt) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
    if (dflt !== undefined && e.code === 'ENOENT') return dflt;
    throw e;
  }
};
const writeJSON = (file, obj) => writeAtomic(file, JSON.stringify(obj, null, 2) + '\n');
const appendJSONL = (file, obj) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(obj) + '\n');
};
const readJSONL = (file) => {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  return text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
};

// Swarm members are separate agy conversations, and each may run its own copy of this server, so
// every mutation takes a directory lock (mkdir is atomic on every platform).
function sleepMs(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
function withLock(runDir, fn) {
  const lock = path.join(runDir, '.lock');
  const deadline = Date.now() + 20000;
  for (;;) {
    try { fs.mkdirSync(lock); break; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try {
        if (Date.now() - fs.statSync(lock).mtimeMs > 30000) { fs.rmSync(lock, { recursive: true, force: true }); continue; }
      } catch (_) { continue; }
      if (Date.now() > deadline) fail('the run is locked by another agent; try again');
      sleepMs(50);
    }
  }
  try { return fn(); } finally { fs.rmSync(lock, { recursive: true, force: true }); }
}

// ---------- helpers ----------

const now = () => new Date().toISOString();
const str = (v, name, { optional = false, max = 2_000_000 } = {}) => {
  if (v === undefined || v === null || v === '') { if (optional) return ''; fail(`${name} is required`); }
  if (typeof v !== 'string') fail(`${name} must be a string`);
  if (v.length > max) fail(`${name} is longer than ${max} characters`);
  return v;
};
const int = (v, name, dflt, lo, hi) => {
  if (v === undefined || v === null) return dflt;
  if (!Number.isInteger(v) || v < lo || v > hi) fail(`${name} must be an integer in [${lo}, ${hi}]`);
  return v;
};
const arr = (v, name, { optional = false } = {}) => {
  if (v === undefined || v === null) { if (optional) return []; fail(`${name} is required`); }
  if (!Array.isArray(v)) fail(`${name} must be an array`);
  return v;
};
const oneOf = (v, name, options) => { if (!options.includes(v)) fail(`${name} must be one of ${options.join(', ')}`); return v; };
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'problem';

function resolveRun(runDir) {
  str(runDir, 'run_dir');
  if (!path.isAbsolute(runDir)) fail('run_dir must be the absolute path returned by cogentic_init');
  if (!fs.existsSync(path.join(runDir, 'state.json'))) fail(`no Cogentic run at ${runDir}`);
  return runDir;
}

const P = (runDir) => ({
  state: path.join(runDir, 'state.json'),
  problem: path.join(runDir, 'problem.md'),
  record: path.join(runDir, 'record.jsonl'),
  ledger: path.join(runDir, 'ledger.json'),
  log: path.join(runDir, 'log.jsonl'),
  instructions: path.join(runDir, 'instructions.md'),
  litDir: path.join(runDir, 'literature'),
  round: (n) => path.join(runDir, 'rounds', `r${n}`),
  briefing: (n, slot) => path.join(runDir, 'rounds', `r${n}`, 'briefings', `${slot}.md`),
  draft: (n, slot) => path.join(runDir, 'rounds', `r${n}`, 'drafts', `${slot}.md`),
  solo: (n, slot) => path.join(runDir, 'rounds', `r${n}`, 'verdicts', `${slot}.solo.json`),
  cross: (n) => path.join(runDir, 'rounds', `r${n}`, 'verdicts', 'cross.json'),
  lemma: (id) => path.join(runDir, 'ledger', `${id}.md`),
  finalDir: path.join(runDir, 'final'),
  manuscript: path.join(runDir, 'final', 'manuscript.md'),
});

const load = (runDir) => readJSON(P(runDir).state);
const save = (runDir, st) => { st.updated = now(); writeJSON(P(runDir).state, st); };
const log = (runDir, event, data) => appendJSONL(P(runDir).log, { t: now(), event, ...data });
const currentRound = (st) => st.rounds[st.rounds.length - 1];
const findSlot = (st, slotId) => {
  const r = currentRound(st);
  if (!r || r.status !== 'open') fail('no round is open');
  const s = r.slots.find((x) => x.id === slotId);
  if (!s) fail(`slot ${slotId} is not in round ${r.n}; slots are ${r.slots.map((x) => x.id).join(', ')}`);
  return { r, s };
};
const requirePhase = (st, ...phases) => {
  if (!phases.includes(st.phase)) fail(`this step is not allowed in phase "${st.phase}" (allowed: ${phases.join(', ')})`);
};

// ---------- tools ----------

function init(a) {
  const workspace = str(a.workspace, 'workspace');
  if (!path.isAbsolute(workspace)) fail('workspace must be an absolute path');
  const problem = str(a.problem, 'problem');
  const title = str(a.title, 'title', { optional: true, max: 200 }) || problem.split('\n')[0].slice(0, 80);
  const runId = `${new Date().toISOString().slice(0, 10)}-${slug(title)}-${crypto.randomBytes(2).toString('hex')}`;
  const runDir = path.join(workspace, '.cogentic', runId);
  fs.mkdirSync(path.join(runDir, 'literature'), { recursive: true });
  fs.mkdirSync(path.join(runDir, 'ledger'), { recursive: true });
  const pins = {};
  if (a.pins !== undefined && a.pins !== null) {
    if (typeof a.pins !== 'object' || Array.isArray(a.pins)) fail('pins must be an object of role -> model id');
    for (const [role, id] of Object.entries(a.pins)) {
      if (!ROLES.includes(role)) fail(`unknown role ${role}; roles are ${ROLES.join(', ')}`);
      pins[role] = modelId(id, `pin for ${role}`);
    }
  }
  const single = a.single_model ? modelId(a.single_model, 'single_model') : '';
  const st = {
    version: VERSION,
    run_id: runId,
    title,
    created: now(),
    updated: now(),
    config: {
      max_rounds: int(a.max_rounds, 'max_rounds', 8, 1, 200),
      max_provers: int(a.max_provers, 'max_provers', 6, 1, 64),
      budget_calls: int(a.budget_calls, 'budget_calls', 400, 10, 100000),
      mode: oneOf(a.mode || 'swarm', 'mode', ['swarm', 'workflow']),
      priority: oneOf(a.priority || 'balanced', 'priority', PRIORITIES),
      pins,
      single_model: single,
    },
    assignments: [],
    calls_by_model: {},
    phase: 'literature', // literature -> rounds -> consolidation -> done | stopped
    calls_used: 0,
    calls_by_role: {},
    directions: [],
    rounds: [],
    instructions_version: 0,
    final: { choice: null, manuscript: null, audits: [] },
  };
  writeAtomic(P(runDir).problem, `# Problem\n\n${problem}\n`);
  writeJSON(P(runDir).ledger, { lemmas: [], excluded: [] });
  writeAtomic(P(runDir).instructions, '# Standing instructions\n\n(none yet: the process advisor writes these at the end of each round)\n');
  save(runDir, st);
  log(runDir, 'init', { title, config: st.config });
  return { run_dir: runDir, run_id: runId, ...paths(runDir), next: nextStep(runDir, st) };
}

function paths(runDir) {
  const p = P(runDir);
  return { problem_path: p.problem, record_path: p.record, ledger_path: p.ledger, instructions_path: p.instructions, literature_dir: p.litDir, log_path: p.log };
}

// The model the run requires for a role, if the user pinned one ('' if the orchestrator chooses).
const requiredModel = (st, role) => st.config.single_model || st.config.pins[role] || '';

function charge(a) {
  const runDir = resolveRun(a.run_dir);
  return withLock(runDir, () => {
    const st = load(runDir);
    const role = str(a.role, 'role', { max: 60 });
    const calls = int(a.calls, 'calls', 1, 1, 10000);
    let model = str(a.model, 'model', { optional: true, max: 120 });
    if (model && model !== 'inherit') {
      const req = ROLES.includes(role) ? requiredModel(st, role) : '';
      if (req && model !== req) fail(`the user pinned ${role} to ${req}`);
    } else if (st.config.mode === 'swarm' && ROLES.includes(role) && !model) {
      fail('in swarm mode, say which model this agent runs on (model)');
    }
    st.calls_used += calls;
    st.calls_by_role[role] = (st.calls_by_role[role] || 0) + calls;
    if (model) st.calls_by_model[model] = (st.calls_by_model[model] || 0) + calls;
    if (model) st.assignments.push({ role, model, assignment: str(a.assignment, 'assignment', { optional: true, max: 200 }), reason: str(a.reason, 'reason', { optional: true, max: 1000 }), round: st.rounds.length, at: now() });
    save(runDir, st);
    return { calls_used: st.calls_used, budget_calls: st.config.budget_calls, remaining: Math.max(0, st.config.budget_calls - st.calls_used) };
  });
}

// The model last recorded (cogentic_charge) for a role on an assignment ('' if unknown).
function assignedModel(st, role, assignment, round) {
  const list = (st.assignments || []).filter((x) => x.role === role);
  const hit = [...list].reverse().find((x) => x.assignment === assignment)
    || (round !== undefined ? [...list].reverse().find((x) => x.round === round) : undefined);
  return hit ? hit.model : '';
}

// Per-model outcomes so far, for the orchestrator's model choices.
function modelStats(st, record) {
  const by = {};
  const bump = (model, role, key) => {
    if (!model) return;
    const m = (by[model] = by[model] || {});
    const r = (m[role] = m[role] || {});
    r[key] = (r[key] || 0) + 1;
  };
  for (const a of st.assignments) bump(a.model, a.role, 'started');
  for (const e of record) {
    if (e.outcome === 'no_draft') { bump(e.prover_model, 'prover', 'no_draft'); continue; }
    bump(e.prover_model, 'prover', e.outcome === 'accepted' ? 'accepted' : 'rejected');
    // A verifier "missed" when it passed a draft the other verifier failed with a fatal/major objection.
    const hard = (by_) => (e.objections || []).some((o) => o.by === by_ && o.severity !== 'minor');
    if (e.solo === 'pass' && e.cross === 'fail' && hard('cross')) bump(e.solo_model, 'solo_verifier', 'missed');
    if (e.cross === 'pass' && e.solo === 'fail' && hard('solo')) bump(e.cross_model, 'cross_verifier', 'missed');
    if (e.solo === 'fail') bump(e.solo_model, 'solo_verifier', 'failed_draft');
    if (e.cross === 'fail') bump(e.cross_model, 'cross_verifier', 'failed_draft');
  }
  return by;
}

function models(a) {
  const runDir = resolveRun(a.run_dir);
  const st = load(runDir);
  return {
    priority: st.config.priority,
    pins: st.config.pins,
    single_model: st.config.single_model,
    catalog: loadCatalog(),
    calls_by_model: st.calls_by_model,
    outcomes_by_model: modelStats(st, readJSONL(P(runDir).record)),
    budget: { used: st.calls_used, total: st.config.budget_calls },
  };
}

function addLiterature(a) {
  const runDir = resolveRun(a.run_dir);
  return withLock(runDir, () => {
    const st = load(runDir);
    requirePhase(st, 'literature', 'rounds');
    const title = str(a.title, 'title', { max: 200 });
    const content = str(a.content, 'content');
    const n = fs.readdirSync(P(runDir).litDir).filter((f) => f.endsWith('.md')).length + 1;
    const file = path.join(P(runDir).litDir, `${String(n).padStart(2, '0')}-${slug(title)}.md`);
    const sources = arr(a.sources, 'sources', { optional: true }).map((s) => `- ${String(s)}`).join('\n');
    writeAtomic(file, `# ${title}\n\n_Reviewer: ${a.reviewer || 'literature reviewer'} · round ${st.rounds.length}_\n\n${content}\n${sources ? `\n## Sources\n\n${sources}\n` : ''}`);
    log(runDir, 'literature', { title, file });
    return { path: file };
  });
}

function openRound(a) {
  const runDir = resolveRun(a.run_dir);
  return withLock(runDir, () => {
    const st = load(runDir);
    requirePhase(st, 'literature', 'rounds');
    const prev = currentRound(st);
    if (prev) {
      if (prev.status === 'open') fail(`round ${prev.n} is still open; close it first`);
      if (!prev.audit_done) fail(`the auditor has not processed round ${prev.n} (call cogentic_propose_lemmas, with an empty list if there is nothing to extract)`);
      const ledger = readJSON(P(runDir).ledger);
      const pending = ledger.lemmas.filter((l) => l.status === 'pending' && l.round === prev.n);
      if (pending.length) fail(`lemmas ${pending.map((l) => l.id).join(', ')} from round ${prev.n} still await isolated verification`);
      if (st.instructions_version < prev.n) fail(`the process advisor has not reviewed round ${prev.n} (cogentic_set_instructions)`);
    }
    if (st.rounds.length >= st.config.max_rounds) fail(`max_rounds (${st.config.max_rounds}) reached; consolidate the best verified result or stop the run`);
    if (st.calls_used >= st.config.budget_calls) fail(`the call budget (${st.config.budget_calls}) is spent; consolidate or stop`);
    const dirs = arr(a.directions, 'directions');
    if (!dirs.length) fail('a round needs at least one direction');
    const n = st.rounds.length + 1;
    const ledger = readJSON(P(runDir).ledger);
    const excluded = new Set(ledger.excluded.map((e) => e.direction_id).filter(Boolean));
    const slots = [];
    const used = [];
    for (const d of dirs) {
      let dir;
      if (d.id) {
        dir = st.directions.find((x) => x.id === d.id);
        if (!dir) fail(`unknown direction ${d.id}`);
        if (excluded.has(dir.id) || dir.status === 'excluded') fail(`direction ${dir.id} is recorded as excluded in the ledger`);
        if (d.kind) dir.kind = oneOf(d.kind, 'kind', DIRECTION_KINDS);
      } else {
        dir = {
          id: `d${st.directions.length + 1}`,
          claim: str(d.claim, 'direction claim', { max: 4000 }),
          kind: oneOf(d.kind || 'claim', 'kind', DIRECTION_KINDS),
          status: 'open',
          opened_round: n,
        };
        st.directions.push(dir);
      }
      const k = int(d.provers, 'provers', 1, 1, 64);
      for (let i = 0; i < k; i++) {
        const id = `r${n}-${dir.id}-p${i + 1}`;
        slots.push({ id, direction_id: dir.id, briefing: false, draft: false, solo: null });
      }
      used.push({ id: dir.id, claim: dir.claim, kind: dir.kind, provers: k });
    }
    if (slots.length > st.config.max_provers) fail(`${slots.length} prover slots exceed max_provers (${st.config.max_provers})`);
    const round = { n, status: 'open', opened: now(), note: str(a.note, 'note', { optional: true, max: 4000 }), directions: used.map((u) => u.id), slots, cross: null, audit_done: false, accepted: [] };
    st.rounds.push(round);
    st.phase = 'rounds';
    fs.mkdirSync(path.join(P(runDir).round(n), 'briefings'), { recursive: true });
    fs.mkdirSync(path.join(P(runDir).round(n), 'drafts'), { recursive: true });
    fs.mkdirSync(path.join(P(runDir).round(n), 'verdicts'), { recursive: true });
    save(runDir, st);
    log(runDir, 'open_round', { round: n, directions: used, note: round.note });
    return {
      round: n,
      directions: used,
      slots: slots.map((s) => ({ slot_id: s.id, direction_id: s.direction_id, briefing_path: P(runDir).briefing(n, s.id), draft_path: P(runDir).draft(n, s.id) })),
      model_hint: 'Choose each agent\'s model yourself (cogentic_models); diversify the provers of a round and put verifiers on a different model from the prover they check where you can.',
      next: 'Spawn one summarizer per slot (each independently writes that slot\'s briefing), then one prover per slot.',
    };
  });
}

function submitBriefing(a) {
  const runDir = resolveRun(a.run_dir);
  return withLock(runDir, () => {
    const st = load(runDir);
    const { r, s } = findSlot(st, str(a.slot_id, 'slot_id'));
    if (s.draft) fail(`slot ${s.id} already has a draft`);
    const file = P(runDir).briefing(r.n, s.id);
    const dir = st.directions.find((d) => d.id === s.direction_id);
    writeAtomic(file, `# Briefing for ${s.id}\n\n**Direction ${dir.id} (${dir.kind}):** ${dir.claim}\n\n${str(a.briefing, 'briefing')}\n`);
    s.briefing = true;
    save(runDir, st);
    log(runDir, 'briefing', { round: r.n, slot: s.id });
    return { path: file };
  });
}

function submitDraft(a) {
  const runDir = resolveRun(a.run_dir);
  return withLock(runDir, () => {
    const st = load(runDir);
    const { r, s } = findSlot(st, str(a.slot_id, 'slot_id'));
    if (!s.briefing) fail(`slot ${s.id} has no briefing yet: provers work from a summarizer's briefing`);
    if (s.draft) fail(`slot ${s.id} already has a draft; each prover slot produces one draft per round`);
    const target = str(a.target_claim, 'target_claim', { max: 8000 });
    const method = str(a.method, 'method', { max: 4000 });
    const proof = str(a.proof, 'proof');
    const status = oneOf(a.status || 'complete', 'status', ['complete', 'partial', 'counterexample', 'gave_up']);
    const file = P(runDir).draft(r.n, s.id);
    writeAtomic(file, `# Draft ${s.id}\n\n- Direction: ${s.direction_id}\n- Status claimed by prover: ${status}\n- Target claim: ${target}\n- Method: ${method}\n\n---\n\n${proof}\n`);
    Object.assign(s, { draft: true, target_claim: target, method, claimed_status: status });
    save(runDir, st);
    log(runDir, 'draft', { round: r.n, slot: s.id, status });
    return { path: file, next: 'Send this draft to a solo verifier.' };
  });
}

function normObjections(list) {
  return arr(list, 'objections', { optional: true }).map((o, i) => {
    if (typeof o === 'string') return { location: '', issue: o, severity: 'major' };
    if (!o || typeof o !== 'object') fail(`objection ${i + 1} must be a string or an object`);
    return { location: String(o.location || ''), issue: str(o.issue, `objection ${i + 1} issue`, { max: 8000 }), severity: oneOf(o.severity || 'major', 'severity', ['fatal', 'major', 'minor']) };
  });
}
function normFragments(list) {
  return arr(list, 'confirmed_fragments', { optional: true }).map((f, i) => {
    if (typeof f === 'string') return { statement: f, location: '' };
    return { statement: str(f && f.statement, `fragment ${i + 1} statement`, { max: 8000 }), location: String((f && f.location) || '') };
  });
}

function submitSoloVerdict(a) {
  const runDir = resolveRun(a.run_dir);
  return withLock(runDir, () => {
    const st = load(runDir);
    const { r, s } = findSlot(st, str(a.slot_id, 'slot_id'));
    if (!s.draft) fail(`slot ${s.id} has no draft to verify`);
    if (s.solo) fail(`slot ${s.id} already has a solo verdict`);
    const verdict = oneOf(a.verdict, 'verdict', VERDICTS);
    const objections = normObjections(a.objections);
    if (verdict === 'fail' && !objections.length) fail('a failing verdict must state at least one objection');
    if (verdict === 'pass' && objections.some((o) => o.severity !== 'minor')) fail('a passing verdict may only carry minor objections');
    const v = { verdict, objections, confirmed_fragments: normFragments(a.confirmed_fragments), citations_checked: arr(a.citations_checked, 'citations_checked', { optional: true }).map(String), at: now() };
    writeJSON(P(runDir).solo(r.n, s.id), v);
    s.solo = verdict;
    save(runDir, st);
    log(runDir, 'solo_verdict', { round: r.n, slot: s.id, verdict, objections: objections.length });
    return { recorded: verdict };
  });
}

function submitCrossVerdict(a) {
  const runDir = resolveRun(a.run_dir);
  return withLock(runDir, () => {
    const st = load(runDir);
    const r = currentRound(st);
    if (!r || r.status !== 'open') fail('no round is open');
    if (r.cross) fail(`round ${r.n} already has a cross verdict`);
    const drafted = r.slots.filter((s) => s.draft);
    const missing = r.slots.filter((s) => !s.draft && !s.abandoned);
    if (missing.length) fail(`drafts missing for ${missing.map((s) => s.id).join(', ')}; the cross verifier reads all of the round's drafts (abandon a slot with cogentic_abandon_slot if its prover failed)`);
    if (!drafted.length) fail('the round has no drafts');
    const verdicts = arr(a.verdicts, 'verdicts');
    const bySlot = new Map();
    for (const v of verdicts) {
      const id = str(v && v.slot_id, 'verdicts[].slot_id');
      if (!drafted.find((s) => s.id === id)) fail(`slot ${id} has no draft in round ${r.n}`);
      const verdict = oneOf(v.verdict, `verdict for ${id}`, VERDICTS);
      const objections = normObjections(v.objections);
      if (verdict === 'fail' && !objections.length) fail(`the failing cross verdict for ${id} must state an objection`);
      if (verdict === 'pass' && objections.some((o) => o.severity !== 'minor')) fail(`a passing cross verdict for ${id} may only carry minor objections`);
      bySlot.set(id, { slot_id: id, verdict, objections, confirmed_fragments: normFragments(v.confirmed_fragments) });
    }
    const unjudged = drafted.filter((s) => !bySlot.has(s.id));
    if (unjudged.length) fail(`the cross verdict must judge every draft; missing ${unjudged.map((s) => s.id).join(', ')}`);
    const cross = {
      verdicts: [...bySlot.values()],
      shared_blind_spots: arr(a.shared_blind_spots, 'shared_blind_spots', { optional: true }).map(String),
      ranking: arr(a.ranking, 'ranking', { optional: true }).map(String),
      at: now(),
    };
    writeJSON(P(runDir).cross(r.n), cross);
    r.cross = true;
    save(runDir, st);
    log(runDir, 'cross_verdict', { round: r.n, pass: cross.verdicts.filter((v) => v.verdict === 'pass').map((v) => v.slot_id) });
    return { recorded: cross.verdicts.map((v) => ({ slot_id: v.slot_id, verdict: v.verdict })) };
  });
}

function abandonSlot(a) {
  const runDir = resolveRun(a.run_dir);
  return withLock(runDir, () => {
    const st = load(runDir);
    const { r, s } = findSlot(st, str(a.slot_id, 'slot_id'));
    if (s.draft) fail(`slot ${s.id} has a draft; it must be verified, not abandoned`);
    s.abandoned = str(a.reason, 'reason', { max: 2000 });
    save(runDir, st);
    log(runDir, 'abandon', { round: r.n, slot: s.id, reason: s.abandoned });
    return { abandoned: s.id };
  });
}

function closeRound(a) {
  const runDir = resolveRun(a.run_dir);
  return withLock(runDir, () => {
    const st = load(runDir);
    const r = currentRound(st);
    if (!r || r.status !== 'open') fail('no round is open');
    const drafted = r.slots.filter((s) => s.draft);
    const unsolo = drafted.filter((s) => !s.solo);
    if (unsolo.length) fail(`solo verdicts missing for ${unsolo.map((s) => s.id).join(', ')}`);
    const open = r.slots.filter((s) => !s.draft && !s.abandoned);
    if (open.length) fail(`slots without a draft: ${open.map((s) => s.id).join(', ')} (wait for them or abandon them)`);
    if (drafted.length && !r.cross) fail('the cross verifier has not judged this round');
    const cross = drafted.length ? readJSON(P(runDir).cross(r.n)) : { verdicts: [] };
    const fragments = [];
    const accepted = [];
    for (const s of r.slots) {
      if (!s.draft) {
        appendJSONL(P(runDir).record, { round: r.n, slot: s.id, direction_id: s.direction_id, prover_model: assignedModel(st, 'prover', s.id), outcome: 'no_draft', reason: s.abandoned });
        continue;
      }
      const solo = readJSON(P(runDir).solo(r.n, s.id));
      const cv = cross.verdicts.find((v) => v.slot_id === s.id);
      const ok = solo.verdict === 'pass' && cv.verdict === 'pass';
      if (ok) accepted.push(s.id);
      const objections = [...solo.objections.map((o) => ({ by: 'solo', ...o })), ...cv.objections.map((o) => ({ by: 'cross', ...o }))];
      appendJSONL(P(runDir).record, {
        round: r.n,
        slot: s.id,
        direction_id: s.direction_id,
        target_claim: s.target_claim,
        method: s.method,
        claimed_status: s.claimed_status,
        prover_model: assignedModel(st, 'prover', s.id),
        solo_model: assignedModel(st, 'solo_verifier', s.id),
        cross_model: assignedModel(st, 'cross_verifier', `r${r.n}`, r.n),
        solo: solo.verdict,
        cross: cv.verdict,
        outcome: ok ? 'accepted' : 'rejected',
        objections,
        draft_path: P(runDir).draft(r.n, s.id),
      });
      for (const f of [...solo.confirmed_fragments, ...cv.confirmed_fragments]) fragments.push({ slot_id: s.id, ...f });
    }
    r.status = 'closed';
    r.closed = now();
    r.accepted = accepted;
    for (const id of accepted) {
      const s = r.slots.find((x) => x.id === id);
      const d = st.directions.find((x) => x.id === s.direction_id);
      d.status = 'established';
      d.accepted = [...(d.accepted || []), id];
    }
    save(runDir, st);
    log(runDir, 'close_round', { round: r.n, accepted, fragments: fragments.length, shared_blind_spots: cross.shared_blind_spots || [] });
    return {
      round: r.n,
      accepted: accepted.map((id) => ({ slot_id: id, draft_path: P(runDir).draft(r.n, id) })),
      fragments_for_auditor: fragments,
      next: 'Auditor: restate confirmed fragments as self-contained lemmas (cogentic_propose_lemmas, even if empty); each lemma then gets an isolated verifier; then the process advisor (cogentic_set_instructions).',
    };
  });
}

function proposeLemmas(a) {
  const runDir = resolveRun(a.run_dir);
  return withLock(runDir, () => {
    const st = load(runDir);
    const r = currentRound(st);
    if (!r || r.status !== 'closed') fail('lemmas are proposed after a round closes');
    if (r.audit_done) fail(`the auditor already processed round ${r.n}`);
    const ledger = readJSON(P(runDir).ledger);
    const out = [];
    for (const [i, l] of arr(a.lemmas, 'lemmas').entries()) {
      const id = `L${ledger.lemmas.length + 1}`;
      const statement = str(l && l.statement, `lemma ${i + 1} statement`, { max: 20000 });
      const proof = str(l.proof, `lemma ${i + 1} proof`);
      const deps = arr(l.depends_on, 'depends_on', { optional: true }).map(String);
      for (const dep of deps) {
        const dl = ledger.lemmas.find((x) => x.id === dep);
        if (!dl || dl.status !== 'verified') fail(`lemma ${i + 1} depends on ${dep}, which is not a verified ledger lemma`);
      }
      writeAtomic(P(runDir).lemma(id), `# ${id} (pending isolated verification)\n\n**Statement.** ${statement}\n\n**Depends on:** ${deps.join(', ') || 'nothing beyond the problem statement and cited literature'}\n\n**Source:** ${l.source_slot || 'round ' + r.n}\n\n**Proof.**\n\n${proof}\n`);
      ledger.lemmas.push({ id, statement, depends_on: deps, source_slot: String(l.source_slot || ''), round: r.n, status: 'pending', path: P(runDir).lemma(id) });
      out.push({ lemma_id: id, path: P(runDir).lemma(id) });
    }
    r.audit_done = true;
    writeJSON(P(runDir).ledger, ledger);
    save(runDir, st);
    log(runDir, 'propose_lemmas', { round: r.n, lemmas: out.map((o) => o.lemma_id) });
    return { proposed: out, next: out.length ? 'Give each lemma to its own isolated verifier (cogentic_lemma_verdict).' : 'Run the process advisor.' };
  });
}

function lemmaVerdict(a) {
  const runDir = resolveRun(a.run_dir);
  return withLock(runDir, () => {
    const ledger = readJSON(P(runDir).ledger);
    const id = str(a.lemma_id, 'lemma_id');
    const l = ledger.lemmas.find((x) => x.id === id);
    if (!l) fail(`unknown lemma ${id}`);
    if (l.status !== 'pending') fail(`lemma ${id} is already ${l.status}`);
    const verdict = oneOf(a.verdict, 'verdict', VERDICTS);
    const objections = normObjections(a.objections);
    if (verdict === 'fail' && !objections.length) fail('a failing verdict must state an objection');
    if (verdict === 'pass' && objections.some((o) => o.severity !== 'minor')) fail('a passing verdict may only carry minor objections');
    l.status = verdict === 'pass' ? 'verified' : 'rejected';
    l.objections = objections;
    l.verified_at = now();
    const text = fs.readFileSync(l.path, 'utf8').replace(/^# (L\d+) \(pending isolated verification\)/, `# $1 (${l.status})`);
    writeAtomic(l.path, text + (objections.length ? `\n## Verifier objections\n\n${objections.map((o) => `- [${o.severity}] ${o.location ? o.location + ': ' : ''}${o.issue}`).join('\n')}\n` : ''));
    writeJSON(P(runDir).ledger, ledger);
    log(runDir, 'lemma_verdict', { lemma: id, verdict });
    return { lemma_id: id, status: l.status };
  });
}

function markExcluded(a) {
  const runDir = resolveRun(a.run_dir);
  return withLock(runDir, () => {
    const st = load(runDir);
    const ledger = readJSON(P(runDir).ledger);
    const claim = str(a.claim, 'claim', { max: 8000 });
    const evidence = str(a.evidence, 'evidence (a verified lemma id or an accepted slot id)', { max: 100 });
    const lemma = ledger.lemmas.find((l) => l.id === evidence && l.status === 'verified');
    const slot = st.rounds.some((r) => r.accepted.includes(evidence));
    if (!lemma && !slot) fail(`${evidence} is neither a verified ledger lemma nor an accepted draft; a dead end is recorded only on verified evidence`);
    let directionId = '';
    if (a.direction_id) {
      const d = st.directions.find((x) => x.id === a.direction_id);
      if (!d) fail(`unknown direction ${a.direction_id}`);
      d.status = 'excluded';
      directionId = d.id;
    }
    const e = { id: `X${ledger.excluded.length + 1}`, claim, reason: str(a.reason, 'reason', { max: 8000 }), evidence, direction_id: directionId, at: now() };
    ledger.excluded.push(e);
    writeJSON(P(runDir).ledger, ledger);
    save(runDir, st);
    log(runDir, 'excluded', e);
    return e;
  });
}

function setInstructions(a) {
  const runDir = resolveRun(a.run_dir);
  return withLock(runDir, () => {
    const st = load(runDir);
    const r = currentRound(st);
    if (!r || r.status !== 'closed') fail('the process advisor runs after a round closes');
    if (!r.audit_done) fail('run the auditor for this round first');
    if (st.instructions_version >= r.n) fail(`round ${r.n} already has the advisor's instructions`);
    const forProvers = str(a.for_provers, 'for_provers', { optional: true });
    const forVerifiers = str(a.for_verifiers, 'for_verifiers', { optional: true });
    const allocation = str(a.allocation_advice, 'allocation_advice', { optional: true });
    const observations = arr(a.observations, 'observations', { optional: true }).map(String);
    const text = `# Standing instructions (after round ${r.n})\n\n_Maintained by the process advisor. No mathematical opinions: process only._\n\n## For provers\n\n${forProvers || '(no change)'}\n\n## For verifiers\n\n${forVerifiers || '(no change)'}\n\n## Allocation advice for the orchestrator\n\n${allocation || '(none)'}\n\n## Observed patterns\n\n${observations.map((o) => `- ${o}`).join('\n') || '(none)'}\n`;
    writeAtomic(path.join(runDir, 'instructions', `after-r${r.n}.md`), text);
    writeAtomic(P(runDir).instructions, text);
    st.instructions_version = r.n;
    save(runDir, st);
    log(runDir, 'instructions', { round: r.n, observations });
    return { path: P(runDir).instructions, next: nextStep(runDir, st) };
  });
}

function beginConsolidation(a) {
  const runDir = resolveRun(a.run_dir);
  return withLock(runDir, () => {
    const st = load(runDir);
    requirePhase(st, 'rounds');
    const r = currentRound(st);
    if (r && r.status === 'open') fail(`round ${r.n} is still open`);
    const accepted = st.rounds.flatMap((x) => x.accepted.map((id) => ({ round: x.n, slot_id: id, draft_path: P(runDir).draft(x.n, id) })));
    if (!accepted.length) fail('no draft has cleared verification; there is nothing to consolidate');
    st.phase = 'consolidation';
    save(runDir, st);
    log(runDir, 'consolidation', { candidates: accepted.map((c) => c.slot_id) });
    return { candidates: accepted, next: 'Comparator: pick the strongest verified proof (cogentic_select_best).' };
  });
}

function selectBest(a) {
  const runDir = resolveRun(a.run_dir);
  return withLock(runDir, () => {
    const st = load(runDir);
    requirePhase(st, 'consolidation');
    const id = str(a.slot_id, 'slot_id');
    const r = st.rounds.find((x) => x.accepted.includes(id));
    if (!r) fail(`${id} is not an accepted draft`);
    st.final.choice = { slot_id: id, round: r.n, draft_path: P(runDir).draft(r.n, id), reason: str(a.reason, 'reason', { max: 8000 }) };
    save(runDir, st);
    log(runDir, 'select_best', st.final.choice);
    return { choice: st.final.choice, next: 'Formal writer: expand it into a self-contained manuscript (cogentic_submit_manuscript).' };
  });
}

function submitManuscript(a) {
  const runDir = resolveRun(a.run_dir);
  return withLock(runDir, () => {
    const st = load(runDir);
    requirePhase(st, 'consolidation');
    if (!st.final.choice) fail('the comparator has not chosen a proof');
    const last = st.final.audits[st.final.audits.length - 1];
    if (st.final.manuscript && !(last && last.verdict === 'fail' && last.version === st.final.manuscript.version)) fail('a manuscript is awaiting its final audit');
    const version = st.final.manuscript ? st.final.manuscript.version + 1 : 1;
    const text = str(a.manuscript, 'manuscript');
    writeAtomic(path.join(P(runDir).finalDir, `manuscript-v${version}.md`), text);
    writeAtomic(P(runDir).manuscript, text);
    st.final.manuscript = { version, path: P(runDir).manuscript, at: now() };
    save(runDir, st);
    log(runDir, 'manuscript', { version });
    return { path: P(runDir).manuscript, version, next: 'Final audit: check the manuscript against the accepted proof (cogentic_submit_audit).' };
  });
}

function submitAudit(a) {
  const runDir = resolveRun(a.run_dir);
  return withLock(runDir, () => {
    const st = load(runDir);
    requirePhase(st, 'consolidation');
    if (!st.final.manuscript) fail('there is no manuscript to audit');
    const last = st.final.audits[st.final.audits.length - 1];
    if (last && last.version === st.final.manuscript.version) fail(`manuscript v${st.final.manuscript.version} was already audited`);
    const verdict = oneOf(a.verdict, 'verdict', VERDICTS);
    const objections = normObjections(a.objections);
    if (verdict === 'fail' && !objections.length) fail('a failing audit must state an objection');
    if (verdict === 'pass' && objections.some((o) => o.severity !== 'minor')) fail('a passing audit may only carry minor objections');
    st.final.audits.push({ version: st.final.manuscript.version, verdict, objections, at: now() });
    writeJSON(path.join(P(runDir).finalDir, `audit-v${st.final.manuscript.version}.json`), st.final.audits[st.final.audits.length - 1]);
    if (verdict === 'pass') st.phase = 'done';
    save(runDir, st);
    log(runDir, 'audit', { version: st.final.manuscript.version, verdict });
    return { verdict, phase: st.phase, manuscript_path: P(runDir).manuscript, next: verdict === 'pass' ? 'Done: report the manuscript path to the user.' : 'Send the objections to the formal writer for a revised manuscript.' };
  });
}

function stop(a) {
  const runDir = resolveRun(a.run_dir);
  return withLock(runDir, () => {
    const st = load(runDir);
    if (st.phase === 'done') fail('the run is already done');
    st.phase = 'stopped';
    st.stop_reason = str(a.reason, 'reason', { max: 4000 });
    save(runDir, st);
    log(runDir, 'stop', { reason: st.stop_reason });
    return { phase: 'stopped', ...paths(runDir) };
  });
}

function readRecord(a) {
  const runDir = resolveRun(a.run_dir);
  const all = readJSONL(P(runDir).record);
  const st = load(runDir);
  const want = a.direction_id ? [a.direction_id] : st.directions.map((d) => d.id);
  const pooled = want.map((id) => {
    const d = st.directions.find((x) => x.id === id);
    if (!d) fail(`unknown direction ${id}`);
    return { direction: d, attempts: all.filter((e) => e.direction_id === id) };
  });
  return { directions: pooled };
}

function nextStep(runDir, st) {
  if (st.phase === 'done') return 'Done.';
  if (st.phase === 'stopped') return 'Stopped.';
  if (st.phase === 'consolidation') {
    if (!st.final.choice) return 'comparator: cogentic_select_best';
    const last = st.final.audits[st.final.audits.length - 1];
    if (!st.final.manuscript || (last && last.verdict === 'fail' && last.version === st.final.manuscript.version)) return 'formal writer: cogentic_submit_manuscript';
    return 'final auditor: cogentic_submit_audit';
  }
  const r = currentRound(st);
  if (!r) return 'literature reviewers (cogentic_add_literature), then plan round 1 (cogentic_open_round)';
  if (r.status === 'open') {
    const need = (f) => r.slots.filter((s) => !s.abandoned && f(s)).map((s) => s.id);
    const nb = need((s) => !s.briefing); if (nb.length) return `summarizers: briefings for ${nb.join(', ')}`;
    const nd = need((s) => !s.draft); if (nd.length) return `provers: drafts for ${nd.join(', ')}`;
    const ns = need((s) => s.draft && !s.solo); if (ns.length) return `solo verifiers: ${ns.join(', ')}`;
    if (!r.cross) return 'cross verifier: one verdict over all drafts of the round';
    return 'close the round (cogentic_close_round)';
  }
  if (!r.audit_done) return 'auditor: cogentic_propose_lemmas';
  const ledger = readJSON(P(runDir).ledger);
  const pending = ledger.lemmas.filter((l) => l.status === 'pending' && l.round === r.n).map((l) => l.id);
  if (pending.length) return `isolated lemma verifiers: ${pending.join(', ')}`;
  if (st.instructions_version < r.n) return 'process advisor: cogentic_set_instructions';
  const accepted = st.rounds.some((x) => x.accepted.length);
  const out = st.rounds.length >= st.config.max_rounds || st.calls_used >= st.config.budget_calls;
  if (out) return accepted ? 'budget or rounds exhausted: cogentic_begin_consolidation' : 'budget or rounds exhausted with no accepted draft: cogentic_stop and report the ledger';
  return accepted
    ? 'a draft cleared verification: either open another round on remaining promising avenues, or cogentic_begin_consolidation'
    : `plan round ${r.n + 1} (cogentic_open_round), dispatching literature reviewers first if attempts stall at the same step`;
}

function status(a) {
  const runDir = resolveRun(a.run_dir);
  const st = load(runDir);
  const ledger = readJSON(P(runDir).ledger);
  const r = currentRound(st);
  return {
    run_id: st.run_id,
    title: st.title,
    phase: st.phase,
    round: r ? { n: r.n, status: r.status, slots: r.slots.map((s) => ({ id: s.id, direction: s.direction_id, prover_model: assignedModel(st, 'prover', s.id), briefing: s.briefing, draft: s.draft, solo: s.solo, abandoned: !!s.abandoned })), cross_done: !!r.cross, accepted: r.accepted } : null,
    rounds_used: st.rounds.length,
    max_rounds: st.config.max_rounds,
    calls_used: st.calls_used,
    budget_calls: st.config.budget_calls,
    calls_by_role: st.calls_by_role,
    priority: st.config.priority,
    pins: st.config.pins,
    single_model: st.config.single_model,
    calls_by_model: st.calls_by_model,
    directions: st.directions,
    accepted_total: st.rounds.flatMap((x) => x.accepted),
    ledger: { verified: ledger.lemmas.filter((l) => l.status === 'verified').map((l) => ({ id: l.id, statement: l.statement })), pending: ledger.lemmas.filter((l) => l.status === 'pending').map((l) => l.id), excluded: ledger.excluded.map((e) => ({ id: e.id, claim: e.claim })) },
    final: st.final,
    ...paths(runDir),
    next: nextStep(runDir, st),
  };
}

function listRuns(a) {
  const workspace = str(a.workspace, 'workspace');
  const dir = path.join(workspace, '.cogentic');
  let names = [];
  try { names = fs.readdirSync(dir); } catch (_) { return { runs: [] }; }
  const runs = names.map((n) => path.join(dir, n)).filter((d) => fs.existsSync(path.join(d, 'state.json'))).map((d) => {
    const st = load(d);
    return { run_dir: d, title: st.title, phase: st.phase, rounds: st.rounds.length, updated: st.updated };
  }).sort((x, y) => (x.updated < y.updated ? 1 : -1));
  return { runs };
}

// ---------- tool table (used by the MCP server and the CLI) ----------

const S = (props, required = []) => ({ type: 'object', properties: props, required });
const RUN = { run_dir: { type: 'string', description: 'Absolute run directory returned by cogentic_init.' } };
const OBJ = { type: 'array', items: { anyOf: [{ type: 'string' }, { type: 'object', properties: { location: { type: 'string' }, issue: { type: 'string' }, severity: { type: 'string', enum: ['fatal', 'major', 'minor'] } }, required: ['issue'] }] } };
const FRAG = { type: 'array', description: 'Steps or lemmas inside the draft that you confirmed correct even if the whole draft fails.', items: { anyOf: [{ type: 'string' }, { type: 'object', properties: { statement: { type: 'string' }, location: { type: 'string' } }, required: ['statement'] }] } };

const TOOLS = {
  cogentic_init: { fn: init, description: 'Orchestrator: create a Cogentic run for one problem. Returns run_dir, which every other tool and every agent brief needs.', schema: S({ workspace: { type: 'string', description: 'Absolute path of the workspace; the run lives in <workspace>/.cogentic/<run_id>/.' }, problem: { type: 'string', description: 'The full problem statement, verbatim from the user.' }, title: { type: 'string' }, max_rounds: { type: 'integer' }, max_provers: { type: 'integer', description: 'Maximum prover slots per round.' }, budget_calls: { type: 'integer', description: 'Budget of agent calls for the whole run (the paper reports O(100)-O(1000)).' }, mode: { type: 'string', enum: ['swarm', 'workflow'] }, priority: { type: 'string', enum: PRIORITIES, description: 'How the orchestrator trades accuracy against speed and quota when it picks models (default balanced).' }, pins: { type: 'object', description: `Optional role -> model id the user insists on. Roles: ${ROLES.join(', ')}.` }, single_model: { type: 'string', description: 'Optional: one model for every agent, as in the paper.' } }, ['workspace', 'problem']) },
  cogentic_status: { fn: status, description: 'Anyone: the run\'s phase, current round, ledger summary, budget, file paths, and the next protocol step.', schema: S(RUN, ['run_dir']) },
  cogentic_list_runs: { fn: listRuns, description: 'List Cogentic runs in a workspace, newest first.', schema: S({ workspace: { type: 'string' } }, ['workspace']) },
  cogentic_charge: { fn: charge, description: 'Orchestrator: record every agent you start: its role, the model you chose for it (any model the swarm lists), its assignment (slot id, r<n>, lemma id, ...) and why that model. Counts against the budget; honours the user\'s pins.', schema: S({ ...RUN, role: { type: 'string', enum: ROLES }, model: { type: 'string' }, assignment: { type: 'string' }, reason: { type: 'string' }, calls: { type: 'integer' } }, ['run_dir', 'role']) },
  cogentic_models: { fn: models, description: 'Orchestrator: everything needed to choose a model: priority, pins, the catalog of model cards (advice), calls per model, and each model\'s outcomes in this run (drafts accepted/rejected, verifier misses).', schema: S(RUN, ['run_dir']) },
  cogentic_add_literature: { fn: addLiterature, description: 'Literature reviewer: save a survey note (definitions, theorems with exact statements and sources, related work, known barriers).', schema: S({ ...RUN, title: { type: 'string' }, content: { type: 'string' }, sources: { type: 'array', items: { type: 'string' } }, reviewer: { type: 'string' } }, ['run_dir', 'title', 'content']) },
  cogentic_open_round: { fn: openRound, description: 'Orchestrator: open the next round with its directions (a specific claim, a counterexample search, or repairing/finalizing a promising proof) and the number of prover slots for each. Reuse a direction by id.', schema: S({ ...RUN, directions: { type: 'array', items: { type: 'object', properties: { id: { type: 'string', description: 'Existing direction id to continue.' }, claim: { type: 'string', description: 'For a new direction: the precise statement to establish or refute.' }, kind: { type: 'string', enum: DIRECTION_KINDS }, provers: { type: 'integer' } } } }, note: { type: 'string' } }, ['run_dir', 'directions']) },
  cogentic_submit_briefing: { fn: submitBriefing, description: 'Summarizer: write the briefing for one prover slot: the most informative prior attempts (by path), what the verifiers objected to, relevant ledger lemmas and literature, and suggested next steps.', schema: S({ ...RUN, slot_id: { type: 'string' }, briefing: { type: 'string' } }, ['run_dir', 'slot_id', 'briefing']) },
  cogentic_submit_draft: { fn: submitDraft, description: 'Prover: submit this slot\'s candidate proof (or counterexample, or honest partial progress).', schema: S({ ...RUN, slot_id: { type: 'string' }, target_claim: { type: 'string', description: 'Exactly what the draft establishes.' }, method: { type: 'string', description: 'One paragraph on the approach.' }, proof: { type: 'string', description: 'The full proof in Markdown + LaTeX.' }, status: { type: 'string', enum: ['complete', 'partial', 'counterexample', 'gave_up'] } }, ['run_dir', 'slot_id', 'target_claim', 'method', 'proof']) },
  cogentic_submit_solo_verdict: { fn: submitSoloVerdict, description: 'Solo verifier: adversarial verdict on one draft. pass only if every step is justified and every citation checked.', schema: S({ ...RUN, slot_id: { type: 'string' }, verdict: { type: 'string', enum: VERDICTS }, objections: OBJ, confirmed_fragments: FRAG, citations_checked: { type: 'array', items: { type: 'string' } } }, ['run_dir', 'slot_id', 'verdict']) },
  cogentic_submit_cross_verdict: { fn: submitCrossVerdict, description: 'Cross verifier: one verdict per draft after reading all of the round\'s drafts side by side, plus shared blind spots and a ranking.', schema: S({ ...RUN, verdicts: { type: 'array', items: { type: 'object', properties: { slot_id: { type: 'string' }, verdict: { type: 'string', enum: VERDICTS }, objections: OBJ, confirmed_fragments: FRAG }, required: ['slot_id', 'verdict'] } }, shared_blind_spots: { type: 'array', items: { type: 'string' } }, ranking: { type: 'array', items: { type: 'string' } } }, ['run_dir', 'verdicts']) },
  cogentic_abandon_slot: { fn: abandonSlot, description: 'Orchestrator: give up on a slot whose prover failed to produce a draft.', schema: S({ ...RUN, slot_id: { type: 'string' }, reason: { type: 'string' } }, ['run_dir', 'slot_id', 'reason']) },
  cogentic_close_round: { fn: closeRound, description: 'Orchestrator: close the round. Accepts exactly the drafts that passed both verifiers, writes the record, and returns confirmed fragments for the auditor.', schema: S(RUN, ['run_dir']) },
  cogentic_read_record: { fn: readRecord, description: 'Anyone: the record pooled by direction: every attempt, its method, verdicts and the objections it failed on.', schema: S({ ...RUN, direction_id: { type: 'string' } }, ['run_dir']) },
  cogentic_propose_lemmas: { fn: proposeLemmas, description: 'Auditor: restate confirmed fragments as self-contained lemmas with proofs (pending isolated verification). Call once per round, with [] if nothing qualifies.', schema: S({ ...RUN, lemmas: { type: 'array', items: { type: 'object', properties: { statement: { type: 'string' }, proof: { type: 'string' }, source_slot: { type: 'string' }, depends_on: { type: 'array', items: { type: 'string' } } }, required: ['statement', 'proof'] } } }, ['run_dir', 'lemmas']) },
  cogentic_lemma_verdict: { fn: lemmaVerdict, description: 'Isolated lemma verifier: verdict on one pending lemma, read on its own. Only passed lemmas enter the ledger.', schema: S({ ...RUN, lemma_id: { type: 'string' }, verdict: { type: 'string', enum: VERDICTS }, objections: OBJ }, ['run_dir', 'lemma_id', 'verdict']) },
  cogentic_mark_excluded: { fn: markExcluded, description: 'Orchestrator: record a dead end in the ledger (e.g. a bound excluded by a verified counterexample). Needs a verified lemma or accepted draft as evidence.', schema: S({ ...RUN, claim: { type: 'string' }, reason: { type: 'string' }, evidence: { type: 'string' }, direction_id: { type: 'string' } }, ['run_dir', 'claim', 'reason', 'evidence']) },
  cogentic_set_instructions: { fn: setInstructions, description: 'Process advisor: after each round, standing instructions for provers and verifiers and allocation advice, from verification logs across the whole run. Process only: no mathematical opinions.', schema: S({ ...RUN, for_provers: { type: 'string' }, for_verifiers: { type: 'string' }, allocation_advice: { type: 'string' }, observations: { type: 'array', items: { type: 'string' } } }, ['run_dir']) },
  cogentic_begin_consolidation: { fn: beginConsolidation, description: 'Orchestrator: stop exploring and consolidate the verified proofs.', schema: S(RUN, ['run_dir']) },
  cogentic_select_best: { fn: selectBest, description: 'Comparator: choose the strongest accepted proof.', schema: S({ ...RUN, slot_id: { type: 'string' }, reason: { type: 'string' } }, ['run_dir', 'slot_id', 'reason']) },
  cogentic_submit_manuscript: { fn: submitManuscript, description: 'Formal writer: the complete self-contained manuscript (theorem, proof, lemmas used, notation, background).', schema: S({ ...RUN, manuscript: { type: 'string' } }, ['run_dir', 'manuscript']) },
  cogentic_submit_audit: { fn: submitAudit, description: 'Final auditor: check the manuscript against the accepted proof and the ledger lemmas it uses.', schema: S({ ...RUN, verdict: { type: 'string', enum: VERDICTS }, objections: OBJ }, ['run_dir', 'verdict']) },
  cogentic_stop: { fn: stop, description: 'Orchestrator: stop the run (budget spent, or the user asked).', schema: S({ ...RUN, reason: { type: 'string' } }, ['run_dir', 'reason']) },
};

function call(name, args) {
  const t = TOOLS[name];
  if (!t) fail(`unknown tool ${name}`);
  return t.fn(args || {});
}

module.exports = { TOOLS, call, CogenticError, VERSION, ROLES };
