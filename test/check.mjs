import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import './build-fixture.mjs';

const dom = new JSDOM(fs.readFileSync(new URL('./fixture.html', import.meta.url), 'utf8'), { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' });
await new Promise((r) => setTimeout(r, 500));
const d = (id) => dom.window.document.getElementById(id).getAttribute('dir');
for (const id of ['fa', 'en', 'ul-fa', 'td-fa', 'ed', 'edp', 'late']) assert.equal(d(id), 'auto', id);
assert.equal(d('native'), 'ltr', 'native dir must be kept');
for (const id of ['pre', 'ic']) assert.equal(d(id), null, id);
const doc = dom.window.document;
const btn = doc.querySelector('[aria-label="RTL settings"]');
assert.ok(btn, 'titlebar button');
assert.equal(btn.previousElementSibling.getAttribute('aria-label'), 'View options');
btn.click();
const panel = doc.querySelector('.crtl-panel');
assert.equal(panel.hidden, false, 'panel opens');
panel.querySelector('[data-key=enabled]').click();
assert.equal(d('fa'), null, 'disable removes dir');
assert.equal(d('native'), 'ltr');
assert.equal(d('ed'), 'ltr', 'input native dir restored');
panel.querySelector('[data-key=enabled]').click();
panel.querySelector('[data-key=force]').click();
assert.equal(d('en'), 'rtl', 'force RTL');
// Force RTL must override Claude's own dir attribute, and releasing it must restore it.
assert.equal(d('native'), 'rtl', 'force overrides native dir');
panel.querySelector('[data-key=force]').click();
assert.equal(d('native'), 'ltr', 'native dir restored after force off');
// The panel switch turns the shortcuts off.
panel.querySelector('[data-key=keys]').click();
doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', { code: 'Digit1', altKey: true, bubbles: true }));
await new Promise((r) => setTimeout(r, 300));
assert.equal(dom.window.picked, undefined, 'shortcuts off');
panel.querySelector('[data-key=keys]').click();
// Alt+1 picks the Haiku entry of Claude's model menu (by data-model-id family, not label or position).
doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', { code: 'Digit1', altKey: true, bubbles: true }));
await new Promise((r) => setTimeout(r, 300));
assert.equal(dom.window.picked, 'claude-haiku-5-5', 'Alt+1 selects Haiku');
// Layout lock. Saved tree differs from the live one -> write it under the active session and reload once.
const ls = dom.window.localStorage, tree = (n) => ({ root: { kind: 'stack', id: 's', direction: 'row', flex: 1, children: [{ kind: 'tile', tileId: 'chat', flex: 1 }, ...(n > 1 ? [{ kind: 'tile', tileId: 'terminal', flex: 2 }] : [])] } });
const setStore = (n) => ls.setItem('epitaxy.sidePaneStore.v1', JSON.stringify({ state: { tileLayout: tree(n), tileLayoutBySession: {} }, version: 1 }));
ls.setItem('desktop-frame.paneStore.v1', JSON.stringify({ state: { lastPrimaryCodeSession: { id: 'local_x' } } }));
let reloads = 0; dom.window.__claudeRtlReload = () => reloads++;
const term = doc.getElementById('x'), dv = doc.getElementById('dv');
setStore(2);
panel.querySelector('[data-act=save]').click();
await new Promise((r) => setTimeout(r, 1500));
assert.match(panel.querySelector('[data-k=layoutStatus]').textContent, /Saved.*full tree/);
setStore(1);
panel.querySelector('[data-act=apply]').click();
await new Promise((r) => setTimeout(r, 500));
const injected = JSON.parse(ls.getItem('epitaxy.sidePaneStore.v1')).state;
assert.equal(reloads, 1, 'reload requested once');
assert.equal(injected.tileLayout.root.children.length, 2, 'saved tree injected');
assert.equal(injected.tileLayoutBySession.local_x.root.children.length, 2, 'injected under the active session');
// Tree already matches (e.g. after the reload) -> only the buttons and splitters are verified.
term.click(); dv.setAttribute('aria-valuenow', '20');
assert.equal(term.getAttribute('aria-pressed'), 'true');
panel.querySelector('[data-act=apply]').click();
await new Promise((r) => setTimeout(r, 7000));
assert.equal(reloads, 1, 'no second reload when the tree matches');
assert.equal(term.getAttribute('aria-pressed'), 'false', 'layout lock closes the pane again');
assert.equal(dv.getAttribute('aria-valuenow'), '50', 'layout lock restores the splitter');
assert.match(panel.querySelector('[data-k=layoutStatus]').textContent, /splitters 1\/1/);
console.log('ok');
