// Builds test/fixture.html: a Claude-like DOM with the real payload injected (font stubbed out).
import fs from 'node:fs';
const payload = fs.readFileSync(new URL('../payload/rtl.js', import.meta.url), 'utf8').replace('__FONT_B64__', '');
const html = `<!doctype html><meta charset=utf-8><body style="font:16px sans-serif;width:600px">
<div class="epitaxy-titlebar-end"><button data-cds-icon-only aria-pressed="false" aria-label="Terminal" id="x"><span data-cds="Icon"></span></button><button aria-label="View options"></button></div>
<div id="dv" data-tile-divider role="separator" aria-orientation="vertical" aria-valuenow="50" aria-label="Resize A and B" tabindex="0"></div>
<p id=side>Sidebar item</p>
<button id=ubtn onclick="window.wrongClick = true">Ultracode notes</button>
<div id=chat class="prose" data-cds="Prose">
<p id=fa>سلام، این یک متن فارسی با کلمه‌ی English وسط آن است.</p>
<p id=en>This is English with فارسی inside.</p>
<p id=num>۱۲۳ شروع با عدد فارسی</p>
<ul id=ul-fa><li>مورد اول</li><li>مورد دوم</li></ul>
<ul id=ul-en><li>first</li><li>second</li></ul>
<table id=tbl><tr><td id=td-fa>سلول</td><td id=td-en>cell</td></tr></table>
<p id=native dir="ltr">متن با dir بومی ltr باید دست نخورد</p>
<pre id=pre>const x = "فارسی"; // code</pre>
<p id=inlinecode>متن <code id=ic>foo()</code> کد</p>
<div id=ed contenteditable="true" dir="ltr"><p id=edp>سلام</p></div>
</div>
<button data-cds="ModelSelector" aria-haspopup="menu" aria-expanded="false" id="ms"></button>
<script>
document.getElementById('x').addEventListener('click', (e) => e.currentTarget.setAttribute('aria-pressed', e.currentTarget.getAttribute('aria-pressed') !== 'true'));
document.getElementById('dv').addEventListener('keydown', (e) => { const d = document.getElementById('dv'); const v = +d.getAttribute('aria-valuenow'); d.setAttribute('aria-valuenow', v + (e.key === 'ArrowRight' ? 5 : -5)); });
// Model menu mock: models, an Effort submenu (Low..Max radios) and an Ultracode toggle (main menu, or the submenu if ultraInEffort).
window.effort = 'High'; window.ultra = false;
const ultraItem = () => {
  const u = document.createElement('div'); u.setAttribute('role', 'menuitemcheckbox'); u.setAttribute('aria-checked', String(window.ultra)); u.textContent = 'Ultracode';
  u.addEventListener('click', () => { window.ultra = !window.ultra; });
  return u;
};
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('[role=menu]:not([data-crtl-ui] *, [data-crtl-ui])').forEach((m) => m.remove());
  ms.setAttribute('aria-expanded', 'false');
});
ms.addEventListener('mousedown', () => {
  ms.setAttribute('aria-expanded', 'true');
  const m = document.createElement('div'); m.setAttribute('role', 'menu'); m.setAttribute('data-cds', 'ModelSelector');
  m.innerHTML = '<div role="menuitemradio" data-model-id="claude-haiku-5-5">Haiku</div><div role="menuitemradio" data-model-id="claude-opus-5-5">Opus</div>'
    + '<div role="menuitem" aria-haspopup="menu" id="effrow"><span>Effort</span> <span>' + window.effort + '</span></div>';
  if (!window.ultraInEffort) m.append(ultraItem());
  m.querySelectorAll('[data-model-id]').forEach((i) => i.addEventListener('click', () => { window.picked = i.dataset.modelId; }));
  m.querySelector('#effrow').addEventListener('click', () => {
    if (document.getElementById('effmenu')) return;
    const s = document.createElement('div'); s.setAttribute('role', 'menu'); s.id = 'effmenu';
    s.innerHTML = ['Low', 'Medium', 'High', 'Extra', 'Max'].filter((l) => !(window.noExtra && l === 'Extra')).map((l) => '<div role="menuitemradio" aria-checked="' + (l === window.effort) + '">' + l + '</div>').join('');
    s.querySelectorAll('[role=menuitemradio]').forEach((i) => i.addEventListener('click', () => { window.effort = i.textContent; }));
    if (window.ultraInEffort) s.append(ultraItem());
    document.body.append(s);
  });
  document.body.append(m);
});
</script>
<script>${payload.replace(/<\/script>/g, '<\\/script>')}</script>
<script>setTimeout(()=>{const p=document.createElement('p');p.id='late';p.textContent='پاراگراف دیر رسیده';document.getElementById('chat').append(p)},200)</script>`;
fs.writeFileSync(new URL('./fixture.html', import.meta.url), html);
