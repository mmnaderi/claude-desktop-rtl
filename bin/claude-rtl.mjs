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
const DEST = path.join(os.homedir(), 'Applications', 'Claude-RTL.app');
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
    const payload = fs.readFileSync(path.join(root, 'payload/rtl.js'), 'utf8').replace('__FONT_B64__', font);
    for (const t of TARGETS) {
      const f = path.join(dir, '.vite/build', t);
      if (!fs.existsSync(f)) die(`${t} missing: Claude's layout changed, this patcher needs an update.`);
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

  console.log(`\n✔ Done: ${DEST}\n  Quit Claude first if it is running, then open Claude-RTL.\n  DevTools: right-click > Inspect Element.`);
}

const arg = process.argv[2];
if (arg === '--uninstall' || arg === '-u') uninstall();
else if (!arg || arg === '--install') install().catch((e) => die(e.message));
else console.log('Usage: claude-rtl [--install | --uninstall]');
