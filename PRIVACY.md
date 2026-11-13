# Privacy Policy — Jot Hub

_Last updated: 13 November 2026 · applies to version 2.0.0_

## What Jot Hub stores

Your notes, folders, tasks, templates, settings and backups. They are kept in Chrome's extension storage on your device.

## What leaves your device

**Nothing, unless you sign in to cloud sync.**

If you set up cloud sync and sign in:

- Your notes, folders, tasks, templates, settings and backups are sent to the **Firebase project you configured** (Google Cloud Firestore), under your own user ID.
- Your email address and password (or Google sign-in token) are sent to **Firebase Authentication** to sign you in. Jot Hub does not store your password.
- A sign-in session token is stored on your device so you stay signed in.

The Firebase project is yours; its data is governed by your Google/Firebase account and Google's terms.

## What Jot Hub does not do

- No analytics, tracking or advertising.
- It does not read the content of pages you visit or record your browsing history. On each page it only compares the page's address with the addresses of your own notes, locally, to decide whether a note should appear.
- It does not sell or share data.
- It loads no remote code.

## Permissions

| Permission | Purpose |
| --- | --- |
| Storage | Save your data on your device |
| Run on web pages | Show your floating notes and the quick-task form |
| Alarms, notifications | Task reminders, scheduled sync and backups |
| Context menus | Right-click actions |
| Side panel | Keep the hub open beside pages |
| Identity | Open the Google sign-in window when you choose Google sign-in |
| Firebase hosts | Sync with your Firebase project when signed in |

## Your controls

- **Export:** Settings → Backup and restore → Export JSON file.
- **Sign out:** stops syncing; local data stays.
- **Delete local data:** remove the extension from `chrome://extensions`.
- **Delete cloud data:** delete the documents under `users/<your id>` in your Firebase console, or delete the project.

## Contact

_Add a contact email or website here before publishing._
