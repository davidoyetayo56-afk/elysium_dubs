import './study-analytics.css';
import { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowRight, BookOpen, CalendarDays, Clock3, Flame, Layers, Target, TrendingUp } from 'lucide-react';

type AnalyticsNote = { id: string; name: string; course: string; subject: string; sample?: boolean };
type ProgressRecord = { ratio: number; updatedAt?: string };
type ActivityEntry = { id: string; type: string; at: string; noteId?: string; noteName?: string; seconds?: number };
type Flashcard = { id: string; noteId: string; noteName: string; dueAt: string; intervalDays: number; repetitions: number; lastReviewedAt?: string };
type ToolkitStore = { flashcards?: Flashcard[]; glossary?: unknown[]; recaps?: unknown[] };
const ACTIVITY_KEY = 'mechamind-study-events-v1';
const TOOLKIT_KEY = 'mechamind-learning-tools-v1';
function localDateKey(date: Date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}
function readActivity(): ActivityEntry[] {
  try {
    const value = JSON.parse(localStorage.getItem(ACTIVITY_KEY) || '[]');
    return Array.isArray(value) ? value.filter((entry: ActivityEntry) => entry && typeof entry.at === 'string') : [];
  } catch { return []; }
}
function readToolkit(): ToolkitStore {
  try { return JSON.parse(localStorage.getItem(TOOLKIT_KEY) || '{}') as ToolkitStore; } catch { return {}; }
}
const labels: Record<string, string> = {
  'note-imported': 'Imported a lecture',
  'reading-opened': 'Opened a lecture',
  'reading-minute': 'Reading time',
  'study-set-generated': 'Generated study set',
  'flashcard-added': 'Added a flashcard',
  'flashcard-reviewed': 'Reviewed a flashcard',
  'glossary-term-added': 'Added a glossary term',
  'practice-completed': 'Completed a practice round',
  'recap-reviewed': 'Reviewed a lecture recap',
};
const icons: Record<string, string> = {
  'note-imported': 'Import', 'reading-opened': 'Reading', 'reading-minute': 'Reading',
  'study-set-generated': 'Study set', 'flashcard-added': 'Flashcard', 'flashcard-reviewed': 'Review',
  'glossary-term-added': 'Glossary', 'practice-completed': 'Practice', 'recap-reviewed': 'Recap',
};
export default function StudyAnalytics({
  notes, readProgress, onGoToToolkit, onGoToLibrary,
}: {
  notes: AnalyticsNote[];
  readProgress: Record<string, ProgressRecord>;
  onGoToToolkit: () => void;
  onGoToLibrary: () => void;
}) {
  const [events, setEvents] = useState<ActivityEntry[]>(readActivity);
  const [toolkit, setToolkit] = useState<ToolkitStore>(readToolkit);
  const [windowDays, setWindowDays] = useState<7 | 14>(7);
  useEffect(() => {
    const refresh = () => { setEvents(readActivity()); setToolkit(readToolkit()); };
    window.addEventListener('mechamind-activity-updated', refresh);
    window.addEventListener('mechamind-cloud-sync-updated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('mechamind-activity-updated', refresh);
      window.removeEventListener('mechamind-cloud-sync-updated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  const realNotes = useMemo(() => notes.filter(note => !note.sample), [notes]);
  const cards = toolkit.flashcards ?? [];
  const dueCards = cards.filter(card => new Date(card.dueAt).getTime() <= Date.now());
  const reviewedToday = cards.filter(card => card.lastReviewedAt && new Date(card.lastReviewedAt).toDateString() === new Date().toDateString()).length;
  const mastered = cards.filter(card => card.intervalDays >= 14).length;
  const progressValues = realNotes.map(note => Math.max(0, Math.min(1, readProgress[note.id]?.ratio ?? 0)));
  const averageProgress = progressValues.length ? progressValues.reduce((sum, value) => sum + value, 0) / progressValues.length : 0;
  const completedNotes = progressValues.filter(value => value >= .95).length;
  const dateKeys = useMemo(() => Array.from({ length: windowDays }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (windowDays - 1 - index));
    return { key: localDateKey(date), label: date.toLocaleDateString('en-GB', { weekday: 'short' }), dateLabel: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) };
  }), [windowDays]);
  const activityByDate = useMemo(() => {
    const result: Record<string, { actions: number; minutes: number }> = {};
    for (const event of events) {
      const date = new Date(event.at);
      if (Number.isNaN(date.getTime())) continue;
      const key = localDateKey(date);
      if (!result[key]) result[key] = { actions: 0, minutes: 0 };
      if (event.type === 'reading-minute') result[key].minutes += 1;
      else result[key].actions += 1;
    }
    return result;
  }, [events]);
  const maxActivity = Math.max(1, ...dateKeys.map(day => (activityByDate[day.key]?.actions ?? 0) + (activityByDate[day.key]?.minutes ?? 0)));
  const activeDayKeys = new Set(events.filter(event => event.type !== 'reading-minute').map(event => {
    const date = new Date(event.at);
    return Number.isNaN(date.getTime()) ? '' : localDateKey(date);
  }));
  const streak = useMemo(() => {
    let count = 0;
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    if (!activeDayKeys.has(localDateKey(date))) date.setDate(date.getDate() - 1);
    while (activeDayKeys.has(localDateKey(date)) && count < 365) { count += 1; date.setDate(date.getDate() - 1); }
    return count;
  }, [activeDayKeys]);
  const studyMinutes = events.filter(event => event.type === 'reading-minute').length;
  const recentEvents = events.filter(event => event.type !== 'reading-minute').slice().sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
  const mostActiveCourses = useMemo(() => {
    const noteById = new Map(realNotes.map(note => [note.id, note]));
    const counts = new Map<string, { course: string; subject: string; count: number }>();
    for (const event of events.filter(item => item.type !== 'reading-minute')) {
      const note = event.noteId ? noteById.get(event.noteId) : undefined;
      if (!note) continue;
      const key = note.course && note.course !== 'Unsorted' ? note.course : note.subject;
      const existing = counts.get(key) ?? { course: key || 'Uncategorised', subject: note.subject, count: 0 };
      existing.count += 1; counts.set(key, existing);
    }
    return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 4);
  }, [events, realNotes]);
  const hasActivity = recentEvents.length > 0 || cards.length > 0 || realNotes.length > 0;
  return <section className="study-analytics-page">
    <header className="analytics-heading"><div><span className="analytics-eyebrow"><Activity size={14} /> Your learning signals</span><h1>Progress, not guesswork<span>.</span></h1><p>See what you have actually read, reviewed and practised on this device.</p></div><div className="analytics-local-pill"><span /> Local-first analytics</div></header>
    <div className="analytics-note"><strong>Privacy note</strong><span>These estimates use your local reading progress and recorded study actions. They do not measure concentration or prove mastery. The activity log keeps up to 500 recent actions.</span></div>
    <div className="analytics-metrics">
      <article><span className="analytics-metric-icon"><BookOpen size={17} /></span><span>Lectures completed</span><strong>{completedNotes}<small> / {realNotes.length}</small></strong><div className="analytics-meter"><i style={{ width: (realNotes.length ? completedNotes / realNotes.length * 100 : 0) + '%' }} /></div></article>
      <article><span className="analytics-metric-icon"><Layers size={17} /></span><span>Cards due</span><strong>{dueCards.length}</strong><small>{cards.length} total · {mastered} with 14+ day interval</small></article>
      <article><span className="analytics-metric-icon"><Clock3 size={17} /></span><span>Tracked reading</span><strong>{studyMinutes}<small> min</small></strong><small>Approximate, while this tab is visible</small></article>
      <article><span className="analytics-metric-icon"><Flame size={17} /></span><span>Active-day streak</span><strong>{streak}<small> day{streak === 1 ? '' : 's'}</small></strong><small>{reviewedToday} cards reviewed today</small></article>
    </div>
    <div className="analytics-main-grid">
      <article className="analytics-panel analytics-chart-panel"><div className="analytics-panel-heading"><div><span className="analytics-kicker">Consistency</span><h2>Your study activity</h2></div><select aria-label="Activity chart date range" value={windowDays} onChange={event => setWindowDays(Number(event.target.value) as 7 | 14)}><option value={7}>Last 7 days</option><option value={14}>Last 14 days</option></select></div><div className="analytics-chart" style={{ gridTemplateColumns: 'repeat(' + windowDays + ', minmax(0, 1fr))' }} role="img" aria-label={'Daily study actions across ' + windowDays + ' days'}>{dateKeys.map(day => { const item = activityByDate[day.key] ?? { actions: 0, minutes: 0 }; const total = item.actions + item.minutes; return <div className="analytics-chart-day" key={day.key} title={day.dateLabel + ': ' + item.actions + ' actions, ' + item.minutes + ' reading minutes'}><div className="analytics-chart-barspace"><span className="analytics-chart-count">{total || ''}</span><div className="analytics-chart-track"><i style={{ height: (item.actions ? item.actions / maxActivity * 100 : 0) + '%' }} /><b style={{ height: (item.minutes ? item.minutes / maxActivity * 100 : 0) + '%' }} /></div></div><span className="analytics-chart-dayname">{day.label}</span><small>{day.dateLabel}</small></div>; })}</div><div className="analytics-chart-legend"><span><i /> Logged actions</span><span><i /> Visible-tab reading minutes</span></div></article>
      <article className="analytics-panel"><div className="analytics-panel-heading"><div><span className="analytics-kicker">Reading progress</span><h2>Notes in motion</h2></div><span className="analytics-panel-icon"><TrendingUp size={19} /></span></div><div className="analytics-progress-summary"><strong>{Math.round(averageProgress * 100)}%</strong><span>average reader progress across saved notes</span></div>{realNotes.length ? <div className="analytics-note-list">{realNotes.slice().sort((a, b) => (readProgress[b.id]?.updatedAt ?? '').localeCompare(readProgress[a.id]?.updatedAt ?? '')).slice(0, 5).map(note => { const ratio = Math.round((readProgress[note.id]?.ratio ?? 0) * 100); return <div className="analytics-note-row" key={note.id}><div><strong>{note.name}</strong><small>{note.course} · {note.subject}</small></div><span>{ratio}%</span><i><b style={{ width: ratio + '%' }} /></i></div>; })}</div> : <p className="analytics-empty-copy">Import a lecture to start tracking reading progress.</p>}<button type="button" className="analytics-text-action" onClick={onGoToLibrary}>Open library <ArrowRight size={14} /></button></article>
      <article className="analytics-panel"><div className="analytics-panel-heading"><div><span className="analytics-kicker">Course momentum</span><h2>Where you have been studying</h2></div><span className="analytics-panel-icon"><Target size={19} /></span></div>{mostActiveCourses.length ? <div className="analytics-course-list">{mostActiveCourses.map(item => <div className="analytics-course-row" key={item.course}><div><strong>{item.course}</strong><small>{item.subject}</small></div><span>{item.count} actions</span></div>)}</div> : <p className="analytics-empty-copy">Course activity will appear as you open lectures, review cards and build study sets.</p>}<button type="button" className="analytics-text-action" onClick={onGoToToolkit}>Open study toolkit <ArrowRight size={14} /></button></article>
      <article className="analytics-panel analytics-recent-panel"><div className="analytics-panel-heading"><div><span className="analytics-kicker">Recent signals</span><h2>Latest study actions</h2></div><span className="analytics-panel-icon"><CalendarDays size={19} /></span></div>{recentEvents.length ? <div className="analytics-event-list">{recentEvents.map(event => <div className="analytics-event-row" key={event.id}><span className="analytics-event-dot" /><div><strong>{labels[event.type] ?? 'Study activity'}</strong><small>{event.noteName || (icons[event.type] ?? 'MechaMind')}</small></div><time>{new Date(event.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time></div>)}</div> : <p className="analytics-empty-copy">{hasActivity ? 'Your new study actions will appear here.' : 'No tracked actions yet. Open a lecture or review a flashcard to begin.'}</p>}</article>
    </div>
  </section>;
}
