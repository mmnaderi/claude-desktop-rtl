#!/usr/bin/env node
// Builds ~/Applications/Claude-RTL.app: a patched COPY of Claude.app. The original is never touched.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as asar from '@electron/asar';
import { flipFuses, FuseVersion, FuseV1Options } from '@electron/fuses';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.env.CLAUDE_APP || '/Applications/Claude.app';
const DEST = process.env.CLAUDE_RTL_DEST || path.join(os.homedir(), 'Applications', 'Claude-RTL.app');
// Preloads that run inside claude.ai pages. The main-process entry must stay untouched.
const TARGETS = ['mainView.js', 'quickWindow.js'];
const START = '// --- CLAUDE RTL PATCH START ---';

const run = (cmd, args, opts) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'], ...opts }).toString();
const step = (m) => console.log(`• ${m}`);
const die = (m) => { console.error(`✖ ${m}`); process.exit(1); };

function uninstall() {
  try { run('pkill', ['-f', `${DEST}/Contents/MacOS/`]); } catch {}
  fs.rmSync(DEST, { recursive: true, force: true });
  console.log('Removed', DEST);
}

// Optional settings.json in the repo root seeds the panel defaults (font, line height, layout lock, ...).
// Values already saved in the app's localStorage still win, so re-running never overwrites a user's choices.
function readSeed() {
  const f = path.join(root, 'settings.json');
  if (!fs.existsSync(f)) return {};
  try {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error();
    return j;
  } catch { throw new Error('settings.json is not a valid JSON object'); }
}

async function check() {
  const rows = [];
  const add = (name, pass, detail = '') => rows.push([name, pass, detail]);
  add('macOS', process.platform === 'darwin', process.platform);
  add('Node >= 20', +process.versions.node.split('.')[0] >= 20, process.version);
  for (const b of ['/usr/bin/codesign', '/usr/libexec/PlistBuddy', '/bin/cp']) add(path.basename(b), fs.existsSync(b), b);
  const hasSrc = fs.existsSync(SRC);
  add('Claude installed', hasSrc, SRC);
  if (hasSrc) {
    try { add('Claude version', true, run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', path.join(SRC, 'Contents/Info.plist')]).trim()); } catch { add('Claude version', false, 'Info.plist unreadable'); }
    const asarPath = path.join(SRC, 'Contents/Resources/app.asar');
    for (const t of TARGETS) {
      try { asar.extractFile(asarPath, `.vite/build/${t}`); add(`patch target ${t}`, true); } catch { add(`patch target ${t}`, false, 'missing in app.asar: this patcher needs an update for this Claude version'); }
    }
  }
  const parent = path.dirname(DEST);
  try { fs.mkdirSync(parent, { recursive: true }); fs.accessSync(parent, fs.constants.W_OK); add('Install dir writable', true, parent); } catch { add('Install dir writable', false, parent); }
  try {
    const freeGB = +run('df', ['-k', parent]).trim().split('\n').pop().split(/\s+/)[3] / 1048576;
    add('Free disk >= 2 GB', freeGB >= 2, `${freeGB.toFixed(1)} GB`);
  } catch { add('Free disk >= 2 GB', false, 'df failed'); }
  try { readSeed(); add('settings.json', true, fs.existsSync(path.join(root, 'settings.json')) ? 'found' : 'none (panel defaults)'); } catch (e) { add('settings.json', false, e.message); }
  for (const [name, pass, detail] of rows) console.log(`${pass ? '✔' : '✖'} ${name}${detail ? `: ${detail}` : ''}`);
  const bad = rows.some((r) => !r[1]);
  console.log(bad ? '\nNot ready: fix the ✖ items above.' : '\nReady: run `node bin/claude-rtl.mjs` to install.');
  process.exit(bad ? 1 : 0);
}

async function install() {
  if (process.platform !== 'darwin') die('macOS only.');
  if (!fs.existsSync(SRC)) die(`Claude not found at ${SRC}`);
  uninstall();

  step('Copying Claude.app');
  fs.mkdirSync(path.dirname(DEST), { recursive: true });
  run('cp', ['-R', SRC, DEST]);

  const plist = path.join(DEST, 'Contents/Info.plist');
  const pb = (c) => { try { run('/usr/libexec/PlistBuddy', ['-c', c, plist]); } catch {} };
  pb('Delete :CFBundleIconName'); // otherwise the asset-catalog icon wins
  // A distinct bundle ID makes notification clicks and deep links open this copy, not /Applications/Claude.app.
  pb('Set :CFBundleIdentifier com.anthropic.claudefordesktop.rtl');
  pb('Add :CFBundleDisplayName string Claude-RTL');
  pb('Set :CFBundleDisplayName Claude-RTL');

  step('Patching app.asar');
  const asarPath = path.join(DEST, 'Contents/Resources/app.asar');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-rtl-'));
  try {
    const dir = path.join(tmp, 'app');
    asar.extractAll(asarPath, dir);
    const font = fs.readFileSync(path.join(root, 'fonts/Vazirmatn-Variable.woff2')).toString('base64');
    const payload = fs.readFileSync(path.join(root, 'payload/rtl.js'), 'utf8')
      .replace('__FONT_B64__', font)
      .replace('{/*__SEED__*/}', () => JSON.stringify(readSeed()));
    for (const t of TARGETS) {
      const f = path.join(dir, '.vite/build', t);
      if (!fs.existsSync(f)) throw new Error(`${t} missing: Claude's layout changed, this patcher needs an update.`);
      const code = fs.readFileSync(f, 'utf8');
      if (!code.includes(START)) fs.writeFileSync(f, `${payload}\n${code}`);
    }
    // Keep native binaries unpacked, as in the original archive.
    await asar.createPackageWithOptions(dir, asarPath, { unpack: '{**/*.node,**/*.dylib,**/github-mcp-server,**/spawn-helper}' });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  step('Disabling ASAR integrity check (fuse)');
  await flipFuses(DEST, { version: FuseVersion.V1, [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false });

  step('Ad-hoc signing');
  const ent = path.join(os.tmpdir(), `claude-rtl-${process.pid}.plist`);
  fs.writeFileSync(ent, run('codesign', ['-d', '--entitlements', ':-', SRC]));
  // Keys tied to Anthropic's team ID are rejected under an ad-hoc signature.
  for (const k of ['com.apple.application-identifier', 'com.apple.developer.team-identifier', 'keychain-access-groups']) {
    try { run('/usr/libexec/PlistBuddy', ['-c', `Delete :${k}`, ent]); } catch {}
  }
  run('codesign', ['--force', '--deep', '--sign', '-', '--entitlements', ent, DEST]);
  fs.rmSync(ent, { force: true });

  // Same switch as Help > Enable Developer Mode (shared profile, so it also applies to the original app).
  const dev = path.join(os.homedir(), 'Library/Application Support/Claude/developer_settings.json');
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(dev, 'utf8')); } catch {}
  fs.mkdirSync(path.dirname(dev), { recursive: true });
  fs.writeFileSync(dev, JSON.stringify({ ...cfg, allowDevTools: true }));

  console.log(`\n✔ Done: ${DEST}\n  Quit Claude first if it is running, then open Claude-RTL.\n  DevTools: right-click > Inspect Element.\n  First launch: allow the Keychain prompt and (if asked) notifications for Claude-RTL.`);
}

const arg = process.argv[2];
if (arg === '--uninstall' || arg === '-u') uninstall();
else if (arg === '--check') check();
else if (!arg || arg === '--install') install().catch((e) => { fs.rmSync(DEST, { recursive: true, force: true }); die(e.message); });
else console.log('Usage: claude-rtl [--check | --install | --uninstall]\nEnv: CLAUDE_APP (source app), CLAUDE_RTL_DEST (output app)');
