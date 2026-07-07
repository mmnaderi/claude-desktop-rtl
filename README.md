# Claude Desktop RTL Patcher

A smart RTL (Right-to-Left) alignment and typography patcher for the official **Claude Desktop** application, featuring a terracotta-styled floating settings panel.

It automatically enables Right-to-Left text direction, overrides Claude's font system using variable overrides, embeds and loads the beautiful **Vazirmatn** font, enables Developer Tools, and fixes common Persian keyboard layout issues.

---

## Features

- **Smart Auto-Direction**: Automatically detects if a paragraph or list contains RTL scripts (Persian/Arabic) and aligns it correctly, while leaving code blocks and LTR sections untouched.
- **Dynamic CSS Variable Overrides**: Re-defines Claude's official CSS variables (`--font-claude-response`, `--font-ui`, etc.) to seamlessly apply your chosen Persian/Arabic font for RTL texts, and your preferred UI font for English.
- **CSP Bypass & Google Fonts CDN**: Bypasses Claude's strict Content Security Policy (CSP) for local assets by calling Vazirmatn from the whitelisted Google Fonts CDN (`gstatic.com`), with local base64 fallback.
- **DevTools & Context Menu**: Enables the standard Developer Tools window (`Cmd + Option + I` on macOS or `F12` on Windows) and adds a right-click "Inspect Element" context menu.
- **Persian Keyboard Layout Fix**: Resolves the common `Shift + 2` layout bug on Persian keyboards (mapping it to `@` instead of the Persian comma `٬`).
- **Terracotta Settings Widget**: A beautiful, floating panel in the bottom-right corner of Claude Desktop to toggle RTL, force RTL layout, specify custom fonts, and adjust line-height in real time.

---

## Installation

You can run the patcher directly using:

```bash
npx claude-rtl
```

### CLI Options

*   **Apply Patch**: `npx claude-rtl` (Automatically backs up your installation, applies the patch, updates macOS `Info.plist` integrity hashes, and ad-hoc signs the application bundle).
*   **Restore Backup**: `npx claude-rtl --restore` (Completely reverts all modifications and restores Claude Desktop to its official factory state).

---

## Related Projects

*   [antigravity-rtl](https://www.npmjs.com/package/antigravity-rtl) — RTL patcher for Antigravity
*   [codex-rtl](https://www.npmjs.com/package/codex-rtl) — RTL patcher for Codex

---

## License

MIT
