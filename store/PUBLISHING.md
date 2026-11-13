# Publishing Task-Mark-stickynote on the Chrome Web Store

About 30–45 minutes of clicking, then Google's review (usually a few days; extensions that run on all websites can take up to a couple of weeks).

You need:
- `task-mark-stickynote-extension-v2.2.0.zip` — the upload file (already includes your Firebase project, so sync works for anyone who installs it).
- This `store/` folder — images and `LISTING.md` with all the text to paste.

---

## Before you start: keep your data safe

The store version is a **separate install** from the one you loaded with "Load unpacked" (Chrome gives it a new ID). Your synced notes and tasks come back as soon as you sign in on the store version, but anything that only lives on one computer does not move over:

1. In your current copy, open **Settings → Cloud sync** and press **Sync now**. Check it says "Synced just now".
2. **Settings → Backup and restore → Export JSON file** on each computer, as an extra copy.

Keep the unpacked copy until the store version is installed and signed in, then remove the unpacked one (otherwise you get two of everything, including two reminder pop-ups).

---

## 1. Create the developer account (one time, $5)

1. Open <https://chrome.google.com/webstore/devconsole> and sign in with the Google account you want to publish under.
2. Accept the developer agreement and pay the one-time **US$5** registration fee.
3. Fill in the account details:
   - **Publisher name:** what people see as the developer (for example your name).
   - **Contact email:** Google verifies it. It may be shown to users, so use an address you are happy to share.
   - **Trader / non-trader:** if you are publishing for free as a hobby, not as a business, choose **non-trader**.

## 2. Upload the extension

1. In the dashboard, click **New item** (or **Add new item**).
2. Upload `task-mark-stickynote-extension-v2.2.0.zip`. Do not unzip it.
3. The name, version (2.2.0), icon and summary are read from the file.

## 3. Store listing tab

Copy from `LISTING.md` → **Store listing tab**:
- Description, category (Workflow & Planning), language (English).
- Store icon: `store-icon-128.png`.
- Screenshots: the five files in `screenshots/`, in order 1 → 5.
- Small promo tile: `promo-small-440x280.png`. Marquee (optional): `promo-marquee-1400x560.png`.
- Support URL: your GitHub Issues page (in `LISTING.md`).

## 4. Privacy practices tab

Copy from `LISTING.md` → **Privacy practices tab**:
- Single purpose description.
- One justification for each permission (the dashboard lists them; match by name).
- Remote code: **No**.
- Data usage: tick exactly the four boxes listed, and certify the three statements.
- Privacy policy URL: the GitHub link to `PRIVACY.md`.

## 5. Distribution tab

- **Visibility: Unlisted** — only people with the link can install it.
- Regions: all. Price: free.

## 6. Submit

Click **Submit for review**. You get an email when it is approved (or if Google asks for changes — send me their message and I will fix it). Once approved, the dashboard shows the store link: share that with friends, and install it on your own computers.

---

## Publishing an update later

1. Make the change (with me), and make sure `package.json` has a **higher version** than the one in the store.
2. Build: `npm run package` (with your `.env.local` in place, so the Firebase details are included).
3. Dashboard → your item → **Package** → **Upload new package** → the new zip → **Submit for review**.
4. After approval, every installed copy updates by itself within a few hours.

New screenshots, if the look changed: `npm run store-assets` regenerates everything in `store/`.

---

## Things to know

- **Your Firebase project, your responsibility.** People who sign in store their notes in your `task-mark-stickynote` Firebase project. The security rules keep each account's data private from other users, but you, as the project owner, can see it in the Firebase console — the privacy policy says this. Usage counts against your free allowance; a handful of friends uses very little.
- **Account deletion requests:** the privacy policy promises to delete someone's cloud account on request. To do it: Firebase console → Authentication → find the email → delete the user; then Firestore → `users` → their ID → delete.
- **Optional hardening:** in Google Cloud console → APIs & Services → Credentials → your API key, you can restrict it to the *Identity Toolkit API*, *Token Service API* and *Cloud Firestore API*. Sync keeps working; the key becomes useless for anything else.
- **Google sign-in** is not set up (the button stays greyed out). If you want it later, the store version has a fixed ID, so it only needs one redirect address — ask me.
