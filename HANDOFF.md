# Task-Mark-stickynote — project handoff

To continue in a new chat, give it this file plus **one** of:
- the GitHub repository `khleeq92-netizen/Jothub_Task_Manager_Sticky_Notes_Chrome_Addon` (best: always up to date), or
- `task-mark-stickynote-source-v<version>.zip` (complete source), or `task-mark-stickynote-all-source.md` (all source as one text file, for chats that cannot open ZIPs).

For a build that syncs, also give it `firebase-settings.txt` (private; rename it to `.env.local` in the project folder). It holds the Firebase Web API key and project ID, which are never committed. Without it the extension still builds; the values can then be pasted in Settings → Cloud sync.

## What this is

**Task-Mark-stickynote** is a Chrome extension (Manifest V3, React + TypeScript) for personal use on Chrome for **Windows and macOS**: sticky notes that float on web pages, a task manager with reminders, templates, backups, and optional cloud sync through the owner's own Firebase project. It is local-first and works fully offline and without an account. Version 2.1.5.

The owner wants complete, working features with few questions — no roadmaps, placeholders or mock features.

## Current state (14 Nov 2026)

Working and tested:
- 48 unit tests pass (`npm test`).
- 41 end-to-end checks pass against the built extension (`npm run e2e`), on macOS (Chrome 157) and Linux (Chromium). As root, e2e adds `--no-sandbox` automatically.

Verified live (14 Nov 2026):
- **Cloud sync against the real Firebase project** `task-mark-stickynote` (Spark/free plan, separate from the owner's other projects). Email/password account created, records and a cloud backup uploaded (`users/<uid>/items`, `users/<uid>/backups`), and a second Chrome profile signed in with the same email received the data.
- The owner's private build has the Firebase values in `.env.local` (git-ignored). Use the same zip in every profile and computer; each just signs in.

Not yet verified:
- Google sign-in (provider enabled in Firebase, but no OAuth client ID set up; the owner uses email/password).
- Conflict copies and permanent-delete stubs against the live project (covered only by simulated-cloud tests).
- **Windows.** Nothing is OS-specific, but it has only been run on macOS.
- Whether the reminder window comes to the front when another app (not Chrome) is active; this depends on the OS. Printing, right-click menu items and the side-panel button have not been exercised by automation.

Recent changes:
- Side-panel shortcut (`open-side-panel`, Alt+Shift+S) toggles the panel like Alt+Shift+J toggles the popup. `sidePanel.open()` must run in the same tick as the key press, so `toggleIn` (src/platform/chrome.ts) snapshots which windows have the panel open (tracked from `sidePanel.onOpened/onClosed`, kept in `chrome.storage.session` key `jh-panel-windows`), calls `open()`, then calls `sidePanel.close()` if it was already open (fallback: message `jh-close-panel` to the panel page). Side-panel contexts report windowId -1, which is why the events are used. Verified by the owner on macOS; e2e covers the tracking, not the key press. Settings → Keyboard shortcuts now shows the live keys with a Change shortcuts button.
- Renamed from **Jot Hub** to **Task-Mark-stickynote** (v2.1.1; v2.1.0 was briefly called Taskmark; short name in Chrome: Task-Mark). Only user-facing text changed. Internal identifiers were kept on purpose so existing data carries over: storage keys (`r:*`, `local:*`), Firestore paths, message types (`jh-*`) and the content script's `jot-hub-notes` element. New backup files say `app: 'taskmark'` (internal id, kept); files saying `'jot-hub'` still restore. The GitHub repository is `khleeq92-netizen/Jothub_Task_Manager_Sticky_Notes_Chrome_Addon`.
- Reminder alerts: when a reminder is due, `alert.html` opens in its own pop-up window in front of the user's work, a chime plays from an offscreen document (`src/platform/offscreen.ts`) until any click or about 30 s, and a system notification is shown too. Buttons: Mark done, Open task, Dismiss, Snooze 5/15/60 min. Pop-up and sound are per browser profile (`local:alertPrefs`); the synced `notifications` setting is the master switch. Snoozes are device-local (`local:snoozes`). Logic in `src/core/alerts.ts` and `src/background/index.ts`.
- Dialogs and the task editor scroll instead of overflowing short windows.
- Floating notes got a ✕ button (removes the note from the page, keeps it in the hub, with Undo).

## Build and run

Needs Node.js 20+.

- `npm install`
- `npm run build` → `dist/` (load this folder via `chrome://extensions` → Developer mode → Load unpacked)
- `npm run package` → `task-mark-stickynote-extension-v2.1.5.zip`
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
| `src/alert/` | Reminder pop-up window (`alert.html`, plain DOM). |
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
- Shortcuts: `Alt+Shift+J` popup, `Alt+Shift+S` side panel, `Alt+Shift+N` note, `Alt+Shift+T` quick task; the full hub (`open-hub`) has no default because Chrome allows only 4 suggested keys (5 makes the extension fail to load). Settings lists the live keys via `chrome.commands.getAll()`; users change them at chrome://extensions/shortcuts. Accent themes, light/dark, note text is always dark on coloured paper.
- The earlier simple popup extension ("Jot" v1) is in `legacy-jot-v1/`; its backups import into Task-Mark-stickynote.

## Open items

1. Firebase: done and working with email sign-in. Remaining from the checklist: edit on one computer and confirm on another computer (two profiles on one Mac already work).
2. Install on Windows and report differences.
3. Manually check: right-click menu, side panel, floating window, reminder pop-up and sound with another app in front, print, shortcuts.
4. Possible later work: pricing page and paid plans, Firefox/Safari builds, Chrome Web Store listing (needs a contact line in `PRIVACY.md`).

## Note for a chat without file access

A chat thread cannot build or load the extension. It can read the source, explain it, and write changed files; the build (`npm run package`) still has to be run on a computer with Node.js.
