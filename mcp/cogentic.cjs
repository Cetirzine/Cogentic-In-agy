#!/usr/bin/env node
'use strict';
// Cogentic MCP server (stdio, newline-delimited JSON-RPC 2.0) and CLI.
//   MCP:  agy-node mcp/cogentic.cjs            (started by agy from the plugin's mcp_config.json)
//   CLI:  node mcp/cogentic.cjs cli <tool> '<json args>'   (prints the tool's JSON result)
// No dependencies: it runs on the Node runtime bundled with Antigravity CLI.

const { TOOLS, call, CogenticError, VERSION } = require('./engine.cjs');

const SERVER = { name: 'cogentic', version: `0.1.0+state${VERSION}` };
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];

function runTool(name, args) {
  try {
    return { ok: true, value: call(name, args) };
  } catch (e) {
    // "[cogentic]" marks errors from the engine itself, so a caller can tell a protocol error
    // apart from a host that cannot reach the tool.
    if (e instanceof CogenticError) return { ok: false, error: `[cogentic] ${e.message}` };
    return { ok: false, error: `[cogentic] internal error: ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}` };
  }
}

if (process.argv[2] === 'cli') {
  const [name, raw] = process.argv.slice(3);
  let args = {};
  try { args = raw ? JSON.parse(raw) : {}; } catch (e) { console.error(`bad JSON args: ${e.message}`); process.exit(2); }
  const r = runTool(name, args);
  if (!r.ok) { console.error(r.error); process.exit(1); }
  process.stdout.write(JSON.stringify(r.value, null, 2) + '\n');
  process.exit(0);
}

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
const error = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

function handle(msg) {
  const { id, method, params } = msg;
  const isRequest = id !== undefined && id !== null;
  switch (method) {
    case 'initialize': {
      const asked = params && params.protocolVersion;
      reply(id, {
        protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER,
        instructions: 'State tools for a Cogentic proof-discovery run (arXiv:2609.40324). Every tool except cogentic_init and cogentic_list_runs takes the absolute run_dir that cogentic_init returned. Use only the tools your role brief names. cogentic_status tells anyone the next protocol step.',
      });
      return;
    }
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return;
    case 'ping':
      if (isRequest) reply(id, {});
      return;
    case 'tools/list':
      reply(id, { tools: Object.entries(TOOLS).map(([name, t]) => ({ name, description: t.description, inputSchema: t.schema })) });
      return;
    case 'tools/call': {
      const name = params && params.name;
      if (!TOOLS[name]) { error(id, -32602, `unknown tool ${name}`); return; }
      const r = runTool(name, (params && params.arguments) || {});
      reply(id, r.ok
        ? { content: [{ type: 'text', text: JSON.stringify(r.value, null, 2) }], structuredContent: r.value }
        : { content: [{ type: 'text', text: `Error: ${r.error}` }], isError: true });
      return;
    }
    default:
      if (isRequest) error(id, -32601, `method not found: ${method}`);
  }
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (_) { error(null, -32700, 'parse error'); continue; }
    if (Array.isArray(msg)) msg.forEach(handle); else handle(msg);
  }
});
process.stdin.on('end', () => process.exit(0));
