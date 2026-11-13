# Task-Mark-stickynote

A personal productivity hub as a Chrome extension (Manifest V3): sticky notes that float on web pages, a task manager with reminders, ready-made templates, backups, and optional cloud sync through your own Firebase project.

It is local-first. Everything works offline and without an account; signing in is optional.

Works in Chrome on **Windows and macOS** (same package for both). Requires Chrome 116 or newer.

---

## Install

You can install from the ZIP or from the `dist/` folder — they contain the same build.

1. Unzip `task-mark-stickynote-extension-v2.1.5.zip` to a folder you will keep (for example `Documents/Task-Mark-stickynote`).
   Or skip this and use the `dist/` folder inside this project.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the unzipped folder (the one that contains `manifest.json`).
5. Click the puzzle-piece icon in the toolbar and pin **Task-Mark-stickynote**.

The steps are identical on Windows and Mac. To update later, replace the folder's contents and click the reload arrow on the Task-Mark-stickynote card.

> Pages that were already open before you installed the extension need one reload before floating notes work on them.

## Using it

| Where | What |
| --- | --- |
| Toolbar icon | Opens the hub in a popup. |
| Side panel button (top bar) | Keeps the hub open beside the page while you switch tabs. |
| Floating window button | Opens the hub in its own window you can drag to another monitor. |
| Open-in-tab button | The full-size hub. |
| Right-click a page | **New floating note on this page**, **Add selection to a new floating note**, **Create a task from this page**. |

### Notes

- Rich text: bold, italic, underline, headings, bullet and numbered lists, checklists, fonts and sizes. Saves as you type.
- Colors, folders, pin, favorite, search, filters and sorting.
- **Float on web pages:** attach a note to one page, a whole site, or every website. Floating notes can be dragged, resized, minimized, recolored and edited in place.
- Focus mode (full-screen, distraction-free), print, and export as Markdown, HTML or text.
- Save any note as a template.

### Tasks

- Title, description, start date, deadline, due time, priority (low → urgent), category, tags.
- Status: pending, in progress, completed — plus **overdue**, worked out automatically.
- Subtasks, linked notes, repeating tasks (daily, weekdays, weekly, monthly, yearly) and reminders. When a reminder is due, a pop-up window opens in front of whatever you are doing, with a chime that repeats until you respond (up to 30 s) and buttons to mark the task done, open it, dismiss it, or snooze it for 5 min, 15 min or 1 hour. A system notification is shown as well. Pop-up and sound can be switched off per browser profile in Settings → Tasks and reminders, which also has a **Send test reminder** button.
- Views: All, Day, Week, Month, Completed, and a month **Calendar**.
- Quick task from any web page (right-click or `Alt+Shift+T`).

### Templates

Eleven ready-made templates (Daily Planner, Weekly Planner, Monthly Goals, Meeting Notes, Project Tracker, Daily To-Do List, Research Notes, Shopping List, Personal Journal, Follow-up Tracker, Custom Checklist). Create, edit, duplicate and delete your own.

### Backup, restore and sync

- **Back up now**, automatic backups (daily / weekly / monthly), the newest 5 kept on the device.
- **Export JSON file** / **Restore from JSON file**. Restores never delete anything: *Merge* adds what is missing and keeps the newer version of each item; *Roll back* replaces matching items with the backup's versions. A safety backup is taken before every restore.
- **Cloud sync (optional):** email/password or Google sign-in. Notes, folders, tasks, templates and settings sync between devices. Backups are also copied to the cloud. See [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md).
- Signing out keeps everything on the device.
- Conflicts: if the same note is edited on two devices before they sync, the newest edit wins and the other version is kept as a "(conflict copy)" note.

### Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Alt+Shift+J` | Open the toolbar popup |
| `Alt+Shift+S` | Open or close the side panel |
| `Alt+Shift+N` | New floating note on the current page |
| `Alt+Shift+T` | Quick task from the current page |
| *(not set)* | Open the full hub in a tab — assign any key you like |
| `Ctrl/⌘+K` | Search everything (inside the hub) |
| `Alt+N` / `Alt+T` | New note / new task (inside the hub) |
| `Esc` | Close a dialog, leave focus mode |

On a Mac, Alt is the Option key. The first five work on any page; change them, or add one, at `chrome://extensions/shortcuts` (Settings → Keyboard shortcuts → **Change shortcuts** opens it). Settings always shows the keys currently set. Chrome allows at most four default keys per extension, which is why the full hub starts without one. If another extension already uses a key, Chrome leaves it unset — assign it there.

### Coming from the earlier "Jot" extension

The first version now lives in `legacy-jot-v1/`. To bring its notes over: in old Jot choose **⋯ → Export backup**, then in Task-Mark-stickynote use **Settings → Backup and restore → Restore from JSON file**.

---

## What you need to provide

Nothing, for local use. For cloud sync only:

| Item | Where it comes from | Needed for |
| --- | --- | --- |
| Firebase **Web API key** | Firebase console → Project settings | Any sign-in |
| Firebase **Project ID** | Firebase console → Project settings | Any sign-in |
| **Google OAuth client ID** | Google Cloud console → Credentials | Google sign-in only |

Enter them in **Settings → Cloud sync → Firebase project details** (stored only on that device), or put them in `.env.local` before building. The step-by-step guide is [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md).

---

## Development

Requires Node.js 20+.

```bash
npm install
```

```bash
npm run build
```

```bash
npm run package
```

```bash
npm test
```

```bash
npm run e2e
```

| Command | What it does |
| --- | --- |
| `npm run build` | Production build into `dist/` |
| `npm run watch` | Rebuild on change (reload the extension in Chrome to pick it up) |
| `npm run package` | Build and create `task-mark-stickynote-extension-v<version>.zip` |
| `npm run typecheck` | TypeScript check |
| `npm test` | Unit tests (notes, tasks, backup/restore, sync) |
| `npm run e2e` | Loads the built extension into your installed Chrome with a throwaway profile and tests it end to end |
| `npm run check` | All of the above |

`dist/app.html` also runs as a plain web page (storage falls back to `localStorage`), which is handy for UI work: serve `dist/` with any static server.

### Project structure

```
src/
  platform/      Browser abstraction. types.ts is the interface; chrome.ts implements it;
                 web.ts is a plain-web / in-memory implementation (dev preview and tests).
  core/          Framework-free logic: record types + validation, storage (db.ts), notes,
                 tasks, dates, templates, rich text, HTML sanitizer, export, backup, entitlements.
  sync/          Firebase Auth and Firestore over REST, plus the sync engine.
  background/    Service worker: reminders, sync scheduling, auto-backup, context menus, commands.
  content/       Floating notes and quick-task form on web pages (plain DOM in a shadow root).
  app/           The React hub (popup, side panel, floating window and full tab share one app).
tests/           Unit tests.
scripts/         build.mjs (esbuild) and e2e.mjs.
firestore.rules  Security rules to publish in Firebase.
```

### Architecture notes

- **Local-first.** Every record is one key in `chrome.storage.local` (`r:<id>`). All surfaces — popup, side panel, tab, content script, service worker — read and write the same store and react to its change events, so they stay in step without messaging.
- **Browser abstraction.** Nothing outside `src/platform/` touches `chrome.*`. Supporting Firefox or Safari means adding another `Platform` implementation (Firefox's `browser.*` is already picked up by `chrome.ts`) and a manifest variant.
- **No remote code.** Firebase is used through its REST APIs with `fetch`, so no Firebase scripts are loaded at runtime (a Manifest V3 requirement) and the same code runs in a page or a service worker.
- **Sync.** Each record carries `updatedAt`. The engine remembers, per record, the version last agreed with the cloud; that tells it whether the device, the cloud, or both changed. Deletions sync as trash flags and, for permanent deletes, as content-free stubs.
- **Untrusted HTML.** Note HTML from backups, the cloud or the clipboard goes through an allowlist sanitizer before it reaches the DOM.
- **Future plans/licensing.** `src/core/entitlements.ts` is the single place that answers "is this feature available?". Everything is unlocked today; a subscription system only needs to change what it returns.

### Permissions

| Permission | Why |
| --- | --- |
| `storage`, `unlimitedStorage` | Keep notes, tasks and backups on the device |
| Content script on `http(s)` pages | Show floating notes and the quick-task form |
| `alarms`, `notifications` | Task reminders, scheduled sync and backups |
| `scripting`, access to http/https pages | Floating notes on web pages. After an install or update, the note script is added to tabs that are already open, so the shortcuts work without reloading them. |
| `offscreen` | Plays the reminder chime (the service worker cannot play audio) |
| `contextMenus` | Right-click actions |
| `sidePanel` | Keep the hub open beside pages |
| `identity` | Google sign-in window (only when you use it) |
| Firebase hosts | Talk to your Firebase project when signed in |

The extension does not read page content or browsing history. The content script only compares the page address with your notes' addresses, on your device.

---

## Test status

- 48 unit tests pass.
- 41 end-to-end checks pass against the built extension (Chrome 157 on macOS, Chromium on Linux): service worker, commands, alarms, floating notes (create, type, format, drag, reload, per-page scoping), quick task, reminder scheduling, the reminder pop-up window, chime, snooze and test reminder, hub/popup/side-panel pages, side-panel open/close tracking, live shortcuts list, dialogs that scroll, live updates between hub and page.
- Cloud sync is covered by tests against a simulated cloud and by request-format tests. **It has not been run against a live Firebase project**, because that needs your credentials. After setup, follow the checklist at the end of [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md).
- Not run on Windows yet. Nothing in the extension is OS-specific, but it has only been executed on macOS.
