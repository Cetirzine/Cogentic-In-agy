'use strict';
// The copy install path, used when only the Antigravity desktop app (no agy CLI) is installed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const win = process.platform === 'win32';

function install(pluginsDir) {
  const env = { ...process.env, COGENTIC_PLUGINS_DIR: pluginsDir };
  const r = win
    ? spawnSync('pwsh', ['-NoProfile', '-File', path.join(root, 'scripts', 'install.ps1'), '-Copy'], { env, encoding: 'utf8' })
    : spawnSync('sh', [path.join(root, 'scripts', 'install.sh'), '--copy'], { env, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

test('copy install: complete plugin, no tests or VCS, update in place', () => {
  const plugins = fs.mkdtempSync(path.join(os.tmpdir(), 'cogentic-plugins-'));
  const first = install(plugins);
  assert.equal(first.code, 0, first.out);
  const target = path.join(plugins, 'cogentic');
  for (const f of ['plugin.json', 'mcp_config.json', 'mcp/cogentic.cjs', 'mcp/engine.cjs', 'agents/cogentic-worker.md', 'models/catalog.json', 'skills/cogentic/SKILL.md', 'skills/cogentic/workflow/cogentic_workflow.py', 'skills/cogentic-roles/roles/prover.md']) {
    assert.ok(fs.existsSync(path.join(target, f)), `${f} installed`);
  }
  for (const f of ['tests', '.git', '.github']) assert.ok(!fs.existsSync(path.join(target, f)), `${f} not installed`);
  fs.writeFileSync(path.join(target, 'stale.txt'), 'from an old version');
  const second = install(plugins);
  assert.equal(second.code, 0, second.out);
  assert.ok(!fs.existsSync(path.join(target, 'stale.txt')), 'an update replaces the old copy');
  assert.deepEqual(fs.readdirSync(plugins).filter((n) => n.startsWith('.cogentic')), [], 'no staging leftovers');
});

test('copy install refuses to replace a different plugin', () => {
  const plugins = fs.mkdtempSync(path.join(os.tmpdir(), 'cogentic-plugins-'));
  fs.mkdirSync(path.join(plugins, 'cogentic'));
  fs.writeFileSync(path.join(plugins, 'cogentic', 'plugin.json'), '{"name": "someone-else"}');
  const r = install(plugins);
  assert.notEqual(r.code, 0);
  assert.equal(fs.readFileSync(path.join(plugins, 'cogentic', 'plugin.json'), 'utf8'), '{"name": "someone-else"}');
});
