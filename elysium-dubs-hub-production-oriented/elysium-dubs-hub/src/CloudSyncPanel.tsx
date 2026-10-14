import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Cloud, CloudUpload, Link2, LoaderCircle, LogOut, ShieldCheck } from 'lucide-react';
import { backendConfigured, friendlyError, supabase } from './lib/supabase';

export type CloudNote = { id: string; name: string; subject: string; course: string; kind: string; size: number; createdAt: string; starred: boolean; tags: string[]; storageKey?: string; sample?: boolean; fileName?: string };
export type CloudProgress = Record<string, { ratio: number; scrollY?: number; maxScroll?: number; updatedAt: string }>;
type CloudSnapshot = {
  version: 1;
  syncedAt: string;
  notes: Array<Omit<CloudNote, 'storageKey' | 'sample'> & { storageKey?: never; sample?: never }>;
  readProgress: CloudProgress;
  readerBookmarks: Record<string, number[]>;
  studyToolkit: { flashcards?: Array<{ id: string } & Record<string, unknown>>; glossary?: Array<{ id: string } & Record<string, unknown>>; recaps?: Array<{ id: string } & Record<string, unknown>> } | null;
  studyActivity: Array<{ id: string; at: string; type: string; [key: string]: unknown }>;
};
const BUCKET = 'mechamind-files';
const SNAPSHOT_TABLE = 'mechamind_workspaces';
const TOOLKIT_KEY = 'mechamind-learning-tools-v1';
const ACTIVITY_KEY = 'mechamind-study-events-v1';
const MAX_FILE_BYTES = 25 * 1024 * 1024;

function readJson<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') as T ?? fallback; } catch { return fallback; }
}
function newestProgress(local: CloudProgress, remote: CloudProgress): CloudProgress {
  const merged: CloudProgress = { ...remote };
  for (const [id, record] of Object.entries(local)) {
    const other = merged[id];
    if (!other || (record.updatedAt || '') >= (other.updatedAt || '')) merged[id] = record;
  }
  return merged;
}
function mergeBookmarks(local: Record<string, number[]>, remote: Record<string, number[]>): Record<string, number[]> {
  const merged: Record<string, number[]> = {};
  for (const id of new Set([...Object.keys(remote), ...Object.keys(local)])) {
    merged[id] = [...new Set([...(remote[id] ?? []), ...(local[id] ?? [])])].sort((a, b) => a - b);
  }
  return merged;
}
function mergeById<T extends { id: string }>(local: T[], remote: T[]): T[] {
  const merged = new Map(remote.map(item => [item.id, item]));
  for (const item of local) merged.set(item.id, item);
  return [...merged.values()];
}
function mergeStudyToolkit(local: CloudSnapshot['studyToolkit'], remote: CloudSnapshot['studyToolkit']): CloudSnapshot['studyToolkit'] {
  if (!local && !remote) return null;
  return {
    flashcards: mergeById(local?.flashcards ?? [], remote?.flashcards ?? []),
    glossary: mergeById(local?.glossary ?? [], remote?.glossary ?? []),
    recaps: mergeById(local?.recaps ?? [], remote?.recaps ?? []),
  };
}
function safeCloudNote(note: CloudNote): CloudSnapshot['notes'][number] {
  const { storageKey: _storageKey, sample: _sample, ...portable } = note;
  return portable;
}
function validSnapshot(value: unknown, userNotes: CloudNote[], progress: CloudProgress, bookmarks: Record<string, number[]>): CloudSnapshot {
  const object = value && typeof value === 'object' ? value as Partial<CloudSnapshot> : {};
  return {
    version: 1,
    syncedAt: new Date().toISOString(),
    notes: Array.isArray(object.notes) ? object.notes : userNotes.map(safeCloudNote),
    readProgress: object.readProgress && typeof object.readProgress === 'object' ? object.readProgress : progress,
    readerBookmarks: object.readerBookmarks && typeof object.readerBookmarks === 'object' ? object.readerBookmarks : bookmarks,
    studyToolkit: object.studyToolkit ?? readJson(TOOLKIT_KEY, null),
    studyActivity: Array.isArray(object.studyActivity) ? object.studyActivity : readJson(ACTIVITY_KEY, []),
  };
}

export default function CloudSyncPanel({
  notes, readProgress, readerBookmarks, readFile, readText, writeFile, onApplySnapshot, notify,
}: {
  notes: CloudNote[];
  readProgress: CloudProgress;
  readerBookmarks: Record<string, number[]>;
  readFile: (key: string) => Promise<Blob | undefined>;
  readText: (key: string) => Promise<string>;
  writeFile: (key: string, file: Blob) => Promise<void>;
  onApplySnapshot: (snapshot: { notes: CloudNote[]; readProgress: CloudProgress; readerBookmarks: Record<string, number[]> }) => void;
  notify: (message: string) => void;
}) {
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [email, setEmail] = useState('');
  const [linkSent, setLinkSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [lastSync, setLastSync] = useState(() => { try { return localStorage.getItem('mechamind-last-cloud-sync') || ''; } catch { return ''; } });

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active && data.session?.user) setUser({ id: data.session.user.id, email: data.session.user.email });
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? { id: session.user.id, email: session.user.email } : null);
      setLinkSent(false);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  async function requestSignIn(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !email.trim()) return;
    setBusy(true); setStatus('Sending a secure sign-in link…');
    try {
      const redirect = window.location.origin + window.location.pathname;
      const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirect } });
      if (error) throw error;
      setLinkSent(true);
      setStatus('Check your email for the sign-in link. Return to this page after confirming it.');
    } catch (error) {
      setStatus(friendlyError(error));
    } finally { setBusy(false); }
  }

  async function syncWorkspace() {
    if (!supabase || !user || busy) return;
    setBusy(true); setStatus('Checking your private cloud workspace…');
    const warnings: string[] = [];
    try {
      const { data: row, error: readError } = await supabase.from(SNAPSHOT_TABLE).select('snapshot, updated_at').eq('user_id', user.id).maybeSingle();
      if (readError) throw readError;
      const remote = validSnapshot(row?.snapshot, [], {}, {});
      const remoteById = new Map((remote.notes ?? []).map(note => [note.id, note]));
      const localNotes = notes.filter(note => !note.sample && !!note.storageKey);
      const cloudNotes = new Map(remoteById);
      const locallyAvailable = new Set<string>();
      let uploaded = 0;
      let downloaded = 0;
      for (const note of localNotes) {
        setStatus('Syncing files: ' + (uploaded + downloaded + 1) + ' processed…');
        const localBlob = await readFile(note.storageKey!);
        const remoteNote = remoteById.get(note.id);
        if (localBlob) locallyAvailable.add(note.id);
        if (!localBlob) {
          if (remoteNote) warnings.push(note.name + ': original missing locally; kept the cloud copy.');
          else warnings.push(note.name + ': original file was not found, so it was not synced.');
          continue;
        }
        if (localBlob.size > MAX_FILE_BYTES) {
          if (remoteNote && remoteNote.size === note.size && remoteNote.createdAt === note.createdAt) {
            cloudNotes.set(note.id, safeCloudNote(note)); locallyAvailable.add(note.id);
          } else {
            warnings.push(note.name + ': skipped because this version limits each cloud-synced file to 25 MB.');
          }
          continue;
        }
        const filePath = user.id + '/' + note.id + '/original';
        const sameRemoteFile = !!remoteNote && remoteNote.size === note.size && remoteNote.createdAt === note.createdAt;
        if (!sameRemoteFile) {
          const { error } = await supabase.storage.from(BUCKET).upload(filePath, localBlob, { upsert: true, contentType: localBlob.type || 'application/octet-stream' });
          if (error) { warnings.push(note.name + ': upload failed. ' + error.message); continue; }
          uploaded += 1;
        }
        const extractedText = await readText(note.storageKey!);
        if (extractedText) {
          const { error: textError } = await supabase.storage.from(BUCKET).upload(user.id + '/' + note.id + '/extracted.txt', new Blob([extractedText], { type: 'text/plain;charset=utf-8' }), { upsert: true, contentType: 'text/plain' });
          if (textError) warnings.push(note.name + ': original saved, but its search-text cache could not be synced.');
        }
        cloudNotes.set(note.id, safeCloudNote(note));
        locallyAvailable.add(note.id);
      }

      const downloadedNotes: CloudNote[] = [];
      for (const remoteNote of remote.notes ?? []) {
        if (locallyAvailable.has(remoteNote.id)) continue;
        setStatus('Restoring cloud files: ' + (downloaded + 1) + '…');
        const { data: blob, error } = await supabase.storage.from(BUCKET).download(user.id + '/' + remoteNote.id + '/original');
        if (error || !blob) { warnings.push(remoteNote.name + ': could not download the cloud original.'); continue; }
        try {
          await writeFile(remoteNote.id, blob);
          const { data: textBlob } = await supabase.storage.from(BUCKET).download(user.id + '/' + remoteNote.id + '/extracted.txt');
          if (textBlob) await writeFile('text-' + remoteNote.id, textBlob);
          downloadedNotes.push({ ...remoteNote, storageKey: remoteNote.id, sample: false });
          downloaded += 1;
        } catch {
          warnings.push(remoteNote.name + ': downloaded, but could not save into this browser’s vault.');
        }
      }

      const mergedProgress = newestProgress(readProgress, remote.readProgress ?? {});
      const mergedBookmarks = mergeBookmarks(readerBookmarks, remote.readerBookmarks ?? {});
      const localToolkit = readJson<CloudSnapshot['studyToolkit']>(TOOLKIT_KEY, null);
      const mergedToolkit = mergeStudyToolkit(localToolkit, remote.studyToolkit ?? null);
      const localActivity = readJson<CloudSnapshot['studyActivity']>(ACTIVITY_KEY, []);
      const mergedActivity = mergeById(localActivity, remote.studyActivity ?? []).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 500);
      const nextNotes = new Map<string, CloudSnapshot['notes'][number]>(cloudNotes);
      for (const note of downloadedNotes) nextNotes.set(note.id, safeCloudNote(note));
      const snapshot: CloudSnapshot = {
        version: 1, syncedAt: new Date().toISOString(), notes: [...nextNotes.values()],
        readProgress: mergedProgress, readerBookmarks: mergedBookmarks,
        studyToolkit: mergedToolkit, studyActivity: mergedActivity,
      };
      const { error: writeError } = await supabase.from(SNAPSHOT_TABLE).upsert({ user_id: user.id, snapshot, updated_at: snapshot.syncedAt }, { onConflict: 'user_id' });
      if (writeError) throw writeError;

      localStorage.setItem(TOOLKIT_KEY, JSON.stringify(mergedToolkit ?? { flashcards: [], glossary: [], recaps: [] }));
      localStorage.setItem(ACTIVITY_KEY, JSON.stringify(mergedActivity));
      localStorage.setItem('mechamind-last-cloud-sync', snapshot.syncedAt);
      setLastSync(snapshot.syncedAt);
      onApplySnapshot({ notes: downloadedNotes, readProgress: mergedProgress, readerBookmarks: mergedBookmarks });
      window.dispatchEvent(new Event('mechamind-cloud-sync-updated'));
      const message = 'Cloud sync complete: ' + uploaded + ' file(s) uploaded, ' + downloaded + ' restored.';
      setStatus(warnings.length ? message + ' ' + warnings.length + ' item(s) need attention.' : message);
      notify(warnings.length ? 'Sync finished with ' + warnings.length + ' warning(s). Review the sync panel.' : message);
    } catch (error) {
      setStatus('Sync could not finish. ' + friendlyError(error) + ' Check the Supabase setup guide and storage policies.');
      notify('Cloud sync failed. Your local files remain on this device.');
    } finally { setBusy(false); }
  }

  async function signOut() {
    if (!supabase || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setStatus('Signed out. Your local vault remains available on this device.');
      notify('Signed out of cloud sync.');
    } catch (error) { setStatus(friendlyError(error)); }
    finally { setBusy(false); }
  }

  return <section className="cloud-sync-panel" aria-labelledby="cloud-sync-title">
    <div className="cloud-sync-heading"><span className="cloud-sync-icon"><Cloud size={19} /></span><div><h3 id="cloud-sync-title">Optional cloud sync</h3><p>Carry your notes and learning progress between devices. Nothing syncs until you ask it to.</p></div></div>
    {!backendConfigured || !supabase ? <div className="cloud-sync-state"><ShieldCheck size={18} /><div><strong>Cloud service needs configuration</strong><p>Set the public Supabase URL and anon key in GitHub repository Actions variables, deploy the database migration and private storage policies, then rebuild the site. Your local library continues to work meanwhile.</p></div></div>
      : user ? <div className="cloud-sync-authenticated"><div className="cloud-sync-user"><span className="cloud-sync-online" /><div><strong>{user.email || 'Signed-in study account'}</strong><small>{lastSync ? 'Last synced ' + new Date(lastSync).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'Not synced on this device yet'}</small></div></div><div className="cloud-sync-caveat">A manual sync uploads original files up to 25 MB each, extracted text, reading progress, bookmarks, study cards, glossary entries, recaps and recent study activity to your private account storage. Local copies stay on this device. For duplicate note IDs, this device’s copy takes priority.</div><div className="cloud-sync-actions"><button type="button" className="cloud-sync-primary" onClick={() => void syncWorkspace()} disabled={busy}><CloudUpload size={15} /> Sync now</button><button type="button" className="cloud-sync-secondary" onClick={() => void signOut()} disabled={busy}><LogOut size={14} /> Sign out</button></div></div>
      : <form className="cloud-sync-signin" onSubmit={requestSignIn}><label htmlFor="cloud-sync-email">Your email</label><div className="cloud-sync-email-row"><input id="cloud-sync-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" required /><button type="submit" disabled={busy}><Link2 size={15} /> Send sign-in link</button></div>{linkSent && <p className="cloud-sync-success">Sign-in link sent. Check your inbox, then return to MechaMind.</p>}</form>}
    {busy && <p className="cloud-sync-status" role="status"><LoaderCircle size={14} className="cloud-sync-spinner" /> {status || 'Working…'}</p>}
    {!busy && status && <p className="cloud-sync-status" role="status">{status}</p>}
    <p className="cloud-sync-footnote">Sync is opt-in and manual. The cloud account stores your study workspace in a private Supabase table and bucket protected by user-level access policies. Export a local backup before your first sync.</p>
  </section>;
}
