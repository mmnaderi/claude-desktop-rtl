# claude-rtl

RTL (Persian / Arabic / Hebrew) for Claude Desktop on macOS. It builds a patched **copy** at `~/Applications/Claude-RTL.app`; `/Applications/Claude.app` is never modified.

```bash
npm ci
node bin/claude-rtl.mjs --check      # prerequisites (exit 1 if something is missing)
node bin/claude-rtl.mjs              # build the copy
node bin/claude-rtl.mjs --uninstall  # delete it
npm test
```

Requirements: macOS, Node 20+, Claude Desktop in `/Applications` (opened once and signed in), about 2 GB free disk. Setting this up with an AI agent? Give it this repo: [AGENTS.md](AGENTS.md) is its playbook. Do not use `npx claude-rtl`: the npm package may still be the old 1.x tool.

Env: `CLAUDE_APP` (source app, default `/Applications/Claude.app`), `CLAUDE_RTL_DEST` (output app, default `~/Applications/Claude-RTL.app`), `CLAUDE_RTL_KEEP_ID=1` (keep Claude's bundle ID, see below), `CLAUDE_RTL_SIGN` (code-signing identity, default ad hoc).

Quit Claude before opening Claude-RTL (same profile, single instance). The copy does not update itself: re-run after each Claude update, or let [auto-rebuild](#auto-rebuild-after-claude-updates) do it. A failed build keeps the previous copy. Expect one Keychain prompt on first launch (new signature), and macOS will ask for notification permission again: the copy has its own bundle ID (`com.anthropic.claudefordesktop.rtl`) so notification clicks open Claude-RTL, not Claude.

## What it does

- **Direction:** `dir="auto"` on blocks, lists, tables and the input. Claude's own `dir` attributes are respected unless **Force RTL** is on; Force RTL applies only to the chat (message bodies and the input), the rest of the app stays on auto.
- **Code and math** stay LTR.
- **Font:** extends Claude's own `anthropic-sans` / `anthropic-serif` families with Vazirmatn (or an installed font) for Arabic-script glyphs only, so Latin keeps Claude's font.
- **Line height:** overrides Claude's `--cds-leading-prose` / `--_prose-leading` chain for prose containing RTL text.
- **Titlebar button** opens the settings panel (Smart RTL, Force RTL, font, line height); Alt+R toggles. Settings live in `localStorage`.
- **Shortcuts:** Alt+1/2/3/4 pick Haiku/Sonnet/Opus/Fable; Alt+5/6/7/8/9 pick effort Low/Medium/High/Extra/Max; Alt+− / Alt+= (or +) step effort one level down/up and stop at the ends; Alt+0 toggles Ultracode (found by its label in the model menu or the Effort submenu). They take over Option+− (–) and Option+= (≠) typing. They drive Claude's own model menu (matched by `data-model-id`), so the menu must exist in the current view. Effort matching is by label prefix and is untested against the real submenu.
- **Layout lock:** save the current pane layout (open panes, columns, widths) once; with **Lock layout** on, every session you open gets it. Claude keeps the layout tree in `localStorage` and ignores storage events, so a differing layout is written back and the page reloads once to adopt it; buttons and splitters are then verified. Needs the titlebar toggles (`Terminal`, `Changes`, `Browser`, `Files`) to keep their labels.
- **Persian keyboard:** Shift+2 types `@`.
- **Portable settings:** the panel's **Copy settings** button exports your choices (font, line height, lock, saved layout). Save them as `settings.json` in the repo root and the installer seeds them as defaults on any machine; values already saved in the app still win.
- **DevTools:** writes `developer_settings.json` (same as Help > Enable Developer Mode); right-click > Inspect Element.

## Auto-rebuild after Claude updates

```bash
zsh bin/auto-rebuild.sh install     # LaunchAgent; keeps the CLAUDE_* env vars set in this shell; re-run after git pull
zsh bin/auto-rebuild.sh status      # what it would do now
zsh bin/auto-rebuild.sh uninstall
```

It runs when `Claude.app` changes and every 10 minutes. When Claude's version differs from the copy, it runs `--check`, then rebuilds. If Claude-RTL is open, it only notifies you and rebuilds after you quit it. If the patch no longer fits the new Claude, it keeps your current copy and notifies you. It runs a copy of this tool in `~/Library/Application Support/claude-rtl/src`, because macOS does not let background jobs read `~/Desktop` or `~/Documents`. Log: `~/Library/Logs/claude-rtl-autorebuild.log`.

**Stable signature.** An ad-hoc signature changes with every build, so macOS asks for Keychain access after every update. Run `zsh bin/make-signing-cert.sh` once (it asks for your password to trust a self-signed code-signing certificate), then build with `CLAUDE_RTL_SIGN="Claude-RTL Signing"`. Allow Keychain access once more; later rebuilds keep the same signature. The first signed build may ask to let `codesign` use the key: choose Always Allow.

**Apps that open "Claude" by bundle ID** (for example CodeIsland, which opens `com.anthropic.claudefordesktop`): build with `CLAUDE_RTL_KEEP_ID=1`. While Claude-RTL is running, such apps find it, because they look for the running app first. The trade-off: when neither app is open, a notification click or a `claude://` link may open `/Applications/Claude.app`.

## How it works

Copies the app, prepends `payload/rtl.js` to the `mainView.js` and `quickWindow.js` preloads, disables the ASAR-integrity fuse, and signs (ad hoc, or with `CLAUDE_RTL_SIGN`) with the original entitlements (minus team-ID keys). It builds in a hidden sibling folder and swaps it in at the end. The main-process entry is left alone.
