# Chrome Web Store listing — Task-Mark-stickynote

Copy each part into the matching field of the Chrome Web Store Developer Dashboard.
Images are in this folder: `store-icon-128.png`, `promo-small-440x280.png`, `promo-marquee-1400x560.png`, and `screenshots/` (1280×800).

---

## Store listing tab

**Name** (comes from the extension itself): Task-Mark-stickynote

**Summary** (comes from the extension's description, 117 characters):
> Sticky notes on any page, a task manager with reminders, ready-made templates and optional cloud sync. Works offline.

**Category:** Workflow & Planning (or "Productivity" in older dashboards)

**Language:** English

**Description:**

```
Sticky notes that float on any web page, plus a task manager with reminders you will not miss — all in one Chrome extension.

FLOATING STICKY NOTES
• Put a note on any web page and it is there every time you come back.
• Attach it to one page, a whole website, or every website.
• Drag, resize, minimise and recolour notes; edit them right on the page.
• Rich text: bold, lists, checklists, headings, fonts and sizes.
• Select text on a page and right-click to turn it into a new note.

TASKS AND REMINDERS
• Deadlines, due times, priorities, categories, tags and subtasks.
• Repeating tasks: daily, weekdays, weekly, monthly, yearly.
• Reminders open a pop-up in front of whatever you are doing, with a chime — mark done or snooze for 5 minutes, 15 minutes or an hour.
• Today, week and month views, a calendar, and a dashboard of what is due and overdue.

ORGANISE
• Folders, colours, pinning, favourites, search and filters.
• Select many notes or tasks at once to finish or delete them together.
• 11 ready-made templates (meeting notes, to-do list, journal and more), or save your own.
• Export notes as Markdown, HTML or text; print; focus mode.

WORKS YOUR WAY
• Toolbar pop-up, side panel or a full tab.
• Keyboard shortcuts you can change.
• Light and dark themes with accent colours.

PRIVATE BY DEFAULT
• Everything is saved on your computer and works offline, with no account.
• Optional cloud sync keeps your notes and tasks the same on all your computers — sign in with email and password.
• Automatic and manual backups, with restore.
• No ads, no tracking, no analytics.
```

**Screenshots** (upload in this order):
1. `screenshots/1-floating-notes.png`
2. `screenshots/2-dashboard.png`
3. `screenshots/3-tasks.png`
4. `screenshots/4-reminder.png`
5. `screenshots/5-side-panel.png`

**Small promo tile:** `promo-small-440x280.png`
**Marquee promo tile (optional):** `promo-marquee-1400x560.png`
**Store icon:** `store-icon-128.png`

**Official URL:** leave empty. **Homepage URL:** `https://github.com/khleeq92-netizen/Jothub_Task_Manager_Sticky_Notes_Chrome_Addon` (optional)
**Support URL:** `https://github.com/khleeq92-netizen/Jothub_Task_Manager_Sticky_Notes_Chrome_Addon/issues`

---

## Privacy practices tab

**Single purpose description:**
```
Task-Mark-stickynote lets you write sticky notes that appear on the web pages you choose and manage your tasks with deadlines and reminders, with optional sync of your own notes and tasks between your computers.
```

**Permission justifications:**

| Permission | Justification to paste |
| --- | --- |
| storage | Saves the user's notes, tasks, templates, settings and backups on their device. |
| unlimitedStorage | Notes and local backups can exceed the default storage quota for users with many notes. |
| alarms | Fires task reminders at the time the user chose, and schedules sync and automatic backups. |
| notifications | Shows a system notification when a task reminder is due. |
| offscreen | Plays the reminder chime; the service worker cannot play audio itself. |
| contextMenus | Adds right-click actions: new floating note on this page, add selected text to a note, create a task from this page. |
| sidePanel | Lets the user keep the extension open in Chrome's side panel beside the page. |
| identity | Opens the Google sign-in window when the user chooses "Continue with Google" for optional cloud sync. |
| scripting | Adds the note script to tabs that were already open when the extension was installed or updated, so floating notes appear without reloading those pages. |
| Host permissions (http/https pages) | Floating notes must be able to appear on any page the user attaches a note to. The script only compares the page address with the user's own notes, on the device; it does not read or collect page content. |
| Host permissions (identitytoolkit / securetoken / firestore.googleapis.com) | Firebase Authentication and Cloud Firestore, used only when the user signs in to optional cloud sync. |

**Are you using remote code?** No, I am not using remote code.
(All JavaScript is in the package; Firebase is called over its REST API, no scripts are downloaded.)

**Data usage — what user data do you collect?** Tick:
- [x] **Personally identifiable information** — the email address, only if the user signs in to cloud sync.
- [x] **Authentication information** — the password is sent to Firebase Authentication to sign in (never stored by the extension); a sign-in token is kept on the device.
- [x] **Website content** — the text of the user's own notes and tasks, synced when signed in.
- [x] **Web history** — the address of a page is stored only when the user attaches a note to that page, and synced when signed in.

Leave unticked: health, financial and payment information, personal communications, location, user activity.

**Certify** all three statements (not sold to third parties; not used for unrelated purposes; not used for creditworthiness or lending).

**Privacy policy URL:**
```
https://github.com/khleeq92-netizen/Jothub_Task_Manager_Sticky_Notes_Chrome_Addon/blob/main/PRIVACY.md
```

---

## Distribution tab

- **Visibility:** Unlisted (only people with the link can find and install it). Change to Public later if you want.
- **Regions:** All regions.
- **Pricing:** Free.
