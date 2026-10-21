// Builds test/fixture.html: a Claude-like DOM with the real payload injected (font stubbed out).
import fs from 'node:fs';
const payload = fs.readFileSync(new URL('../payload/rtl.js', import.meta.url), 'utf8').replace('__FONT_B64__', '');
const html = `<!doctype html><meta charset=utf-8><body style="font:16px sans-serif;width:600px">
<div class="epitaxy-titlebar-end"><button data-cds-icon-only aria-pressed="false" aria-label="Terminal" id="x"><span data-cds="Icon"></span></button><button aria-label="View options"></button></div>
<div id="dv" data-tile-divider role="separator" aria-orientation="vertical" aria-valuenow="50" aria-label="Resize A and B" tabindex="0"></div>
<div id=chat>
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
ms.addEventListener('mousedown', () => {
  ms.setAttribute('aria-expanded', 'true');
  const m = document.createElement('div'); m.setAttribute('role', 'menu'); m.setAttribute('data-cds', 'ModelSelector');
  m.innerHTML = '<div role="menuitemradio" data-model-id="claude-haiku-5-5">Haiku</div><div role="menuitemradio" data-model-id="claude-opus-5-5">Opus</div>';
  m.querySelectorAll('[data-model-id]').forEach((i) => i.addEventListener('click', () => { window.picked = i.dataset.modelId; }));
  document.body.append(m);
});
</script>
<script>${payload.replace(/<\/script>/g, '<\\/script>')}</script>
<script>setTimeout(()=>{const p=document.createElement('p');p.id='late';p.textContent='پاراگراف دیر رسیده';document.getElementById('chat').append(p)},200)</script>`;
fs.writeFileSync(new URL('./fixture.html', import.meta.url), html);
