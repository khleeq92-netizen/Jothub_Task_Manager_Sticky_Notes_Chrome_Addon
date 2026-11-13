# Cloud sync setup (Firebase)

Cloud sync is optional. Task-Mark-stickynote works fully without it. Set this up once, then sign in on each computer.

You will end up with three values:

| Value | Example | Required |
| --- | --- | --- |
| Web API key | `AIzaSy…` | Yes |
| Project ID | `task-mark-12345` | Yes |
| Google OAuth client ID | `1234567890-abc.apps.googleusercontent.com` | Only for "Continue with Google" |

The Firebase free ("Spark") plan is enough for personal use.

---

## 1. Create the Firebase project

1. Go to <https://console.firebase.google.com> and click **Add project** (or **Create a project**).
2. Give it a name. Google Analytics is not needed.

## 2. Turn on Authentication

1. In the left menu: **Build → Authentication → Get started**.
2. Open the **Sign-in method** tab.
3. Click **Email/Password**, switch on **Enable**, and **Save**.
4. For Google sign-in: click **Add new provider → Google**, switch on **Enable**, choose a support email, **Save**.

## 3. Create the Firestore database

1. **Build → Firestore Database → Create database**.
2. Pick a location near you.
3. Choose **Start in production mode**.

## 4. Publish the security rules

1. In Firestore Database, open the **Rules** tab.
2. Replace everything with the contents of [`firestore.rules`](../firestore.rules):

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ```

3. Click **Publish**.

These rules mean a signed-in user can read and write only documents under their own `users/<their id>/` path. Nobody else — including other signed-in users — can read them.

## 5. Copy the API key and project ID

1. Click the gear icon → **Project settings → General**.
2. Copy **Project ID** and **Web API key**.
   If no Web API key is shown, scroll down to **Your apps**, click the **</>** (Web) icon, register an app with any nickname, and copy `apiKey` from the snippet it shows.

## 6. Give the values to Task-Mark-stickynote

Either way works; the first needs no rebuild.

**A. In the extension (recommended):** open Task-Mark-stickynote → **Settings → Cloud sync → Firebase project details**, paste the values, **Save details**. They are stored only on that computer, so repeat this on each one.

**B. At build time:** copy `.env.example` to `.env.local`, fill it in, and run `npm run package`. The values are then built into your private copy. `.env.local` is git-ignored — never commit it.

```
FIREBASE_API_KEY=AIzaSy...
FIREBASE_PROJECT_ID=task-mark-12345
GOOGLE_OAUTH_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
```

You can now use **Create account** / **Sign in** with email and password.

## 7. Enable Google sign-in (optional)

Google needs to know the address the extension returns to after sign-in.

1. In Task-Mark-stickynote, open **Settings → Cloud sync → Firebase project details** and copy the **Redirect URI**. It looks like `https://abcdefghijklmnop.chromiumapp.org/`.
2. Go to <https://console.cloud.google.com/apis/credentials> and select the same project (top bar).
3. **Create credentials → OAuth client ID**. If asked, configure the consent screen first (User type: External; add yourself as a test user).
4. Application type: **Web application**.
5. Under **Authorized redirect URIs**, click **Add URI** and paste the Redirect URI from step 1.
6. **Create**, then copy the **Client ID**.
7. Back in the Firebase console: **Authentication → Sign-in method → Google → Safelist client IDs from external projects**, add that Client ID, **Save**.
8. Paste the Client ID into Task-Mark-stickynote's **Google OAuth client ID** field and **Save details**.

**Windows and Mac:** an unpacked extension gets its ID from the folder it is loaded from, so the Redirect URI is usually different on each computer. Copy the Redirect URI on each one and add all of them to the same OAuth client (step 5). Email/password sign-in does not need this.

---

## Database structure

```
users/{uid}/items/{recordId}
    type        string     "note" | "task" | "folder" | "template" | "settings"
    updatedAt   integer    time of the last edit on a device (ms)
    json        string     the whole record as JSON
    syncedAt    timestamp  set by the server on every write (used to fetch only what changed)

users/{uid}/backups/{snapshotId}
    at, count, bytes, parts   integers
    reason                    "manual" | "auto" | "before-restore"

users/{uid}/backups/{snapshotId}/parts/{n}
    data        string     a slice of the backup file (split to fit Firestore's 1 MB document limit)
```

Records themselves (the `json` field):

- **note** — `title, html, text, color, folderId, pinned, favorite, scope (none|page|site|all), url, host, pos {x,y,w,h}, minimized, font`
- **task** — `title, description, start, due, dueTime, priority, category, tags[], status, completedAt, recurrence, subtasks[{id,title,done}], noteIds[], reminder, favorite, sourceUrl`
- **folder** — `name, color`
- **template** — `name, description, icon, color, html`
- **settings** — theme, accent, defaults, reminder and backup preferences, dashboard layout
- every record also has `id, type, createdAt, updatedAt, deletedAt`; a permanently deleted record is reduced to `{ id, type, createdAt, updatedAt, deletedAt, purged: true }`.

No composite indexes are needed.

## How sync behaves

- Changes sync about 30 seconds after you stop editing, every 15 minutes, and when you press **Sync now**.
- Offline edits are kept locally and sent when the connection returns.
- First sign-in on a device that already has data **merges** that data into the account; nothing is removed.
- **Conflicts:** when one note is edited on two devices before they sync, the newest edit wins and the other version is saved as "*title* (conflict copy)". For tasks, folders, templates and settings the newest edit wins.
- A single note larger than about 300,000 characters is kept on the device only (Firestore's document size limit); Settings shows a warning if that happens.
- **Sign out** forgets the session only. Local data stays.

## First-run checklist

Cloud sync was tested against a simulated cloud, not a live project, so please confirm these once:

1. **Create account** with email and password → Settings shows "Synced just now".
2. In the Firebase console, **Firestore Database → Data** shows `users/<id>/items/...`.
3. Install on a second computer, enter the same Firebase details, sign in → your notes and tasks appear.
4. Edit a note on one computer, press **Sync now** on both → the edit arrives.
5. **Back up now** → **Show cloud backups** lists it.
6. (If set up) **Continue with Google** opens a Google window and signs you in.

## Troubleshooting

| Message | Fix |
| --- | --- |
| "The Firebase API key is not valid" | Re-copy the Web API key (step 5). |
| "This sign-in method is not enabled" / "Authentication is not enabled" | Enable the provider (step 2). |
| "Missing or insufficient permissions" (403) | Publish the rules (step 4). |
| 404 / "database (default) does not exist" | Create the Firestore database (step 3) and check the Project ID. |
| Google window shows `redirect_uri_mismatch` | Add this computer's Redirect URI to the OAuth client (step 7.5). |
| Google sign-in returns "Invalid Idp Response" or an audience error | Add the Client ID to the Google provider's safelist (step 7.7). |
