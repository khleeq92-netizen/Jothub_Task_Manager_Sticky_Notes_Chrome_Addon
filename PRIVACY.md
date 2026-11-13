# Privacy Policy — Task-Mark-stickynote

_Last updated: November 2026 · applies to version 2.2 and later_

Task-Mark-stickynote is a Chrome extension for sticky notes, tasks and reminders. This policy explains what it stores, where, and why.

## In short

- Everything you write is stored **on your own computer** by default.
- Nothing leaves your computer **unless you choose to sign in to cloud sync**.
- No ads, no analytics, no tracking, and your data is never sold or shared.

## What is stored on your computer

Your notes, folders, tasks, templates, settings and backups, in Chrome's extension storage on your device. For a note you attach to a web page, the extension also stores that page's address (or website name), so it can show the note there again. This stays on your device unless you sign in to cloud sync.

## Cloud sync (optional)

Cloud sync is off until you create an account or sign in under **Settings → Cloud sync**. When you are signed in:

- **Your content** — notes, folders, tasks, templates, settings, backups, and the addresses of pages your notes are attached to — is stored in the extension's **Firebase project** (Google Cloud Firestore, operated by the developer of Task-Mark-stickynote) under your own account ID, so it can sync between your computers.
- **Your email address and password** (or your Google sign-in) are handled by **Firebase Authentication** to sign you in. The extension never stores your password; it keeps only a sign-in token on your device so you stay signed in.
- **Access:** security rules allow each account to read and write **only its own data**. Other users cannot see it. As the owner of the Firebase project, the developer can technically access stored data, but does not view, analyse, sell or share it, and uses it only to provide sync.
- Data is sent over encrypted connections (HTTPS) and stored by Google Cloud, under Google's own security and privacy terms.

If you set up your own Firebase project in **Settings → Cloud sync → Firebase project details**, your data goes to that project instead, and the developer has no access to it.

## What the extension does not do

- It does not collect analytics, track you, or show advertising.
- It does not read the content of the pages you visit, and it does not record your browsing history. On each page it only checks, on your device, whether the page's address matches one of your own notes.
- It does not sell, rent or share your data with anyone.
- It does not load or run code from the internet; everything it runs is included in the extension.

## Permissions and why they are needed

| Permission | Why |
| --- | --- |
| Storage, unlimited storage | Save your notes, tasks and backups on your device |
| Access to web pages (http/https), scripting | Show your floating notes and the quick-task form on the pages you choose |
| Alarms, notifications, offscreen | Task reminders (pop-up window and chime), scheduled sync and backups |
| Context menus | Right-click actions such as “New floating note on this page” |
| Side panel | Keep the extension open beside the page you are reading |
| Identity | Open the Google sign-in window, only if you choose “Continue with Google” |
| Google Firebase addresses | Sign in and sync, only when you use cloud sync |

## Your choices

- **Use it without an account:** everything works offline; nothing is uploaded.
- **Export your data:** Settings → Backup and restore → Export JSON file.
- **Stop syncing:** Settings → Cloud sync → Sign out. Your local data stays.
- **Delete data:** deleting a note or task and then deleting it from the Trash removes it from your device and from the cloud. Removing the extension deletes all local data.
- **Delete your cloud account and all its data:** contact the developer (below) from any address, giving the email you signed up with, and the account and all its synced data will be deleted.

## Children

Task-Mark-stickynote is a general productivity tool and is not directed at children under 13.

## Changes

If this policy changes, the new version will be published at this address with a new date.

## Contact

Questions or requests (including account deletion): open an issue at
<https://github.com/khleeq92-netizen/Jothub_Task_Manager_Sticky_Notes_Chrome_Addon/issues>
