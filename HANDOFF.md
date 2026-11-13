# Jot Hub — project handoff

Paste this file into a new chat, and attach `jot-hub-all-source.md` (all source in one file) or `jot-hub-source-v2.0.0.zip`. Together they are everything needed to continue.

## What this is

**Jot Hub** is a Chrome extension (Manifest V3, React + TypeScript) for personal use on Chrome for **Windows and macOS**: sticky notes that float on web pages, a task manager with reminders, templates, backups, and optional cloud sync through the owner's own Firebase project. It is local-first and works fully offline and without an account. Version 2.0.0.

The owner wants complete, working features with few questions — no roadmaps, placeholders or mock features.

## Current state (14 Nov 2026)

Working and tested:
- 44 unit tests pass (`npm test`).
- 30 end-to-end checks pass against the built extension in Chrome 157 on macOS (`npm run e2e`).

Not yet verified:
- **Cloud sync against a live Firebase project.** No Firebase project exists yet. Sync is tested only against a simulated cloud plus request-format tests. Google sign-in is untested.
- **Windows.** Nothing is OS-specific, but it has only been run on macOS.
- Notification pop-ups, printing, right-click menu items and the side-panel button have not been exercised by automation.

Last change made: floating notes got a ✕ button (removes the note from the page, keeps it in the hub, with Undo), and the note's ⋯ menu is no longer clipped by the note.

## Build and run

Needs Node.js 20+.

- `npm install`
- `npm run build` → `dist/` (load this folder via `chrome://extensions` → Developer mode → Load unpacked)
- `npm run package` → `jot-hub-extension-v2.0.0.zip`
- `npm test`, `npm run typecheck`, `npm run e2e`, `npm run check` (all of them)
- `node scripts/bundle-source.mjs` → regenerates the `handoff/` files

Build tool is esbuild (`scripts/build.mjs`), producing three bundles: `app.js` (React hub), `background.js` (service worker), `content.js` (floating notes). `app.html`, `popup.html` and `panel.html` are the same app with a different `data-surface`.

## Code map

| Path | Role |
| --- | --- |
| `src/platform/` | Browser abstraction. `types.ts` is the interface, `chrome.ts` the implementation, `web.ts` a plain-web/in-memory one for dev preview and tests. Nothing else touches `chrome.*`. |
| `src/core/types.ts` | Record types (note, folder, task, template, settings), creators, `validateRecord`. |
| `src/core/db.ts` | Storage: one key per record (`r:<id>`) in `chrome.storage.local`; `local:*` keys never sync. |
| `src/core/` (rest) | notes (URL matching), tasks (status, recurrence, reminders), dates, templates (11 built-in), richtext (execCommand editor core), sanitize (HTML allowlist), exporters, backup, entitlements. |
| `src/sync/` | Firebase Auth and Firestore over **REST** (`auth.ts`, `firestore.ts`), sync engine (`engine.ts`), config (`config.ts`). |
| `src/background/index.ts` | Reminders, sync scheduling, auto-backup, trash expiry, context menus, commands. |
| `src/content/index.ts` | Floating notes and quick-task form: plain DOM in a shadow root, no React. |
| `src/app/` | React hub: `App.tsx` (shell, search), `store.ts`, `ui.tsx`, `components.tsx` (editor, note/task editors), `views/library.tsx` (notes, folders, favorites, trash, templates), `views/planner.tsx` (tasks, calendar, dashboard), `views/settings.tsx`. |
| `tests/` | Unit tests. `scripts/e2e.mjs` drives real Chrome with puppeteer-core. |
| `firestore.rules`, `docs/FIREBASE_SETUP.md` | Security rules and the Firebase setup guide. |

## Decisions already made (keep unless asked)

- **Firebase via REST, not the SDK** — no remote code (MV3), small, works in the service worker.
- **Local-first, per-record keys**; every surface reacts to storage change events.
- **Sync:** each record has `updatedAt`; the engine keeps the version last agreed with the cloud per record. Conflicts: newest edit wins; for notes the losing version is saved as "(conflict copy)". Permanent deletes sync as content-free stubs (`purged: true`).
- **Restore never deletes:** Merge (add missing, keep newer) or Roll back (backup replaces matching records); a safety snapshot is taken first.
- Firebase values are entered in Settings → Cloud sync (device-local) or `.env.local`; never committed.
- Trash empties after 30 days; newest 5 backups kept locally and in the cloud.
- `src/core/entitlements.ts` is the single gate for future paid plans; everything is unlocked now.
- Shortcuts: `Alt+Shift+J/N/T/H`. Accent themes, light/dark, note text is always dark on coloured paper.
- The earlier simple popup extension ("Jot" v1) is in `legacy-jot-v1/`; its backups import into Jot Hub.

## Open items

1. Create a Firebase project and run the six-step checklist at the end of `docs/FIREBASE_SETUP.md`.
2. Install on Windows and report differences.
3. Manually check: right-click menu, side panel, floating window, reminder notification, print, shortcuts.
4. Possible later work: pricing page and paid plans, Firefox/Safari builds, Chrome Web Store listing (needs a contact line in `PRIVACY.md`).

## Note for a chat without file access

A chat thread cannot build or load the extension. It can read the source, explain it, and write changed files; the build (`npm run package`) still has to be run on a computer with Node.js.
