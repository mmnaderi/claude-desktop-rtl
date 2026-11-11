# Agent playbook: set up Claude Desktop RTL on a new Mac

Goal: a second app, `~/Applications/Claude-RTL.app`, that is Claude Desktop with Persian/Arabic/Hebrew RTL, a settings panel, model/effort shortcuts and a layout lock. The original `/Applications/Claude.app` is never modified.

## Do this, in order

1. Prerequisites the human must have done: Claude Desktop installed in `/Applications`, **opened once and signed in** (the copy shares its profile, so login carries over). Node 20+.
2. `git clone https://github.com/mmnaderi/claude-desktop-rtl && cd claude-desktop-rtl && npm ci`
3. `node bin/claude-rtl.mjs --check` and fix every ✖ before going on. Exit code 1 means not ready.
4. Optional: if the human gives you a `settings.json` (exported with the panel's **Copy settings** button), save it in the repo root before installing. It seeds the defaults: font, line height, layout lock and the saved pane layout.
5. `npm test` (about 15 s, must print `ok`).
6. Quit Claude Desktop if it is running, then `node bin/claude-rtl.mjs`. It copies the app, patches the copy, signs it ad hoc, and enables Developer Mode.
7. Verify without touching the user's data:
   - `codesign --verify --deep --strict ~/Applications/Claude-RTL.app` prints nothing.
   - `/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" ~/Applications/Claude-RTL.app/Contents/Info.plist` prints `com.anthropic.claudefordesktop.rtl`.
   - Optional smoke launch: `~/Applications/Claude-RTL.app/Contents/MacOS/Claude --user-data-dir=$(mktemp -d)`, wait about 10 s, check it is running, then `pkill -f "Claude-RTL.app/Contents/MacOS/"`. Never pass `--remote-debugging-port`: the app refuses to start with it.
8. Tell the human what only they can do (below).

## Only the human can do

- Click **Allow** on the Keychain prompt at first launch (new signature) and on the notifications prompt for Claude-RTL.
- Look at the result: the titlebar RTL button, a Persian reply, Alt+1..4 models, Alt+5..9 effort, Alt+−/+ effort step, Alt+0 Ultracode.
- Without `settings.json`: choose a layout, open the panel, **Save current**, turn on **Lock layout**.
- Optional extra fonts (for example Dana) must be installed by the human; the built-in Vazirmatn works everywhere.

## Never

- Never run `npx claude-rtl`. The npm package of that name may still be the old 1.x tool that patches `/Applications/Claude.app` in place. Use this repository.
- Never edit or re-sign `/Applications/Claude.app`. Never kill the user's running Claude or Claude Code; `pkill` only the `Claude-RTL.app` path.
- Never read or copy the user's Claude profile (`~/Library/Application Support/Claude`) wholesale. The installer only writes `developer_settings.json` there.

## After a Claude update

The copy does not update itself. Re-run `node bin/claude-rtl.mjs --check`, then `node bin/claude-rtl.mjs`. Saved panel settings survive, because they live in the profile's localStorage under `claude-rtl`.

The patch depends on parts of Claude's UI. If something stops working after an update, these are the contracts to re-check (open DevTools in Claude-RTL: right-click, Inspect Element; our log lines start with `[claude-rtl]`):

| Feature | Depends on |
| --- | --- |
| Patch targets | `.vite/build/mainView.js`, `quickWindow.js` inside `app.asar` (`--check` tests this) |
| Titlebar button | `.epitaxy-titlebar-end` and an enabled `button[data-cds-icon-only]` to clone |
| Fonts | font tokens `--cds-font-sans`, `--font-ui`, ... and the `anthropic-sans` / `anthropic-serif` families |
| Line height | `.prose` and `--cds-leading-prose` / `--_prose-leading` |
| Model/effort keys | `[data-cds="ModelSelector"]` menu, `data-model-id`, an `Effort` submenu with `menuitemradio` levels, an item labelled `Ultracode` |
| Layout lock | `epitaxy.sidePaneStore.v1` tree, `[data-tile-divider]` splitters, titlebar toggles `Terminal` / `Changes` / `Browser` / `Files` |

## Working on the code

- `payload/rtl.js` runs inside Claude's pages (a preload, so `localStorage` is only readable after the page starts). `bin/claude-rtl.mjs` is the installer.
- `npm test` builds a Claude-like DOM and drives the real payload in jsdom. Add a test for every new behaviour.
- Releases: bump the version in `package.json` and `package-lock.json` (edit only the root entries, never a blanket replace), commit with the user's git identity, tag `vX.Y.Z`, push, `gh release create`. `npm publish` needs the owner's login and 2FA, so leave it to them.
