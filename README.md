# claude-rtl

RTL (Persian / Arabic / Hebrew) for Claude Desktop on macOS. It builds a patched **copy** at `~/Applications/Claude-RTL.app`; `/Applications/Claude.app` is never modified.

```bash
npm install
node bin/claude-rtl.mjs              # build the copy
node bin/claude-rtl.mjs --uninstall  # delete it
npm test
```

Quit Claude before opening Claude-RTL (same profile, single instance). Re-run after each Claude update; the copy does not auto-update. Expect one Keychain prompt on first launch (new signature).

## What it does

- **Direction:** `dir="auto"` on blocks, lists, tables and the input. Claude's own `dir` attributes are respected unless **Force RTL** is on.
- **Code and math** stay LTR.
- **Font:** extends Claude's own `anthropic-sans` / `anthropic-serif` families with Vazirmatn (or an installed font) for Arabic-script glyphs only, so Latin keeps Claude's font.
- **Line height:** overrides Claude's `--cds-leading-prose` / `--_prose-leading` chain for prose containing RTL text.
- **Titlebar button** opens the settings panel (Smart RTL, Force RTL, font, line height); Alt+R toggles. Settings live in `localStorage`.
- **Persian keyboard:** Shift+2 types `@`.
- **DevTools:** writes `developer_settings.json` (same as Help > Enable Developer Mode); right-click > Inspect Element.

## How it works

Copies the app, prepends `payload/rtl.js` to the `mainView.js` and `quickWindow.js` preloads, disables the ASAR-integrity fuse, and ad-hoc signs with the original entitlements (minus team-ID keys). The main-process entry is left alone.
