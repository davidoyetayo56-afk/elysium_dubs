import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  ArrowDownToLine, ArrowRight, BookOpen, Bookmark, BrainCircuit, CalendarDays,
  Check, ChevronDown, Clock3, Command, File, FileText, FolderOpen, Grid2X2,
  HardDrive, Image as ImageIcon, Library, List, Menu, MessageCircle, MoreHorizontal,
  Plus, Search, Send, Settings2, Sparkles, Star, Trash2, UploadCloud, X, Zap
} from 'lucide-react';
import { backendConfigured, friendlyError, supabase } from './lib/supabase';

type Note = {
  id: string; name: string; subject: string; course: string; kind: string;
  size: number; createdAt: string; starred: boolean; tags: string[];
  storageKey?: string; sample?: boolean;
};
type ChatMessage = { role: 'user' | 'assistant'; content: string };
type Page = 'Overview' | 'My library' | 'Starred' | 'AI study desk';

const DB_NAME = 'mechamind-vault';
const STORE = 'files';
const META_KEY = 'mechamind-notes-v1';
const subjects = ['All subjects', 'Mechatronics', 'Mathematics', 'Physics', 'Chemistry', 'Programming', 'Electronics', 'Other'];

function openVault(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function vaultPut(key: string, file: Blob) {
  const db = await openVault();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(file, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
async function vaultGet(key: string): Promise<Blob | undefined> {
  const db = await openVault();
  const result = await new Promise<Blob | undefined>((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result as Blob | undefined);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result;
}
async function vaultDelete(key: string) {
  const db = await openVault();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
function formatSize(bytes: number) {
  if (!bytes) return '0 KB';
  return bytes < 1024 * 1024 ? Math.max(1, Math.round(bytes / 1024)) + ' KB' : (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
function fileKind(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'PDF';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'Image';
  if (['mp3', 'm4a', 'wav', 'ogg'].includes(ext)) return 'Audio';
  if (['doc', 'docx', 'odt', 'txt', 'rtf'].includes(ext)) return 'Document';
  if (['ppt', 'pptx'].includes(ext)) return 'Slides';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'Spreadsheet';
  return ext ? ext.toUpperCase() : 'File';
}
function fileIcon(kind: string) {
  if (kind === 'Image') return <ImageIcon size={19} />;
  if (kind === 'Audio') return <MessageCircle size={19} />;
  if (kind === 'PDF') return <FileText size={19} />;
  return <File size={19} />;
}
const sampleNotes: Note[] = [
  { id: 'sample-1', name: 'Introduction to Mechatronics', subject: 'Mechatronics', course: 'MCT 101', kind: 'PDF', size: 2450000, createdAt: '2026-10-12T10:00:00.000Z', starred: true, tags: ['lecture', 'foundations'], sample: true },
  { id: 'sample-2', name: 'Vectors and Scalar Products', subject: 'Mathematics', course: 'MTH 101', kind: 'PDF', size: 1380000, createdAt: '2026-10-11T10:00:00.000Z', starred: false, tags: ['week 3', 'revision'], sample: true },
  { id: 'sample-3', name: 'Newtonian Mechanics: Lecture 2', subject: 'Physics', course: 'PHY 101', kind: 'Document', size: 820000, createdAt: '2026-10-10T10:00:00.000Z', starred: true, tags: ['mechanics'], sample: true },
  { id: 'sample-4', name: 'Basic Circuit Analysis', subject: 'Electronics', course: 'EEE 102', kind: 'PDF', size: 3100000, createdAt: '2026-10-08T10:00:00.000Z', starred: false, tags: ['circuits', 'week 2'], sample: true },
];


function inferNoteMetadata(fileName: string, content = '') {
  const clean = fileName.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const text = (clean + ' ' + content.slice(0, 5000)).toLowerCase();
  const rules: Array<[string, RegExp]> = [
    ['Mathematics', /\b(math|mathematics|calculus|algebra|vector|matrix|integration|differentiation|mth\s?10\d|mth\s?20\d)\b/],
    ['Physics', /\b(physics|mechanics|newton|motion|force|energy|thermodynamics|phy\s?10\d|phy\s?20\d)\b/],
    ['Chemistry', /\b(chemistry|chemical|molecule|atom|reaction|organic|inorganic|chm\s?10\d|chm\s?20\d)\b/],
    ['Programming', /\b(programming|python|javascript|typescript|algorithm|software|coding|computer science|csc\s?10\d)\b/],
    ['Electronics', /\b(electronics|circuit|resistor|capacitor|voltage|current|ohm|digital logic|eee\s?10\d)\b/],
    ['Mechatronics', /\b(mechatronics|robotics|robot|sensor|actuator|control system|embedded|mct\s?10\d)\b/],
  ];
  const matched = rules.find(([, pattern]) => pattern.test(text));
  const courseMatch = (clean + ' ' + content.slice(0, 1000)).match(/\b(?:MCT|MTH|PHY|CHM|EEE|CSC|ENG|GNS)\s?[-]?\s?\d{3}\b/i);
  const tags = ['lecture', 'revision', 'assignment', 'practical', 'laboratory', 'worked examples', 'exam prep', 'week 1', 'week 2', 'week 3'].filter(tag => text.includes(tag)).slice(0, 3);
  if (!tags.length) tags.push('lecture');
  if (/\b(assignment|homework|coursework)\b/.test(text) && !tags.includes('assignment')) tags.push('assignment');
  if (/\b(exam|past question|revision|test)\b/.test(text) && !tags.includes('revision')) tags.push('revision');
  return { name: clean || fileName, subject: matched?.[0] ?? 'Other', course: courseMatch ? courseMatch[0].toUpperCase().replace(/\s+/g, ' ') : 'Unsorted', tags: [...new Set(tags)].slice(0, 4) };
}
async function readableText(file: File): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (['txt', 'md', 'csv', 'json', 'html', 'xml', 'rtf'].includes(extension) || file.type.startsWith('text/')) {
    return (await file.text()).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 5000);
  }
  return '';
}
async function aiOrganize(fileName: string, content: string) {
  if (!backendConfigured || !supabase || !content.trim()) return null;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return null;
  const { data, error } = await supabase.functions.invoke('ai-tutor', {
    body: { mode: 'organize', messages: [{ role: 'user', content:
      'Organise this student lecture file. Return ONLY a JSON object with keys name, subject, course, tags. subject must be one of Mechatronics, Mathematics, Physics, Chemistry, Programming, Electronics, Other. tags must be an array of 1-4 short strings. Use filename and excerpt; do not invent facts.\nFilename: ' + fileName + '\nExcerpt: ' + content.slice(0, 3500)
    }] }
  });
  if (error || typeof data?.reply !== 'string') return null;
  try {
    const match = data.reply.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    const allowed = ['Mechatronics', 'Mathematics', 'Physics', 'Chemistry', 'Programming', 'Electronics', 'Other'];
    return {
      name: typeof parsed.name === 'string' ? parsed.name.slice(0, 120) : fileName.replace(/\.[^/.]+$/, ''),
      subject: allowed.includes(parsed.subject) ? parsed.subject : 'Other',
      course: typeof parsed.course === 'string' ? parsed.course.slice(0, 30) : 'Unsorted',
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter((tag: unknown) => typeof tag === 'string').slice(0, 4).map((tag: string) => tag.slice(0, 30)) : ['lecture'],
    };
  } catch { return null; }
}

function localStudyReply(prompt: string): string {
  const p = prompt.toLowerCase();
  if (/newton|force|acceleration/.test(p)) return 'Start with Newton’s second law: F = ma. F is the net force in newtons, m is mass in kilograms, and a is acceleration in m/s². Rearrange to a = F/m. Example: a 12 N force on a 3 kg object gives a = 12/3 = 4 m/s². Try one: what acceleration would a 20 N force produce on a 5 kg object?';
  if (/vector|scalar/.test(p)) return 'A scalar has magnitude only, such as mass or temperature. A vector has both magnitude and direction, such as displacement or force. For vectors A = (a₁, a₂) and B = (b₁, b₂), their dot product is A · B = a₁b₁ + a₂b₂. It produces a scalar. Want to try a worked example?';
  if (/circuit|ohm|resistor/.test(p)) return 'A useful starting point is Ohm’s law: V = IR, where voltage V is measured in volts, current I in amperes, and resistance R in ohms. If a 6 Ω resistor has 12 V across it, the current is I = V/R = 12/6 = 2 A. In a real circuit, check the component ratings before applying power.';
  return 'Let’s break this down together. First, identify the key terms and what the question is asking. Next, connect the idea to one principle or equation, then work through a small example. If you paste the relevant paragraph or upload your note, we can make the explanation specific to your lecture. This is preview mode: live AI answers need the secure AI service connected.';
}

export default function MechaMindApp() {
  const [page, setPage] = useState<Page>('Overview');
  const [notes, setNotes] = useState<Note[]>([]);
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState('All subjects');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [autoOrganize, setAutoOrganize] = useState(true);
  const [menuNote, setMenuNote] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chat, setChat] = useState<ChatMessage[]>([{ role: 'assistant', content: 'Hi! I’m your study desk. Ask a question, choose a topic, or bring a lecture note into the conversation. We’ll work through it step by step.' }]);
  const [mobileNav, setMobileNav] = useState(false);
  const [ready, setReady] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(META_KEY);
      setNotes(stored ? JSON.parse(stored) as Note[] : sampleNotes);
    } catch {
      setNotes(sampleNotes);
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) localStorage.setItem(META_KEY, JSON.stringify(notes));
  }, [notes, ready]);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const filteredNotes = useMemo(() => notes.filter(note => {
    const matchesPage = page !== 'Starred' || note.starred;
    const matchesSubject = subject === 'All subjects' || note.subject === subject;
    const term = query.trim().toLowerCase();
    const matchesQuery = !term || [note.name, note.subject, note.course, ...note.tags].join(' ').toLowerCase().includes(term);
    return matchesPage && matchesSubject && matchesQuery;
  }).sort((a, b) => Number(b.starred) - Number(a.starred) || b.createdAt.localeCompare(a.createdAt)), [notes, page, subject, query]);

  const savedCount = notes.filter(n => !n.sample).length;
  const starredCount = notes.filter(n => n.starred).length;
  const totalBytes = notes.filter(n => !n.sample).reduce((sum, note) => sum + note.size, 0);

  function notify(message: string) { setToast(message); }
  async function importFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    const added: Note[] = [];
    for (const file of list) {
      const id = crypto.randomUUID();
      try { await vaultPut(id, file); }
      catch { notify('Browser storage could not save that file. Try a smaller file or check available storage.'); continue; }
      const extractedText = autoOrganize ? await readableText(file).catch(() => '') : '';
      const guessed = autoOrganize ? inferNoteMetadata(file.name, extractedText) : {
        name: file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim() || file.name,
        subject: 'Other', course: 'Unsorted', tags: ['new import']
      };
      const aiMetadata = autoOrganize && extractedText.length > 30 ? await aiOrganize(file.name, extractedText).catch(() => null) : null;
      const metadata = aiMetadata ?? guessed;
      added.push({
        id, name: metadata.name || guessed.name, subject: metadata.subject || 'Other', course: metadata.course || 'Unsorted',
        kind: fileKind(file.name), size: file.size, createdAt: new Date().toISOString(),
        starred: false, tags: metadata.tags?.length ? metadata.tags : ['lecture'], storageKey: id
      });
    }
    if (added.length) {
      setNotes(current => [...added, ...current.filter(n => !n.sample)]);
      setSubject('All subjects');
      setPage('My library');
      setUploadOpen(false);
      notify(added.length + (added.length === 1 ? ' file added and organised.' : ' files added and organised.') + (autoOrganize ? ' Text files are analysed; other files use filename clues.' : ''));
    }
  }
  async function downloadNote(note: Note) {
    if (note.sample || !note.storageKey) { notify('This is a sample card. Import your own file to download it here.'); return; }
    const blob = await vaultGet(note.storageKey);
    if (!blob) { notify('This file is no longer in browser storage.'); return; }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = note.name + (blob.type === 'application/pdf' ? '.pdf' : '');
    anchor.click();
    URL.revokeObjectURL(url);
    notify('Your file is ready.');
  }
  async function deleteNote(note: Note) {
    if (note.storageKey) await vaultDelete(note.storageKey);
    setNotes(current => current.filter(n => n.id !== note.id));
    setMenuNote(null);
    notify('Note removed from your library.');
  }
  function toggleStar(note: Note) {
    setNotes(current => current.map(n => n.id === note.id ? { ...n, starred: !n.starred } : n));
    setMenuNote(null);
  }
  async function sendQuestion(event: FormEvent) {
    event.preventDefault();
    const prompt = chatInput.trim();
    if (!prompt || chatBusy) return;
    const next = [...chat, { role: 'user' as const, content: prompt }];
    setChat(next);
    setChatInput('');
    setChatBusy(true);
    try {
      if (backendConfigured && supabase) {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session) {
          const { data, error } = await supabase.functions.invoke('ai-tutor', {
            body: { mode: 'explain', messages: next.slice(-16).map(m => ({ role: m.role, content: m.content })) }
          });
          if (error || !data?.reply) throw new Error(data?.error ?? friendlyError(error));
          setChat([...next, { role: 'assistant', content: data.reply }]);
        } else {
          setChat([...next, { role: 'assistant', content: 'Your notes stay available locally. To use the connected AI service, sign in to the configured study account. For now, try a built-in example or paste the exact concept you want to understand.' }]);
        }
      } else {
        await new Promise(resolve => window.setTimeout(resolve, 350));
        setChat([...next, { role: 'assistant', content: localStudyReply(prompt) }]);
      }
    } catch (error) {
      setChat([...next, { role: 'assistant', content: 'I could not reach the live AI service. Your library is still working locally. ' + friendlyError(error) }]);
    } finally {
      setChatBusy(false);
    }
  }

  const pageTitle = page === 'Overview' ? 'Your learning space' : page === 'My library' ? 'My library' : page === 'Starred' ? 'Starred notes' : 'AI study desk';
  const pageSubtitle = page === 'Overview' ? 'A calmer place for all the things you are learning.' : page === 'My library' ? 'Every lecture, handout and revision file, in one place.' : page === 'Starred' ? 'The notes you want to find in a heartbeat.' : 'Ask better questions. Understand the why, not just the answer.';
  const navItems: { name: Page; icon: ReactNode }[] = [
    { name: 'Overview', icon: <Grid2X2 size={18} /> },
    { name: 'My library', icon: <Library size={18} /> },
    { name: 'Starred', icon: <Bookmark size={18} /> },
    { name: 'AI study desk', icon: <BrainCircuit size={18} /> },
  ];

  function choosePage(next: Page) { setPage(next); setMobileNav(false); setSubject('All subjects'); }
  function NoteCard({ note }: { note: Note }) {
    return <article className={'note-card ' + (view === 'list' ? 'note-list' : '')}>
      <div className={'note-cover cover-' + (note.subject.toLowerCase().replace(/[^a-z]/g, '') || 'other')}>
        <div className="cover-top"><span className="file-kind">{fileIcon(note.kind)} {note.kind}</span><button className={'icon-button star-button ' + (note.starred ? 'is-starred' : '')} aria-label="Toggle favourite" onClick={() => toggleStar(note)}><Star size={17} fill={note.starred ? 'currentColor' : 'none'} /></button></div>
        <div className="cover-mark">{note.subject === 'Mathematics' ? '∑' : note.subject === 'Physics' ? '∿' : note.subject === 'Electronics' ? '⌁' : note.subject === 'Mechatronics' ? '⌘' : '✳'}</div>
        <span className="cover-course">{note.course}</span>
      </div>
      <div className="note-card-body">
        <div className="note-meta"><span>{note.subject}</span><span className="meta-dot">·</span><span>{new Date(note.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></div>
        <h3>{note.name}</h3>
        <div className="note-tags">{note.tags.slice(0, 2).map(tag => <span key={tag}>{tag}</span>)}{note.sample && <span className="sample-tag">Sample</span>}</div>
        <div className="note-card-footer"><span><HardDrive size={13} /> {formatSize(note.size)}</span><div className="note-actions"><button className="icon-button" aria-label="Download note" onClick={() => void downloadNote(note)}><ArrowDownToLine size={16} /></button><div className="more-wrap"><button className="icon-button" aria-label="More note actions" onClick={() => setMenuNote(menuNote === note.id ? null : note.id)}><MoreHorizontal size={17} /></button>{menuNote === note.id && <div className="action-menu"><button onClick={() => toggleStar(note)}><Star size={14} /> {note.starred ? 'Remove star' : 'Add star'}</button><button onClick={() => void downloadNote(note)}><ArrowDownToLine size={14} /> Download file</button><button className="danger-action" onClick={() => void deleteNote(note)}><Trash2 size={14} /> Remove note</button></div>}</div></div></div>
      </div>
    </article>;
  }

  return <div className="mm-app">
    <aside className={'sidebar ' + (mobileNav ? 'sidebar-open' : '')}>
      <div className="brand-lockup"><div className="brand-symbol"><span>m</span><i /></div><div><strong>mecha<span>mind</span></strong><small>YOUR LEARNING SPACE</small></div><button className="mobile-close icon-button" onClick={() => setMobileNav(false)}><X size={19} /></button></div>
      <div className="workspace-label">WORKSPACE <ChevronDown size={13} /></div>
      <nav className="main-nav">{navItems.map(item => <button key={item.name} className={'nav-item ' + (page === item.name ? 'nav-active' : '')} onClick={() => choosePage(item.name)}>{item.icon}<span>{item.name}</span>{item.name === 'Starred' && starredCount > 0 && <small>{starredCount}</small>}{item.name === 'My library' && <small>{notes.length}</small>}</button>)}</nav>
      <div className="sidebar-divider" />
      <div className="workspace-label">YOUR SUBJECTS <button className="tiny-add" aria-label="Add subject" onClick={() => notify('Custom subjects are coming in the next build.')}><Plus size={14} /></button></div>
      <div className="subject-nav">{subjects.slice(1).map((s, i) => <button key={s} onClick={() => { setSubject(s); setPage('My library'); setMobileNav(false); }} className={subject === s ? 'subject-active' : ''}><span className={'subject-dot subject-dot-' + i} />{s}</button>)}</div>
      <div className="sidebar-bottom"><div className="storage-card"><div className="storage-icon"><HardDrive size={17} /></div><div className="storage-copy"><strong>Your private vault</strong><span>{savedCount} files saved · {formatSize(totalBytes)}</span></div><div className="storage-meter"><i style={{ width: Math.min(100, totalBytes / (250 * 1024 * 1024) * 100) + '%' }} /></div><small>Stored on this device</small></div><button className="nav-item settings-link" onClick={() => notify('Settings will arrive with cloud sync and account preferences.')}><Settings2 size={17} /><span>Settings</span></button><div className="profile-row"><div className="profile-avatar">D</div><div className="profile-copy"><strong>My workspace</strong><small>Free plan</small></div><MoreHorizontal size={18} /></div></div>
    </aside>

    <main className="main-shell">
      <header className="topbar"><button className="mobile-menu icon-button" onClick={() => setMobileNav(true)}><Menu size={20} /></button><div className="breadcrumb"><span>Workspace</span><span className="crumb-slash">/</span><strong>{page}</strong></div><div className="topbar-actions"><label className="global-search"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search your notes..." /><kbd><Command size={11} /> K</kbd></label><button className="top-upload" onClick={() => setUploadOpen(true)}><Plus size={17} /> <span>Add notes</span></button><div className="top-avatar">D</div></div></header>

      <div className="page-content">
        {page !== 'AI study desk' ? <>
          <section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> YOUR IDEAS, IN GOOD COMPANY</div><h1>{pageTitle}<span className="heading-period">.</span></h1><p>{pageSubtitle}</p></div><button className="primary-button" onClick={() => setUploadOpen(true)}><UploadCloud size={17} /> Import notes <ArrowRight size={16} /></button></section>
          {page === 'Overview' && (
            <section className="welcome-panel">
              <div className="welcome-copy">
                <div className="welcome-pill"><Sparkles size={13} /> A LITTLE MORE CLARITY</div>
                <h2>Make space for <em>big ideas.</em></h2>
                <p>Drop your lecture files here. We’ll help you keep them tidy, so your brain can focus on the interesting bits.</p>
                <button className="welcome-button" onClick={() => setUploadOpen(true)}>Add your first notes <ArrowRight size={16} /></button>
                <div className="welcome-foot">
                  <span><Check size={14} /> Private by default</span>
                  <span><Zap size={14} /> Works offline after loading</span>
                </div>
              </div>
              <div className="welcome-illustration">
                <div className="orbit-ring ring-one" />
                <div className="orbit-ring ring-two" />
                <div className="floating-note floating-note-one"><FileText size={20} /><span><b>Lecture notes</b><small>Neatly organised</small></span></div>
                <div className="floating-note floating-note-two"><BookOpen size={20} /><span><b>Study smarter</b><small>One topic at a time</small></span></div>
                <div className="brain-orb"><BrainCircuit size={51} strokeWidth={1.35} /></div>
                <span className="orbit-spark">✦</span>
              </div>
            </section>
          )}
          <section className="stats-row"><div className="stat-card"><div className="stat-icon stat-lilac"><Library size={18} /></div><div><span>Total notes</span><strong>{notes.filter(n => !n.sample).length}<small>{notes.some(n => n.sample) ? ' + samples' : ' files'}</small></strong></div><span className="stat-trend"><ArrowRight size={14} /></span></div><div className="stat-card"><div className="stat-icon stat-peach"><Bookmark size={18} /></div><div><span>Starred notes</span><strong>{starredCount}<small> saved for later</small></strong></div><span className="stat-trend"><Star size={14} /></span></div><div className="stat-card"><div className="stat-icon stat-mint"><CalendarDays size={18} /></div><div><span>Study rhythm</span><strong>{savedCount ? 'Building' : 'Ready'}<small> one step at a time</small></strong></div><span className="stat-trend"><Zap size={14} /></span></div></section>
          <section className="library-section"><div className="section-heading"><div><div className="section-kicker">{page === 'Starred' ? 'YOUR FAVOURITES' : page === 'My library' ? 'THE COLLECTION' : 'PICK UP WHERE YOU LEFT OFF'}</div><h2>{page === 'Starred' ? 'Saved for later' : page === 'My library' ? 'All your notes' : 'Recently organised'} <span>{filteredNotes.length}</span></h2></div><div className="library-tools"><label className="subject-select"><select value={subject} onChange={e => setSubject(e.target.value)}>{subjects.map(s => <option key={s}>{s}</option>)}</select><ChevronDown size={15} /></label><div className="view-toggle"><button aria-label="Grid view" className={view === 'grid' ? 'view-active' : ''} onClick={() => setView('grid')}><Grid2X2 size={16} /></button><button aria-label="List view" className={view === 'list' ? 'view-active' : ''} onClick={() => setView('list')}><List size={17} /></button></div></div></div>
            {filteredNotes.length ? <div className={'notes-grid ' + (view === 'list' ? 'list-view' : '')}>{filteredNotes.map(note => <NoteCard key={note.id} note={note} />)}</div> : <div className="empty-state"><div className="empty-icon"><FolderOpen size={25} /></div><h3>No notes found</h3><p>Try another search or import a lecture file to start your collection.</p><button className="primary-button" onClick={() => setUploadOpen(true)}><Plus size={16} /> Add a note</button></div>}
          </section>
          {page === 'Overview' && <section className="whatsapp-tip"><div className="whatsapp-mark"><MessageCircle size={21} /></div><div><strong>Notes arriving through WhatsApp?</strong><p>Open the lecture in WhatsApp, save or share the attachment to your device, then import it here. Direct WhatsApp linking is a future upgrade.</p></div><button onClick={() => setUploadOpen(true)}>Import a file <ArrowRight size={15} /></button></section>}
        </> : <section className="study-page"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> THINK IT THROUGH</div><h1>AI study desk<span className="heading-period">.</span></h1><p>One question can unlock a whole topic. Start anywhere.</p></div><div className="ai-status"><span /> {backendConfigured ? 'AI service configured' : 'Study preview'}</div></div><div className="study-layout"><aside className="study-aside"><div className="study-aside-icon"><BrainCircuit size={25} /></div><h2>Learn for understanding.</h2><p>Bring a question, a tricky formula or a concept you want to see from a different angle.</p><div className="study-divider" /><span className="section-kicker">QUICK STARTS</span><button onClick={() => setChatInput('Explain Newton’s second law with a worked example.')}><Zap size={16} /><span><b>Explain a concept</b><small>Simple steps and examples</small></span><ArrowRight size={15} /></button><button onClick={() => setChatInput('Quiz me on vectors and scalar products.')}><Check size={16} /><span><b>Quiz me</b><small>Practise active recall</small></span><ArrowRight size={15} /></button><button onClick={() => setChatInput('Make a 30-minute study plan for my next lecture.')}><CalendarDays size={16} /><span><b>Make a study plan</b><small>Small steps, clear goals</small></span><ArrowRight size={15} /></button><div className="study-note-link"><BookOpen size={17} /><span><b>Use your own notes</b><small>Paste an excerpt into the chat to discuss it.</small></span></div></aside><div className="chat-panel"><div className="chat-panel-head"><div className="chat-bot-icon"><Sparkles size={18} /></div><div><strong>MechaMind companion</strong><small>Curious is a good place to start</small></div><button className="icon-button" onClick={() => setChat([{ role: 'assistant', content: 'Fresh page, fresh perspective. What would you like to understand today?' }])}><MoreHorizontal size={18} /></button></div><div className="chat-messages">{chat.map((message, index) => <div key={index} className={'chat-message ' + (message.role === 'user' ? 'user-message' : '')}><div className="message-avatar">{message.role === 'assistant' ? <Sparkles size={15} /> : 'D'}</div><div className="message-bubble">{message.content.split('\n').map((line, i) => <p key={i}>{line || '\u00a0'}</p>)}</div></div>)}{chatBusy && <div className="chat-message"><div className="message-avatar"><Sparkles size={15} /></div><div className="typing-dots"><i /><i /><i /></div></div>}<div ref={dropRef} /></div><form className="chat-composer" onSubmit={sendQuestion}><textarea value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Ask anything you're learning..." rows={2} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendQuestion(e as unknown as FormEvent); } }} /><div className="composer-footer"><span><Sparkles size={13} /> Check the reasoning, not just the result</span><button type="submit" disabled={!chatInput.trim() || chatBusy} aria-label="Send message"><Send size={17} /></button></div></form><div className="chat-disclaimer">Preview answers are built in. Live AI requires a configured secure service and sign-in.</div></div></div></section>}
          <footer className="page-footer"><span>Made for curious minds <span className="footer-spark">✳</span></span><span><span className="privacy-dot" /> Your files stay on this device in this version</span></footer>
      </div>
    </main>

    {mobileNav && <button className="mobile-scrim" aria-label="Close menu" onClick={() => setMobileNav(false)} />}
    {uploadOpen && <div className="modal-scrim" onClick={() => setUploadOpen(false)}><div className="upload-modal" onClick={e => e.stopPropagation()}><div className="modal-head"><div><span className="section-kicker">GROW YOUR LIBRARY</span><h2>Bring your notes in.</h2><p>PDFs, slides, documents, images and audio files are welcome.</p></div><button className="icon-button" onClick={() => setUploadOpen(false)}><X size={19} /></button></div><label className="auto-organize-toggle"><input type="checkbox" checked={autoOrganize} onChange={e => setAutoOrganize(e.target.checked)} /><span className="auto-organize-icon"><Sparkles size={17} /></span><span><strong>Auto-organise my notes</strong><small>Suggests subjects, course codes and tags. Connected AI can analyse readable text files.</small></span><span className={"toggle-track " + (autoOrganize ? "toggle-on" : "")}><i /></span></label><div className={'drop-zone ' + (dragging ? 'drop-zone-active' : '')} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); void importFiles(e.dataTransfer.files); }}><div className="drop-icon"><UploadCloud size={25} /></div><strong>Drag your files here</strong><span>or choose them from your device</span><button className="primary-button" onClick={() => fileInput.current?.click()}><Plus size={16} /> Choose files</button><small>Files are stored in this browser, not uploaded to a cloud server.</small></div><input ref={fileInput} type="file" multiple hidden onChange={e => { if (e.target.files) void importFiles(e.target.files); e.currentTarget.value = ''; }} /><div className="import-hint"><div className="hint-icon"><MessageCircle size={17} /></div><div><strong>Import from WhatsApp</strong><p>Save the document from WhatsApp to your device first, then select it above. You can also drag files straight from your Downloads folder.</p></div></div><div className="modal-bottom"><span><Check size={14} /> No subscription. No upload limit set by us.</span><button className="text-button" onClick={() => setUploadOpen(false)}>Done</button></div></div></div>}
    {toast && <div className="toast"><Check size={16} /> {toast}</div>}
  </div>;
}
