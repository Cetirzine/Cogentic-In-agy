'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { call } = require('../mcp/engine.cjs');

const ws = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cogentic-'));
const rejects = (fn, re) => assert.throws(fn, (e) => re.test(e.message));
const init = (extra = {}) => call('cogentic_init', { workspace: ws(), problem: 'Show that every finite group of prime order is cyclic.', title: 'prime order', max_rounds: 3, max_provers: 4, ...extra });

function draft(run, slot, extra = {}) {
  call('cogentic_submit_briefing', { run_dir: run, slot_id: slot, briefing: 'Use Lagrange.' });
  call('cogentic_submit_draft', { run_dir: run, slot_id: slot, target_claim: 'G is cyclic', method: 'Lagrange on <g>', proof: 'Take g != e ...', ...extra });
}

test('a full run: round, verification, ledger, advisor, consolidation', () => {
  const { run_dir: run } = init();
  call('cogentic_add_literature', { run_dir: run, title: 'Lagrange', content: 'Order of a subgroup divides the group order.', sources: ['Herstein, Topics in Algebra'] });
  const r1 = call('cogentic_open_round', { run_dir: run, directions: [{ claim: 'G is cyclic', provers: 2 }] });
  assert.equal(r1.slots.length, 2);
  const [a, b] = r1.slots.map((s) => s.slot_id);
  draft(run, a);
  draft(run, b);
  call('cogentic_submit_solo_verdict', { run_dir: run, slot_id: a, verdict: 'pass' });
  call('cogentic_submit_solo_verdict', { run_dir: run, slot_id: b, verdict: 'fail', objections: [{ issue: 'uses that G is abelian', severity: 'fatal' }], confirmed_fragments: ['every non-identity element generates a subgroup of order p'] });
  call('cogentic_submit_cross_verdict', { run_dir: run, verdicts: [{ slot_id: a, verdict: 'pass' }, { slot_id: b, verdict: 'pass' }], shared_blind_spots: ['none'] });
  const closed = call('cogentic_close_round', { run_dir: run });
  assert.deepEqual(closed.accepted.map((x) => x.slot_id), [a], 'only the draft that passed both verifiers is accepted');
  assert.equal(closed.fragments_for_auditor.length, 1);
  const record = fs.readFileSync(path.join(run, 'record.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(record.find((e) => e.slot === b).outcome, 'rejected');
  assert.equal(record.find((e) => e.slot === b).objections[0].by, 'solo');

  rejects(() => call('cogentic_open_round', { run_dir: run, directions: [{ claim: 'x' }] }), /auditor/);
  const { proposed } = call('cogentic_propose_lemmas', { run_dir: run, lemmas: [{ statement: 'For g != e, |<g>| = p.', proof: 'By Lagrange.', source_slot: b }] });
  call('cogentic_set_instructions', { run_dir: run, for_provers: 'Name the theorem behind every step.' });
  rejects(() => call('cogentic_open_round', { run_dir: run, directions: [{ claim: 'x' }] }), /await isolated verification/);
  call('cogentic_lemma_verdict', { run_dir: run, lemma_id: proposed[0].lemma_id, verdict: 'pass' });
  const st = call('cogentic_status', { run_dir: run });
  assert.equal(st.ledger.verified.length, 1);
  assert.match(st.next, /cleared verification/);

  call('cogentic_begin_consolidation', { run_dir: run });
  rejects(() => call('cogentic_select_best', { run_dir: run, slot_id: b, reason: 'x' }), /not an accepted draft/);
  call('cogentic_select_best', { run_dir: run, slot_id: a, reason: 'only accepted proof' });
  call('cogentic_submit_manuscript', { run_dir: run, manuscript: '# Theorem\n...' });
  rejects(() => call('cogentic_submit_manuscript', { run_dir: run, manuscript: 'again' }), /awaiting its final audit/);
  call('cogentic_submit_audit', { run_dir: run, verdict: 'fail', objections: ['Lemma 1 restated with the wrong hypothesis'] });
  call('cogentic_submit_manuscript', { run_dir: run, manuscript: '# Theorem\nfixed' });
  const done = call('cogentic_submit_audit', { run_dir: run, verdict: 'pass' });
  assert.equal(done.phase, 'done');
  assert.equal(fs.readFileSync(path.join(run, 'final', 'manuscript.md'), 'utf8'), '# Theorem\nfixed');
});

test('protocol order is enforced', () => {
  const { run_dir: run } = init();
  const r = call('cogentic_open_round', { run_dir: run, directions: [{ claim: 'c', provers: 1 }, { claim: 'counterexample to c', kind: 'counterexample', provers: 1 }] });
  const [a, b] = r.slots.map((s) => s.slot_id);
  rejects(() => call('cogentic_submit_draft', { run_dir: run, slot_id: a, target_claim: 'c', method: 'm', proof: 'p' }), /no briefing/);
  draft(run, a);
  rejects(() => call('cogentic_submit_draft', { run_dir: run, slot_id: a, target_claim: 'c', method: 'm', proof: 'p' }), /already has a draft/);
  rejects(() => call('cogentic_submit_cross_verdict', { run_dir: run, verdicts: [{ slot_id: a, verdict: 'pass' }] }), /drafts missing/);
  call('cogentic_abandon_slot', { run_dir: run, slot_id: b, reason: 'prover timed out' });
  rejects(() => call('cogentic_close_round', { run_dir: run }), /solo verdicts missing/);
  rejects(() => call('cogentic_submit_solo_verdict', { run_dir: run, slot_id: a, verdict: 'fail' }), /at least one objection/);
  rejects(() => call('cogentic_submit_solo_verdict', { run_dir: run, slot_id: a, verdict: 'pass', objections: [{ issue: 'gap', severity: 'major' }] }), /only carry minor/);
  call('cogentic_submit_solo_verdict', { run_dir: run, slot_id: a, verdict: 'pass' });
  rejects(() => call('cogentic_close_round', { run_dir: run }), /cross verifier/);
  rejects(() => call('cogentic_submit_cross_verdict', { run_dir: run, verdicts: [] }), /judge every draft/);
  call('cogentic_submit_cross_verdict', { run_dir: run, verdicts: [{ slot_id: a, verdict: 'fail', objections: ['circular'] }] });
  const closed = call('cogentic_close_round', { run_dir: run });
  assert.equal(closed.accepted.length, 0, 'solo pass + cross fail is not accepted');
  call('cogentic_propose_lemmas', { run_dir: run, lemmas: [] });
  rejects(() => call('cogentic_open_round', { run_dir: run, directions: [{ id: 'd1' }] }), /process advisor/);
  rejects(() => call('cogentic_begin_consolidation', { run_dir: run }), /nothing to consolidate/);
  call('cogentic_set_instructions', { run_dir: run, for_provers: 'State every use of commutativity.', observations: ['circular arguments in r1'] });
  assert.match(fs.readFileSync(path.join(run, 'instructions.md'), 'utf8'), /commutativity/);
  const r2 = call('cogentic_open_round', { run_dir: run, directions: [{ id: 'd1', kind: 'repair', provers: 2 }] });
  assert.equal(r2.round, 2);
  assert.ok(r2.slots.every((s) => s.direction_id === 'd1'));
});

test('dead ends need verified evidence; excluded directions cannot be reopened', () => {
  const { run_dir: run } = init();
  const r = call('cogentic_open_round', { run_dir: run, directions: [{ claim: 'bound 2 is tight', provers: 1 }, { claim: 'counterexample to bound 2', kind: 'counterexample', provers: 1 }] });
  const [a, b] = r.slots.map((s) => s.slot_id);
  rejects(() => call('cogentic_mark_excluded', { run_dir: run, claim: 'bound 2', reason: 'cx', evidence: b }), /verified evidence/);
  draft(run, a, { status: 'gave_up' });
  draft(run, b, { status: 'counterexample' });
  call('cogentic_submit_solo_verdict', { run_dir: run, slot_id: a, verdict: 'fail', objections: ['no proof'] });
  call('cogentic_submit_solo_verdict', { run_dir: run, slot_id: b, verdict: 'pass' });
  call('cogentic_submit_cross_verdict', { run_dir: run, verdicts: [{ slot_id: a, verdict: 'fail', objections: ['no proof'] }, { slot_id: b, verdict: 'pass' }] });
  call('cogentic_close_round', { run_dir: run });
  const x = call('cogentic_mark_excluded', { run_dir: run, claim: 'bound 2 is tight', reason: 'verified counterexample', evidence: b, direction_id: 'd1' });
  assert.equal(x.id, 'X1');
  call('cogentic_propose_lemmas', { run_dir: run, lemmas: [] });
  call('cogentic_set_instructions', { run_dir: run });
  rejects(() => call('cogentic_open_round', { run_dir: run, directions: [{ id: 'd1' }] }), /excluded/);
});

test('limits: max provers, max rounds, budget', () => {
  const { run_dir: run } = init({ max_rounds: 1, budget_calls: 10 });
  rejects(() => call('cogentic_open_round', { run_dir: run, directions: [{ claim: 'c', provers: 5 }] }), /max_provers/);
  call('cogentic_charge', { run_dir: run, role: 'prover', model: 'gemini-4-neon-high', calls: 10 });
  rejects(() => call('cogentic_open_round', { run_dir: run, directions: [{ claim: 'c' }] }), /budget/);
  const st = call('cogentic_status', { run_dir: run });
  assert.equal(st.calls_by_role.prover, 10);
});

test('models: free choice, recorded per agent, pins win, outcomes per model', () => {
  const { run_dir: run } = init();
  rejects(() => call('cogentic_charge', { run_dir: run, role: 'prover' }), /which model/);
  // Any model id is accepted: the orchestrator chooses from what the swarm lists, including new ones.
  for (const m of ['gemini-4-hydrogen-low', 'gemini-5-pro-high', 'some-future-model']) call('cogentic_charge', { run_dir: run, role: 'narrator', model: m });
  const r = call('cogentic_open_round', { run_dir: run, directions: [{ claim: 'c', provers: 2 }] });
  const [a, b] = r.slots.map((s) => s.slot_id);
  call('cogentic_charge', { run_dir: run, role: 'prover', model: 'gemini-4-carbon-high', assignment: a, reason: 'deepest' });
  call('cogentic_charge', { run_dir: run, role: 'prover', model: 'gemini-4-neon-high', assignment: b, reason: 'diversity' });
  call('cogentic_charge', { run_dir: run, role: 'solo_verifier', model: 'gemini-4-neon-high', assignment: a });
  call('cogentic_charge', { run_dir: run, role: 'solo_verifier', model: 'gemini-4-carbon-high', assignment: b });
  call('cogentic_charge', { run_dir: run, role: 'cross_verifier', model: 'gemini-4-neon-xhigh', assignment: 'r1' });
  draft(run, a); draft(run, b);
  call('cogentic_submit_solo_verdict', { run_dir: run, slot_id: a, verdict: 'pass' });
  call('cogentic_submit_solo_verdict', { run_dir: run, slot_id: b, verdict: 'fail', objections: ['gap'] });
  call('cogentic_submit_cross_verdict', { run_dir: run, verdicts: [{ slot_id: a, verdict: 'fail', objections: [{ issue: 'wrong lemma', severity: 'fatal' }] }, { slot_id: b, verdict: 'fail', objections: ['gap'] }] });
  call('cogentic_close_round', { run_dir: run });
  const rec = fs.readFileSync(path.join(run, 'record.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(rec.find((e) => e.slot === a).prover_model, 'gemini-4-carbon-high');
  assert.equal(rec.find((e) => e.slot === a).solo_model, 'gemini-4-neon-high');
  assert.equal(rec.find((e) => e.slot === a).cross_model, 'gemini-4-neon-xhigh');
  const m = call('cogentic_models', { run_dir: run });
  assert.equal(m.outcomes_by_model['gemini-4-carbon-high'].prover.rejected, 1);
  assert.equal(m.outcomes_by_model['gemini-4-neon-high'].solo_verifier.missed, 1, 'solo passed what cross failed fatally');
  assert.ok(m.catalog.families.carbon && m.catalog.roles.prover, 'catalog is advice served to the orchestrator');
  assert.equal(m.calls_by_model['gemini-4-neon-high'], 2);

  const pinned = init({ pins: { final_auditor: 'gemini-4-carbon-high' } }).run_dir;
  rejects(() => call('cogentic_charge', { run_dir: pinned, role: 'final_auditor', model: 'gemini-4-neon-high' }), /pinned/);
  call('cogentic_charge', { run_dir: pinned, role: 'final_auditor', model: 'gemini-4-carbon-high' });
  call('cogentic_charge', { run_dir: pinned, role: 'prover', model: 'gemini-4-neon-high' });
  const single = init({ single_model: 'gemini-4-carbon-high' }).run_dir;
  rejects(() => call('cogentic_charge', { run_dir: single, role: 'summarizer', model: 'gemini-4-hydrogen-low' }), /pinned/);
  rejects(() => init({ pins: { painter: 'x' } }), /unknown role/);
  rejects(() => init({ priority: 'cheap' }), /priority/);
  // Workflow mode cannot pick models: agents inherit, so no model is required.
  const wf = init({ mode: 'workflow' }).run_dir;
  call('cogentic_charge', { run_dir: wf, role: 'prover' });
});

test('concurrent writers do not lose updates', async () => {
  const { run_dir: run } = init({ budget_calls: 100000 });
  const cli = path.join(__dirname, '..', 'mcp', 'cogentic.cjs');
  const one = () => new Promise((res, rej) => {
    const p = spawn(process.execPath, [cli, 'cli', 'cogentic_charge', JSON.stringify({ run_dir: run, role: 'prover', model: 'gemini-4-carbon-high' })]);
    p.on('exit', (c) => (c === 0 ? res() : rej(new Error(`exit ${c}`))));
  });
  await Promise.all(Array.from({ length: 16 }, one));
  assert.equal(call('cogentic_status', { run_dir: run }).calls_used, 16);
});

test('MCP stdio: initialize, tools/list, tools/call, errors', async () => {
  const workspace = ws();
  const p = spawn(process.execPath, [path.join(__dirname, '..', 'mcp', 'cogentic.cjs')]);
  const lines = [];
  let buf = '';
  p.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { lines.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); } });
  const send = (m) => p.stdin.write(JSON.stringify(m) + '\n');
  send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } });
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'cogentic_init', arguments: { workspace, problem: 'p' } } });
  send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'cogentic_close_round', arguments: { run_dir: '/nope' } } });
  send({ jsonrpc: '2.0', id: 5, method: 'nope' });
  await new Promise((r) => { const t = setInterval(() => { if (lines.length >= 5) { clearInterval(t); r(); } }, 10); });
  p.stdin.end();
  const by = Object.fromEntries(lines.map((l) => [l.id, l]));
  assert.equal(by[1].result.protocolVersion, '2025-06-18');
  assert.ok(by[2].result.tools.length >= 20);
  assert.ok(by[2].result.tools.every((t) => t.inputSchema.type === 'object' && /^cogentic_/.test(t.name)));
  assert.ok(fs.existsSync(path.join(by[3].result.structuredContent.run_dir, 'state.json')));
  assert.equal(by[4].result.isError, true);
  assert.equal(by[5].error.code, -32601);
});
