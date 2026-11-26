'use strict';
// Static checks of the plugin against Antigravity's documented formats, so that mistakes found in
// live runs (a worker that was not a subagent, unmapped tool names, unknown fields) cannot return.
// Sources: antigravity.google/docs/subagents, /docs/build-plugins, /docs/mcp, /docs/dynamic-workflows.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// Minimal YAML frontmatter reader for the shapes this plugin uses (scalars, inline and block lists).
function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(m, 'file starts with YAML frontmatter');
  const out = {};
  let key = null;
  for (const line of m[1].split('\n')) {
    if (/^\s*$/.test(line) || /^\s*#/.test(line)) continue;
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && key) { out[key].push(unquote(item[1])); continue; }
    const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (kv) {
      key = kv[1];
      const v = kv[2].trim();
      if (v === '' || v === '>-' || v === '>' || v === '|') out[key] = v === '' ? [] : '';
      else if (v.startsWith('[')) out[key] = v.slice(1, -1).split(',').map((x) => unquote(x.trim())).filter(Boolean);
      else out[key] = v === 'true' ? true : v === 'false' ? false : unquote(v);
      continue;
    }
    if (key && typeof out[key] === 'string') out[key] += (out[key] ? ' ' : '') + line.trim();
  }
  return out;
}
const unquote = (s) => s.replace(/^["']|["']$/g, '');

// Documented agent frontmatter fields (/docs/subagents, /docs/build-plugins).
const AGENT_FIELDS = new Set(['name', 'description', 'tools', 'mainAgent', 'subagent', 'model', 'commandExecutionPolicy', 'mcpServers', 'skills', 'plugins', 'inheritMcp', 'inheritCustomizations']);
// Tool names documented by Antigravity or used by Google's own shipped agents. An unmapped name
// "may cause the subagent process to hang" (/docs/subagents, known issues).
const KNOWN_TOOLS = new Set(['view_file', 'list_dir', 'grep_search', 'find_by_name', 'write_to_file', 'replace_file_content', 'run_command', 'search_web', 'call_mcp_tool', 'finish', 'send_message', 'invoke_subagent', 'define_subagent']);
const PLUGIN_FIELDS = new Set(['name', 'displayName', 'description', 'logo', 'suggestedPrompts', 'version', 'author', 'homepage', 'repository', 'disabled']);

test('plugin.json has only fields the loader reads', () => {
  const p = JSON.parse(read('plugin.json'));
  for (const k of Object.keys(p)) assert.ok(PLUGIN_FIELDS.has(k), `unknown plugin.json field ${k} (silently discarded)`);
  assert.equal(p.name, 'cogentic');
  assert.ok(!p.logo || fs.existsSync(path.join(root, p.logo)), 'logo path exists');
  assert.ok((p.suggestedPrompts || []).length <= 3);
});

test('agents: documented fields, subagent-invocable, mapped tools, valid enums', () => {
  const dir = path.join(root, 'agents');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  assert.ok(files.length >= 1);
  for (const f of files) {
    const fm = frontmatter(read(path.join('agents', f)));
    for (const k of Object.keys(fm)) assert.ok(AGENT_FIELDS.has(k), `${f}: undocumented field ${k}`);
    assert.equal(fm.name, f.replace(/\.md$/, ''), `${f}: name matches the file name`);
    assert.ok(fm.description && fm.description.length > 20, `${f}: description`);
    assert.ok(Array.isArray(fm.tools) && fm.tools.length, `${f}: explicit tools list`);
    for (const t of fm.tools) assert.ok(KNOWN_TOOLS.has(t), `${f}: tool ${t} is not a documented/known Antigravity tool name`);
    assert.ok(fm.tools.includes('finish'), `${f}: workflow agents return through finish`);
    assert.ok(fm.tools.includes('call_mcp_tool'), `${f}: needs call_mcp_tool for lazily loaded plugin MCP tools`);
    if (fm.model !== undefined) assert.ok(['inherit', 'flash_lite', 'flash', 'pro'].includes(fm.model), `${f}: model`);
    if (fm.commandExecutionPolicy !== undefined) assert.ok(['off', 'auto', 'eager', 'sandbox'].includes(fm.commandExecutionPolicy), `${f}: commandExecutionPolicy`);
    assert.notEqual(fm.model, 'inherit', `${f}: must not inherit the conversation's (possibly planner+executor) model`);
  }
  const worker = frontmatter(read('agents/cogentic-worker.md'));
  assert.equal(worker.subagent, true, 'run_workflow only resolves agents that may be invoked as subagents');
  assert.notEqual(worker.inheritMcp, false, 'the worker needs the plugin MCP server');
});

test('workflow script uses the shipped worker and never inherits the model by default', () => {
  const src = read('skills/cogentic/workflow/cogentic_workflow.py');
  const type = src.match(/args\.get\("agent_type", "([^"]+)"\)/)[1];
  assert.ok(fs.existsSync(path.join(root, 'agents', `${type}.md`)), `default agent_type ${type} ships with the plugin`);
  const tier = src.match(/args\.get\("model_tier", "([^"]+)"\)/)[1];
  assert.notEqual(tier, 'inherit');
  assert.ok(!/type_name="self"/.test(src), 'no hard-coded self agents');
  assert.ok(/allow_self_fallback/.test(src), 'self fallback is opt-in');
});

test('skills: frontmatter, names match folders, relative links resolve', () => {
  const skills = path.join(root, 'skills');
  for (const name of fs.readdirSync(skills)) {
    const file = path.join(skills, name, 'SKILL.md');
    const text = fs.readFileSync(file, 'utf8');
    const fm = frontmatter(text);
    assert.equal(fm.name, name, `${name}: frontmatter name matches the folder`);
    assert.ok(fm.description && fm.description.length > 40, `${name}: description`);
  }
  const md = [];
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith('.md')) md.push(p); } })(skills);
  for (const file of md) {
    for (const [, link] of fs.readFileSync(file, 'utf8').matchAll(/\]\(([^)#\s]+)\)/g)) {
      if (/^[a-z]+:/.test(link)) continue;
      assert.ok(fs.existsSync(path.resolve(path.dirname(file), link)), `${path.relative(root, file)}: broken link ${link}`);
    }
  }
});

test('mcp_config: bundled runtime, entry point exists relative to the plugin root', () => {
  const cfg = JSON.parse(read('mcp_config.json'));
  const servers = Object.entries(cfg.mcpServers);
  assert.equal(servers.length, 1);
  const [key, s] = servers[0];
  assert.equal(`cogentic_${key}`, 'cogentic_cogentic', 'skills and the worker refer to the namespaced server cogentic_cogentic');
  assert.equal(s.command, 'agy-node');
  assert.ok(fs.existsSync(path.join(root, s.args[0])), 'MCP entry point exists');
});

test('docs that name the MCP server use its namespaced name', () => {
  for (const f of ['agents/cogentic-worker.md', 'skills/cogentic/SKILL.md', 'skills/cogentic-roles/SKILL.md']) {
    assert.ok(read(f).includes('cogentic_cogentic'), `${f} names the server cogentic_cogentic`);
    assert.ok(read(f).includes('call_mcp_tool'), `${f} explains call_mcp_tool`);
  }
});
