import { Cloud, Copy, Download, KeyRound, LogOut, RefreshCw, RotateCcw, Save, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { buildBackup, deleteSnapshot, parseBackup, readSnapshot, restoreBackup, type SnapshotMeta } from '../../core/backup';
import { timeAgo } from '../../core/dates';
import { loadAll } from '../../core/db';
import { currentPlan } from '../../core/entitlements';
import { downloadFile } from '../../core/exporters';
import { REMINDER_OPTIONS } from '../../core/tasks';
import { ACCENTS, FONTS, type Accent, type FontKey, type Settings } from '../../core/types';
import { platform } from '../../platform';
import { sendPasswordReset, signInWithEmail, signInWithGoogle, signOut, signUpWithEmail } from '../../sync/auth';
import { getCloudConfigRaw, saveCloudConfig, type CloudConfig } from '../../sync/config';
import { deleteCloudSnapshot, listCloudSnapshots, restoreCloudSnapshot } from '../../sync/engine';
import { requestSync } from '../actions';
import { updateSettings, useData, useLocal } from '../store';
import { ColorDots, confirmDialog, Field, Modal, PageHead, toast } from '../ui';
import { useSync } from './planner';

declare const __APP_VERSION__: string;

const SHORTCUTS: [string, string][] = [
  ['Alt + Shift + J', 'Open Jot Hub (toolbar popup)'],
  ['Alt + Shift + N', 'New sticky note on the current page'],
  ['Alt + Shift + T', 'Quick task from the current page'],
  ['Alt + Shift + H', 'Open the full hub in a tab'],
  ['Ctrl / ⌘ + K', 'Search everything (inside the hub)'],
  ['Alt + N', 'New note (inside the hub)'],
  ['Alt + T', 'New task (inside the hub)'],
  ['Ctrl / ⌘ + B, I, U', 'Bold, italic, underline'],
  ['Esc', 'Close a dialog or leave focus mode'],
];

const sizeLabel = (bytes: number) => (bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1048576).toFixed(1)} MB`);
const REASON: Record<SnapshotMeta['reason'], string> = { manual: 'Manual', auto: 'Automatic', 'before-restore': 'Before a restore' };
const describeRestore = (r: { added: number; updated: number; skipped: number; rejected: number }) =>
  `Restored: ${r.added} added, ${r.updated} updated, ${r.skipped} already up to date${r.rejected ? `, ${r.rejected} invalid skipped` : ''}.`;

export function SettingsView({ section }: { section: string }) {
  const { settings } = useData();
  useEffect(() => {
    if (section) document.getElementById(`settings-${section}`)?.scrollIntoView({ block: 'start' });
  }, [section]);
  const set = (change: Partial<Settings>) => updateSettings(change);

  return (
    <div className="page settings">
      <PageHead title="Settings" />

      <section className="panel" id="settings-appearance">
        <h2>Appearance</h2>
        <div className="setting">
          <div><strong>Theme</strong><p className="muted small">Light, dark, or follow your computer.</p></div>
          <div className="segmented" role="group" aria-label="Theme">
            {(['system', 'light', 'dark'] as const).map((t) => (
              <button key={t} aria-pressed={settings.theme === t} className={settings.theme === t ? 'active' : ''} onClick={() => set({ theme: t })}>{t === 'system' ? 'Auto' : t[0].toUpperCase() + t.slice(1)}</button>
            ))}
          </div>
        </div>
        <div className="setting">
          <div><strong>Accent color</strong></div>
          <div className="swatches" role="group" aria-label="Accent color">
            {(Object.keys(ACCENTS) as Accent[]).map((a) => (
              <button key={a} title={a} aria-label={a} aria-pressed={settings.accent === a} className={settings.accent === a ? 'active' : ''} style={{ background: ACCENTS[a] }} onClick={() => set({ accent: a })} />
            ))}
          </div>
        </div>
        <div className="setting">
          <div><strong>New note color</strong></div>
          <ColorDots value={settings.noteColor} onChange={(noteColor) => set({ noteColor })} label="Default note color" />
        </div>
        <div className="setting">
          <div><strong>Note font</strong></div>
          <select aria-label="Default note font" value={settings.font} onChange={(e) => set({ font: e.target.value as FontKey })}>
            {(Object.keys(FONTS) as FontKey[]).map((k) => <option key={k} value={k}>{FONTS[k].label}</option>)}
          </select>
        </div>
        <div className="setting">
          <div><strong>Note text size</strong></div>
          <div className="segmented" role="group" aria-label="Note text size">
            {([['sm', 'Small'], ['md', 'Medium'], ['lg', 'Large']] as const).map(([k, label]) => (
              <button key={k} aria-pressed={settings.fontSize === k} className={settings.fontSize === k ? 'active' : ''} onClick={() => set({ fontSize: k })}>{label}</button>
            ))}
          </div>
        </div>
      </section>

      <section className="panel" id="settings-tasks">
        <h2>Tasks and reminders</h2>
        <div className="setting">
          <div><strong>Desktop notifications</strong><p className="muted small">Show a notification when a task reminder is due.</p></div>
          <label className="switch"><input type="checkbox" checked={settings.notifications} onChange={(e) => set({ notifications: e.target.checked })} /><span aria-hidden="true" /><span className="sr-only">Desktop notifications</span></label>
        </div>
        <div className="setting">
          <div><strong>Default reminder</strong><p className="muted small">Used when you give a task a deadline.</p></div>
          <select aria-label="Default reminder" value={settings.defaultReminder == null ? '' : String(settings.defaultReminder)} onChange={(e) => set({ defaultReminder: e.target.value === '' ? null : Number(e.target.value) })}>
            {REMINDER_OPTIONS.map((o) => <option key={String(o.value)} value={o.value == null ? '' : String(o.value)}>{o.label}</option>)}
          </select>
        </div>
        <div className="setting">
          <div><strong>Week starts on</strong></div>
          <div className="segmented" role="group" aria-label="Week starts on">
            <button aria-pressed={settings.weekStart === 1} className={settings.weekStart === 1 ? 'active' : ''} onClick={() => set({ weekStart: 1 })}>Monday</button>
            <button aria-pressed={settings.weekStart === 0} className={settings.weekStart === 0 ? 'active' : ''} onClick={() => set({ weekStart: 0 })}>Sunday</button>
          </div>
        </div>
      </section>

      <CloudSection />
      <BackupSection />

      <section className="panel" id="settings-shortcuts">
        <h2>Keyboard shortcuts</h2>
        <table className="shortcuts">
          <tbody>{SHORTCUTS.map(([keys, what]) => <tr key={keys}><td><kbd>{keys}</kbd></td><td>{what}</td></tr>)}</tbody>
        </table>
        {platform.name === 'chrome' && (
          <p className="muted small">
            The first four work anywhere in the browser (on a Mac, Alt is the Option key). <button className="link" onClick={() => void platform.tabs.open('chrome://extensions/shortcuts')}>Change them in Chrome</button>
          </p>
        )}
      </section>

      <section className="panel" id="settings-about">
        <h2>About</h2>
        <p className="muted small">Jot Hub {typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''} · Plan: {currentPlan().label}</p>
        <p className="muted small">Your notes and tasks are stored on this device. Nothing is sent anywhere unless you sign in to cloud sync, and then only to your own Firebase project.</p>
      </section>
    </div>
  );
}

// ---- Cloud sync ----------------------------------------------------------------------

function CloudSection() {
  const sync = useSync();
  const [saved, setSaved] = useState<CloudConfig | null>(null);
  const [config, setDraft] = useState<CloudConfig | null>(null);
  const setConfig = (change: Partial<CloudConfig>) => setDraft((draft) => (draft ? { ...draft, ...change } : draft));
  const [showConfig, setShowConfig] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void getCloudConfigRaw().then((loaded) => {
      setSaved(loaded);
      setDraft(loaded);
    });
  }, []);
  if (!config || !saved) return null;
  const configured = !!(saved.apiKey && saved.projectId);
  const redirect = platform.identity.redirectUrl();

  const attempt = async (action: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    setError('');
    try {
      await action();
      if (done) toast(done);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };
  const afterSignIn = async () => {
    setPassword('');
    await requestSync(true);
  };

  return (
    <section className="panel" id="settings-cloud">
      <h2><Cloud size={17} /> Cloud sync</h2>
      <p className="muted small">Optional. Everything works without an account; signing in keeps your notes, tasks, templates and settings in step across your computers.</p>

      {sync.auth ? (
        <>
          <div className="setting">
            <div>
              <strong>{sync.auth.email || 'Signed in'}</strong>
              <p className={`sync-line tone-${sync.tone}`}><span className="sync-dot" /> {sync.label}</p>
              {sync.status.state === 'ok' && <p className="muted small">Last run: {sync.status.pulled ?? 0} received, {sync.status.pushed ?? 0} sent{sync.status.conflicts ? `, ${sync.status.conflicts} conflict${sync.status.conflicts === 1 ? '' : 's'} resolved` : ''}.</p>}
              {sync.status.error && <p className="small bad">{sync.status.error}</p>}
              {sync.status.warning && <p className="small warn">{sync.status.warning}</p>}
            </div>
            <div className="row wrap">
              <button className="btn" disabled={sync.status.state === 'syncing'} onClick={() => void requestSync()}><RefreshCw size={15} /> Sync now</button>
              <button className="btn" disabled={sync.status.state === 'syncing'} onClick={() => void requestSync(true)}>Full re-sync</button>
              <button className="btn" onClick={() => attempt(signOut, 'Signed out. Your data is still on this device.')}><LogOut size={15} /> Sign out</button>
            </div>
          </div>
          <p className="muted small">If the same note is edited on two devices before they sync, the newest edit wins and the other version is kept as a “(conflict copy)” note.</p>
        </>
      ) : configured ? (
        <form
          className="form signin"
          onSubmit={(e) => {
            e.preventDefault();
            void attempt(async () => {
              await signInWithEmail(email.trim(), password);
              await afterSignIn();
            }, 'Signed in');
          }}
        >
          <div className="grid-2">
            <Field label="Email"><input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Password"><input type="password" autoComplete="current-password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          </div>
          {error && <p className="small bad" role="alert">{error}</p>}
          <div className="row wrap">
            <button className="btn primary" disabled={busy}>Sign in</button>
            <button type="button" className="btn" disabled={busy || !email || password.length < 6} onClick={() => attempt(async () => { await signUpWithEmail(email.trim(), password); await afterSignIn(); }, 'Account created')}>Create account</button>
            <button type="button" className="btn" disabled={busy || !saved.googleClientId} title={saved.googleClientId ? '' : 'Add a Google OAuth client ID below to enable this'} onClick={() => attempt(async () => { await signInWithGoogle(); await afterSignIn(); }, 'Signed in with Google')}>Continue with Google</button>
            <button type="button" className="link" disabled={busy || !email} onClick={() => attempt(() => sendPasswordReset(email.trim()), 'Password reset email sent')}>Forgot password?</button>
          </div>
        </form>
      ) : (
        <p className="notice">Cloud sync is not set up yet. Add your Firebase project details below — the setup guide (docs/FIREBASE_SETUP.md) walks through it in about ten minutes.</p>
      )}
      {!sync.auth && !configured && error && <p className="small bad" role="alert">{error}</p>}

      <button className="link" aria-expanded={showConfig || !configured} onClick={() => setShowConfig(!showConfig)}><KeyRound size={14} /> Firebase project details</button>
      {(showConfig || !configured) && (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            void attempt(async () => {
              await saveCloudConfig(config);
              setSaved(config);
              setShowConfig(false);
            }, 'Firebase details saved on this device');
          }}
        >
          <div className="grid-2">
            <Field label="Web API key"><input value={config.apiKey} spellCheck={false} placeholder="AIza…" onChange={(e) => setConfig({ apiKey: e.target.value.trim() })} /></Field>
            <Field label="Project ID"><input value={config.projectId} spellCheck={false} placeholder="my-project-12345" onChange={(e) => setConfig({ projectId: e.target.value.trim() })} /></Field>
          </div>
          <Field label="Google OAuth client ID (only for Google sign-in)"><input value={config.googleClientId} spellCheck={false} placeholder="1234567890-abc.apps.googleusercontent.com" onChange={(e) => setConfig({ googleClientId: e.target.value.trim() })} /></Field>
          <div className="field">
            <span className="field-label">Redirect URI to add to that OAuth client</span>
            <div className="row">
              <code className="grow ellipsis">{redirect}</code>
              <button type="button" className="btn small" onClick={() => navigator.clipboard.writeText(redirect).then(() => toast('Copied'))}><Copy size={14} /> Copy</button>
            </div>
          </div>
          <div className="row"><button className="btn primary" disabled={busy}>Save details</button></div>
          <p className="muted small">These values are stored only on this device, never in the source code.</p>
        </form>
      )}
    </section>
  );
}

// ---- Backup and restore ----------------------------------------------------------------

type CloudSnap = SnapshotMeta & { parts: number };

function BackupSection() {
  const { settings } = useData();
  const sync = useSync();
  const snapshots = useLocal<SnapshotMeta[]>('snapshots', []);
  const [cloud, setCloud] = useState<CloudSnap[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ label: string; count: number; run: (mode: 'merge' | 'overwrite') => Promise<{ added: number; updated: number; skipped: number; rejected: number }> } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const surface = document.documentElement.dataset.surface;

  const guard = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (e: any) {
      toast(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const backupNow = () =>
    guard(async () => {
      const result = await platform.runtime.send<{ cloud: boolean; error?: string }>({ type: 'backup-now' });
      toast(result?.error ? `Saved on this device. Cloud copy failed: ${result.error}` : result?.cloud ? 'Backup saved here and in the cloud' : 'Backup saved on this device');
      if (cloud) setCloud(await listCloudSnapshots());
    });

  const exportJson = () =>
    guard(async () => {
      downloadFile(`jot-hub-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(buildBackup(await loadAll()), null, 2), 'application/json');
    });

  const pickFile = () => {
    // A file picker closes the toolbar popup, so importing happens in a full tab.
    if (surface === 'popup') void platform.tabs.open(platform.runtime.url('app.html') + '#/settings/backup');
    else fileRef.current?.click();
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      const { records } = parseBackup(text);
      setPending({ label: file.name, count: records.length, run: (mode) => restoreBackup(text, mode) });
    } catch (e: any) {
      toast(e?.message ?? 'That file could not be read.');
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const restoreLocal = async (snap: SnapshotMeta) => {
    const text = await readSnapshot(snap.id);
    if (!text) return toast('That backup is no longer available.');
    setPending({ label: `backup from ${new Date(snap.at).toLocaleString()}`, count: snap.count, run: (mode) => restoreBackup(text, mode) });
  };

  return (
    <section className="panel" id="settings-backup">
      <h2><Save size={17} /> Backup and restore</h2>
      <div className="setting">
        <div><strong>Automatic backup</strong><p className="muted small">Last backup: {sync.lastBackupAt ? timeAgo(sync.lastBackupAt, sync.now) : 'never'}. {sync.auth ? 'Backups are also copied to the cloud.' : 'Backups are kept on this device.'}</p></div>
        <select aria-label="Automatic backup" value={settings.autoBackup} onChange={(e) => updateSettings({ autoBackup: e.target.value as Settings['autoBackup'] })}>
          <option value="off">Off</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </div>
      <div className="row wrap">
        <button className="btn primary" disabled={busy} onClick={backupNow}><Save size={15} /> Back up now</button>
        <button className="btn" disabled={busy} onClick={exportJson}><Download size={15} /> Export JSON file</button>
        <button className="btn" disabled={busy} onClick={pickFile}><Upload size={15} /> Restore from JSON file</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
      </div>

      <h3>Backups on this device</h3>
      {snapshots.length ? (
        <div className="list bordered">
          {snapshots.map((s) => (
            <div key={s.id} className="snap-row">
              <span className="grow"><strong>{new Date(s.at).toLocaleString()}</strong><span className="muted small"> · {REASON[s.reason]} · {s.count} items · {sizeLabel(s.bytes)}</span></span>
              <button className="btn small" onClick={() => void restoreLocal(s)}><RotateCcw size={14} /> Restore</button>
              <button className="btn small" aria-label="Download backup file" title="Download backup file" onClick={async () => { const text = await readSnapshot(s.id); if (text) downloadFile(`jot-hub-backup-${new Date(s.at).toISOString().slice(0, 10)}.json`, text, 'application/json'); }}><Download size={14} /></button>
              <button className="btn small" aria-label="Delete backup" onClick={async () => { if (await confirmDialog({ title: 'Delete this backup?', message: 'Your current notes and tasks are not affected.', confirmLabel: 'Delete backup', danger: true })) await deleteSnapshot(s.id); }}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted small">No backups yet. The newest 5 are kept.</p>
      )}

      <h3>Backups in the cloud</h3>
      {!sync.auth ? (
        <p className="muted small">Sign in to cloud sync to keep backups in the cloud too.</p>
      ) : cloud == null ? (
        <button className="btn small" disabled={busy} onClick={() => guard(async () => setCloud(await listCloudSnapshots()))}>Show cloud backups</button>
      ) : cloud.length ? (
        <div className="list bordered">
          {cloud.map((s) => (
            <div key={s.id} className="snap-row">
              <span className="grow"><strong>{new Date(s.at).toLocaleString()}</strong><span className="muted small"> · {REASON[s.reason]} · {s.count} items · {sizeLabel(s.bytes)}</span></span>
              <button className="btn small" onClick={() => setPending({ label: `cloud backup from ${new Date(s.at).toLocaleString()}`, count: s.count, run: (mode) => restoreCloudSnapshot(s.id, s.parts, mode) })}><RotateCcw size={14} /> Restore</button>
              <button className="btn small" aria-label="Delete cloud backup" onClick={() => guard(async () => { if (await confirmDialog({ title: 'Delete this cloud backup?', message: 'Your current notes and tasks are not affected.', confirmLabel: 'Delete backup', danger: true })) { await deleteCloudSnapshot(s.id, s.parts); setCloud(await listCloudSnapshots()); } })}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted small">No cloud backups yet. “Back up now” creates one.</p>
      )}

      {pending && (
        <Modal title="Restore backup" onClose={() => setPending(null)} width={460}>
          <p style={{ marginTop: 0 }}>Restore <strong>{pending.count}</strong> item{pending.count === 1 ? '' : 's'} from {pending.label}?</p>
          <p className="muted small">Nothing you have now is deleted either way, and a safety backup is taken first.</p>
          <div className="choice">
            <button className="btn primary" disabled={busy} onClick={() => guard(async () => { const r = await pending.run('merge'); setPending(null); toast(describeRestore(r)); })}>Merge</button>
            <span className="muted small">Adds what is missing. Where an item exists in both, the newer version is kept. Recommended.</span>
          </div>
          <div className="choice">
            <button className="btn" disabled={busy} onClick={() => guard(async () => { const r = await pending.run('overwrite'); setPending(null); toast(describeRestore(r)); })}>Roll back</button>
            <span className="muted small">Items in the backup replace your current versions of them. Use this to undo recent edits.</span>
          </div>
        </Modal>
      )}
    </section>
  );
}
