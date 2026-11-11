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
assert.equal(d('side'), 'auto', 'force RTL leaves non-chat UI on auto');
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
// Effort: Alt+5..9 pick a level, Alt+−/+ step one level and stop at the ends, Alt+0 toggles Ultracode.
const alt = async (code, shiftKey = false, repeat = false) => {
  doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', { code, altKey: true, shiftKey, repeat, bubbles: true }));
  await new Promise((r) => setTimeout(r, 400));
};
await alt('Digit5'); assert.equal(dom.window.effort, 'Low', 'Alt+5 Low');
await alt('Minus'); assert.equal(dom.window.effort, 'Low', 'Alt+- stops at Low');
await alt('Equal'); assert.equal(dom.window.effort, 'Medium', 'Alt+= steps up');
await alt('Equal', true); assert.equal(dom.window.effort, 'High', 'Alt+Shift+= (+) steps up');
await alt('Digit9'); assert.equal(dom.window.effort, 'Max', 'Alt+9 Max');
await alt('Equal'); assert.equal(dom.window.effort, 'Max', 'Alt+= stops at Max');
await alt('Minus'); assert.equal(dom.window.effort, 'Extra', 'Alt+- steps down');
await alt('Digit0'); assert.equal(dom.window.ultra, true, 'Alt+0 turns Ultracode on');
await alt('Digit0', false, true); assert.equal(dom.window.ultra, true, 'held Alt+0 (key repeat) does not re-toggle');
assert.equal(dom.window.wrongClick, undefined, 'a non-menu button titled Ultracode is never clicked');
dom.window.ultraInEffort = true;
await alt('Digit0'); assert.equal(dom.window.ultra, false, 'Alt+0 also finds the toggle in the Effort submenu');
assert.equal(doc.querySelector('[data-cds=ModelSelector][role=menu], #effmenu'), null, 'menus closed afterwards');
// A model without Extra: stepping skips the missing level instead of getting stuck.
dom.window.noExtra = true;
await alt('Digit7'); await alt('Equal'); assert.equal(dom.window.effort, 'Max', 'High + step skips missing Extra');
await alt('Minus'); assert.equal(dom.window.effort, 'High', 'Max - step skips missing Extra');
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
// Copy settings exports everything (including the saved layout tree) for settings.json on a new machine.
let copied = '';
Object.defineProperty(dom.window.navigator, 'clipboard', { value: { writeText: async (x) => { copied = x; } }, configurable: true });
panel.querySelector('[data-act=copy]').click();
await new Promise((r) => setTimeout(r, 100));
assert.ok(JSON.parse(copied).layout.tree, 'copied settings include the layout tree');
assert.match(panel.querySelector('[data-k=layoutStatus]').textContent, /Settings copied/);
console.log('ok');
