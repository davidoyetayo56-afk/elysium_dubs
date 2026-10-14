import './study-toolkit.css';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { BookOpenCheck, BrainCircuit, Check, ChevronRight, CircleHelp, Clock3, FileText, Layers, Plus, RotateCcw, Sparkles, Target, Trash2 } from 'lucide-react';

export type StudyNote = { id: string; name: string; subject: string; course: string; kind: string; sample?: boolean; storageKey?: string };
export type StudySource = { note: StudyNote; text: string };
type Flashcard = { id: string; noteId: string; noteName: string; front: string; back: string; createdAt: string; dueAt: string; lastReviewedAt?: string; intervalDays: number; ease: number; repetitions: number; generated?: boolean };
type GlossaryTerm = { id: string; noteId: string; noteName: string; term: string; definition: string; createdAt: string; generated?: boolean };
type Recap = { id: string; noteId: string; noteName: string; course: string; subject: string; summary: string[]; keyTerms: string[]; equations: string[]; createdAt: string; reviewedAt?: string };
type ToolkitData = { flashcards: Flashcard[]; glossary: GlossaryTerm[]; recaps: Recap[] };
type ToolkitTab = 'Overview' | 'Flashcards' | 'Glossary' | 'Practice' | 'Recaps';

const STORAGE_KEY = 'mechamind-learning-tools-v1';
const emptyData: ToolkitData = { flashcards: [], glossary: [], recaps: [] };
const stopWords = new Set(('about above after again against all also any are around because been before being below between both but can could did does each either else for from further have having into its just more most much must not often other our out over same should some such than that the their them then there these they this those through too under until very was were what when where which while who will with would your you has had use used using upon per via').split(' '));
function loadData(): ToolkitData {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return emptyData;
    const parsed = JSON.parse(saved) as Partial<ToolkitData>;
    return { flashcards: Array.isArray(parsed.flashcards) ? parsed.flashcards : [], glossary: Array.isArray(parsed.glossary) ? parsed.glossary : [], recaps: Array.isArray(parsed.recaps) ? parsed.recaps : [] };
  } catch { return emptyData; }
}
function makeId() { try { return crypto.randomUUID(); } catch { return 'mm-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9); } }
function normaliseText(text: string) { return text.replace(/\r/g, '').replace(/\[PAGE\s+\d+\]/gi, '').replace(/\[NOTE:[^\]]*\]/gi, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim(); }
function splitIntoSentences(text: string) { return normaliseText(text).split(/\n+|(?<=[.!?])\s+/).map(line => line.trim().replace(/^[-•*\d.)\s]+/, '')).filter(line => line.length >= 28 && line.length <= 260); }
function wordFrequency(text: string) {
  const counts = new Map<string, number>();
  for (const match of text.toLowerCase().matchAll(/[a-z][a-z-]{3,}/g)) {
    const word = match[0];
    if (!stopWords.has(word)) counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([word]) => word);
}
function buildArtifacts(source: StudySource) {
  const text = normaliseText(source.text);
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length >= 6 && line.length <= 220);
  const sentences = splitIntoSentences(text);
  const frequent = wordFrequency(text).slice(0, 12);
  const cards: Flashcard[] = [];
  const glossary: GlossaryTerm[] = [];
  const now = new Date().toISOString();
  const addCard = (front: string, back: string) => {
    const f = front.trim(), b = back.trim();
    if (!f || !b || cards.some(card => card.front.toLowerCase() === f.toLowerCase())) return;
    cards.push({ id: makeId(), noteId: source.note.id, noteName: source.note.name, front: f, back: b, createdAt: now, dueAt: now, intervalDays: 0, ease: 2.5, repetitions: 0, generated: true });
  };
  const addTerm = (term: string, definition: string) => {
    const cleanTerm = term.trim().replace(/^[^a-z0-9]+|[^a-z0-9)]+$/gi, '');
    const cleanDefinition = definition.trim();
    if (cleanTerm.length < 2 || cleanTerm.length > 65 || cleanDefinition.length < 12) return;
    if (glossary.some(item => item.term.toLowerCase() === cleanTerm.toLowerCase())) return;
    glossary.push({ id: makeId(), noteId: source.note.id, noteName: source.note.name, term: cleanTerm, definition: cleanDefinition, createdAt: now, generated: true });
  };
  for (const sentence of sentences) {
    const match = sentence.match(/^(?:the\s+)?([A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z][A-Za-z0-9-]*){0,5})\s+(is defined as|can be defined as|refers to|means|denotes|is|are)\s+(.{10,190})$/i);
    if (!match) continue;
    const term = match[1].trim();
    if (/^(it|this|that|there|they|we|you|he|she|these|those|the process|the result|the value|the equation|the system)$/i.test(term)) continue;
    const definition = sentence.replace(/[.!?]+$/, '');
    addTerm(term, definition);
    addCard('Define ' + term + '.', definition);
  }
  const formulaLines = lines.filter(line => /(?:=|→|⇌|∫|∑|∇|√|Δ|±|≤|≥|\bF\s*=|\bv\s*=|\bI\s*=|\bV\s*=)/.test(line) && line.length >= 5 && line.length <= 150);
  formulaLines.slice(0, 8).forEach(line => {
    const lineIndex = lines.indexOf(line);
    const before = lineIndex > 0 ? lines[lineIndex - 1] : '';
    const clue = before && before !== line ? before.replace(/[.!?]+$/, '').slice(0, 78) : 'the main relationship in this lecture';
    addCard('Reproduce the equation or relationship for: ' + clue + (clue.length >= 78 ? '…' : ''), line);
  });
  const keywords = frequent.filter(word => word.length > 4).slice(0, 10);
  const usedSentences = new Set<string>();
  for (const sentence of sentences) {
    if (cards.length >= 18) break;
    if (sentence.length < 38 || usedSentences.has(sentence)) continue;
    const keyword = keywords.find(word => new RegExp('\\b' + word + '\\b', 'i').test(sentence));
    if (!keyword) continue;
    const cloze = sentence.replace(new RegExp('\\b' + keyword + '\\b', 'i'), '________');
    if (cloze === sentence) continue;
    addCard('Complete the statement from ' + source.note.name + ': ' + cloze, sentence);
    usedSentences.add(sentence);
  }
  if (cards.length < 4 && sentences.length) sentences.slice(0, 8).forEach((sentence, index) => {
    if (cards.length < 8) addCard('Recall a key point from ' + source.note.name + ' (' + (index + 1) + ').', sentence);
  });
  if (glossary.length < 3) {
    const seen = new Set(glossary.map(item => item.term.toLowerCase()));
    for (const term of frequent) {
      if (glossary.length >= 12) break;
      if (term.length < 5 || seen.has(term)) continue;
      const evidence = sentences.find(sentence => sentence.toLowerCase().includes(term));
      if (!evidence) continue;
      addTerm(term, 'Context from ' + source.note.name + ': ' + evidence);
      seen.add(term);
    }
  }
  return {
    cards, glossary,
    recap: { id: makeId(), noteId: source.note.id, noteName: source.note.name, course: source.note.course, subject: source.note.subject, summary: sentences.slice(0, 6), keyTerms: frequent.slice(0, 8), equations: [...new Set(formulaLines)].slice(0, 8), createdAt: now } as Recap,
  };
}
function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not scheduled' : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
function dueNow(card: Flashcard) { return new Date(card.dueAt).getTime() <= Date.now(); }
function dueIn(ms: number) { return new Date(Date.now() + ms).toISOString(); }
function applyRating(card: Flashcard, rating: 'again' | 'hard' | 'good' | 'easy'): Flashcard {
  const ease = Math.max(1.3, card.ease + (rating === 'again' ? -0.2 : rating === 'hard' ? -0.08 : rating === 'easy' ? 0.15 : 0));
  let interval = card.intervalDays;
  let repetitions = card.repetitions;
  let waitMs: number;
  if (rating === 'again') { interval = 0; repetitions = 0; waitMs = 10 * 60 * 1000; }
  else if (rating === 'hard') { interval = Math.max(1, interval ? interval * 1.2 : 1); repetitions += 1; waitMs = interval * 86400000; }
  else if (rating === 'good') { interval = repetitions === 0 ? 1 : Math.max(2, interval * ease); repetitions += 1; waitMs = interval * 86400000; }
  else { interval = repetitions === 0 ? 4 : Math.max(4, interval * (ease + 0.35)); repetitions += 1; waitMs = interval * 86400000; }
  interval = Math.min(interval, 365);
  return { ...card, ease, intervalDays: interval, repetitions, dueAt: dueIn(waitMs), lastReviewedAt: new Date().toISOString() };
}

export default function StudyToolkit({ notes, getSource, notify, onActivity }: { notes: StudyNote[]; getSource: (noteId: string) => Promise<StudySource | null>; notify: (message: string) => void; onActivity: (type: string, noteId?: string, noteName?: string) => void }) {
  const [data, setData] = useState<ToolkitData>(loadData);
  const [tab, setTab] = useState<ToolkitTab>('Overview');
  const [selectedNoteId, setSelectedNoteId] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [draftFront, setDraftFront] = useState('');
  const [draftBack, setDraftBack] = useState('');
  const [draftTerm, setDraftTerm] = useState('');
  const [draftDefinition, setDraftDefinition] = useState('');
  const [termSearch, setTermSearch] = useState('');
  const [showAnswer, setShowAnswer] = useState(false);
  const [reviewCardId, setReviewCardId] = useState('');
  const [practiceCards, setPracticeCards] = useState<Flashcard[]>([]);
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [practiceChoice, setPracticeChoice] = useState('');
  const [practiceScore, setPracticeScore] = useState(0);
  const [practiceFinished, setPracticeFinished] = useState(false);
  const [practiceStarted, setPracticeStarted] = useState(false);
  const [recapFilter, setRecapFilter] = useState('All notes');
  const sourceNotes = useMemo(() => notes.filter(note => !note.sample && !!note.storageKey), [notes]);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
    catch { notify('Study tools could not be saved because browser storage may be full.'); }
  }, [data]);
  useEffect(() => {
    if (selectedNoteId && !sourceNotes.some(note => note.id === selectedNoteId)) setSelectedNoteId('');
  }, [selectedNoteId, sourceNotes]);
  const dueCards = useMemo(() => data.flashcards.filter(dueNow).sort((a, b) => a.dueAt.localeCompare(b.dueAt)), [data.flashcards]);
  const dueForDeck = dueCards.filter(card => !selectedNoteId || card.noteId === selectedNoteId);
  const reviewCard = data.flashcards.find(card => card.id === reviewCardId);
  const selectedNote = sourceNotes.find(note => note.id === selectedNoteId);
  const noteCards = data.flashcards.filter(card => !selectedNoteId || card.noteId === selectedNoteId);
  const noteTerms = data.glossary.filter(term => !selectedNoteId || term.noteId === selectedNoteId);
  const visibleTerms = noteTerms.filter(term => (term.term + ' ' + term.definition + ' ' + term.noteName).toLowerCase().includes(termSearch.toLowerCase()));
  const selectedRecaps = data.recaps.filter(recap => recapFilter === 'All notes' || recap.noteId === recapFilter).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const masteredCount = data.flashcards.filter(card => card.intervalDays >= 14).length;
  const todayReviews = data.flashcards.filter(card => card.lastReviewedAt && new Date(card.lastReviewedAt).toDateString() === new Date().toDateString()).length;
  const questionOptions = useMemo(() => {
    const current = practiceCards[practiceIndex];
    if (!current) return [];
    const distractors = practiceCards.filter(card => card.id !== current.id && card.back !== current.back).map(card => card.back).filter((answer, index, list) => list.indexOf(answer) === index).slice(0, 3);
    return [current.back, ...distractors].sort(() => Math.random() - 0.5);
  }, [practiceCards, practiceIndex]);
  function selectTab(next: ToolkitTab) { setTab(next); setShowAnswer(false); setReviewCardId(''); }
  async function generateForNote(event?: FormEvent) {
    event?.preventDefault();
    if (!selectedNoteId || isGenerating) { if (!sourceNotes.length) notify('Import a real lecture file before creating source-based study sets.'); return; }
    setIsGenerating(true);
    try {
      const source = await getSource(selectedNoteId);
      if (!source || source.text.trim().length < 40) { notify('There is not enough readable text. Text-based PDFs, DOCX and TXT work best; scanned PDFs need OCR.'); return; }
      const artifacts = buildArtifacts(source);
      if (!artifacts.cards.length && !artifacts.glossary.length && !artifacts.recap.summary.length) { notify('No usable text was found. Try a selectable-text file or add cards manually.'); return; }
      setData(previous => ({
        flashcards: [...previous.flashcards.filter(card => card.noteId !== selectedNoteId || !card.generated), ...artifacts.cards],
        glossary: [...previous.glossary.filter(term => term.noteId !== selectedNoteId || !term.generated), ...artifacts.glossary],
        recaps: [...previous.recaps.filter(recap => recap.noteId !== selectedNoteId), artifacts.recap],
      }));
      setReviewCardId(''); setShowAnswer(false); setTab('Overview');
      onActivity('study-set-generated', source.note.id, source.note.name);
      notify('Study set created from ' + source.note.name + '. Check every draft against the original lecture.');
    } catch { notify('Could not build the study set from this file. Try opening it in the reading room first.'); }
    finally { setIsGenerating(false); }
  }
  function addManualCard(event: FormEvent) {
    event.preventDefault();
    if (!draftFront.trim() || !draftBack.trim()) { notify('Add both a question and its answer.'); return; }
    const card: Flashcard = { id: makeId(), noteId: selectedNote?.id ?? 'manual-deck', noteName: selectedNote?.name ?? 'My own cards', front: draftFront.trim(), back: draftBack.trim(), createdAt: new Date().toISOString(), dueAt: new Date().toISOString(), intervalDays: 0, ease: 2.5, repetitions: 0 };
    setData(previous => ({ ...previous, flashcards: [...previous.flashcards, card] }));
    onActivity('flashcard-added', card.noteId, card.noteName);
    setDraftFront(''); setDraftBack(''); notify('Flashcard added to your local study deck.');
  }
  function addManualTerm(event: FormEvent) {
    event.preventDefault();
    if (!draftTerm.trim() || !draftDefinition.trim()) { notify('Add both a term and its definition.'); return; }
    setData(previous => ({ ...previous, glossary: [...previous.glossary, { id: makeId(), noteId: selectedNote?.id ?? 'manual-deck', noteName: selectedNote?.name ?? 'My glossary', term: draftTerm.trim(), definition: draftDefinition.trim(), createdAt: new Date().toISOString() }] }));
    onActivity('glossary-term-added', selectedNote?.id, selectedNote?.name);
    setDraftTerm(''); setDraftDefinition(''); notify('Glossary entry saved on this device.');
  }
  function rateCard(rating: 'again' | 'hard' | 'good' | 'easy') {
    if (!reviewCard) return;
    const updated = applyRating(reviewCard, rating);
    const nextCards = data.flashcards.map(card => card.id === reviewCard.id ? updated : card);
    setData(previous => ({ ...previous, flashcards: previous.flashcards.map(card => card.id === reviewCard.id ? updated : card) }));
    const next = nextCards.filter(card => card.id !== reviewCard.id && dueNow(card) && (!selectedNoteId || card.noteId === selectedNoteId)).sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
    setReviewCardId(next?.id ?? ''); setShowAnswer(false);
    onActivity('flashcard-reviewed', reviewCard.noteId, reviewCard.noteName);
    if (!next) notify('Review round complete. Your next review has been scheduled.');
  }
  function startPractice() {
    const allCandidates = noteCards.filter(card => card.back.trim());
    const candidates = allCandidates.filter((card, index) => allCandidates.findIndex(item => item.back === card.back) === index);
    if (candidates.length < 3) { notify('Create at least three flashcards with different answers for a multiple-choice round.'); setTab('Flashcards'); return; }
    setPracticeCards([...candidates].sort(() => Math.random() - 0.5).slice(0, Math.min(10, candidates.length)));
    setPracticeIndex(0); setPracticeChoice(''); setPracticeScore(0); setPracticeFinished(false); setPracticeStarted(true); setTab('Practice');
  }
  function choosePracticeAnswer(answer: string) {
    if (practiceChoice) return;
    setPracticeChoice(answer);
    if (answer === practiceCards[practiceIndex]?.back) setPracticeScore(score => score + 1);
  }
  function advancePractice() {
    if (practiceIndex + 1 >= practiceCards.length) { setPracticeFinished(true); onActivity('practice-completed', selectedNote?.id, selectedNote?.name); return; }
    setPracticeIndex(index => index + 1); setPracticeChoice('');
  }
  function deleteCard(cardId: string) {
    setData(previous => ({ ...previous, flashcards: previous.flashcards.filter(card => card.id !== cardId) }));
    if (reviewCardId === cardId) setReviewCardId('');
    notify('Flashcard removed.');
  }
  function deleteTerm(termId: string) { setData(previous => ({ ...previous, glossary: previous.glossary.filter(term => term.id !== termId) })); notify('Glossary entry removed.'); }
  function markRecapReviewed(recapId: string) {
    const recap = data.recaps.find(item => item.id === recapId);
    setData(previous => ({ ...previous, recaps: previous.recaps.map(item => item.id === recapId ? { ...item, reviewedAt: new Date().toISOString() } : item) }));
    if (recap) onActivity('recap-reviewed', recap.noteId, recap.noteName);
    notify('Recap marked as reviewed.');
  }

  return <section className="study-toolkit-page">
    <div className="toolkit-hero">
      <div className="toolkit-hero-copy"><span className="toolkit-eyebrow"><Sparkles size={14} /> Phase 2 · Active recall</span><h1>Make knowledge <em>stick.</em></h1><p>Turn lecture files into reviewable cards, a personal glossary, practice rounds and compact recaps.</p><div className="toolkit-source-row"><label htmlFor="toolkit-source">Build from a lecture</label><select id="toolkit-source" value={selectedNoteId} onChange={event => setSelectedNoteId(event.target.value)} disabled={!sourceNotes.length}><option value="">Choose a lecture</option>{sourceNotes.map(note => <option key={note.id} value={note.id}>{note.course + ' · ' + note.name}</option>)}</select><button type="button" className="toolkit-primary" onClick={() => void generateForNote()} disabled={!selectedNoteId || isGenerating}>{isGenerating ? 'Building study set…' : 'Generate study set'}</button></div><small className="toolkit-source-note">Drafts are made from text extracted in this browser, not by an AI model. Check generated answers against your lecturer’s notes.</small></div>
      <div className="toolkit-hero-art" aria-hidden="true"><div className="toolkit-orbit orbit-one" /><div className="toolkit-orbit orbit-two" /><div className="toolkit-core"><BrainCircuit size={33} /></div><span className="toolkit-orbit-chip chip-a">Recall</span><span className="toolkit-orbit-chip chip-b">Review</span><span className="toolkit-orbit-chip chip-c">Retain</span></div>
    </div>
    <div className="toolkit-stats">
      <div><span className="toolkit-stat-icon"><Layers size={17} /></span><span className="toolkit-stat-label">Flashcards</span><strong>{data.flashcards.length}</strong><small>{dueCards.length} due for review</small></div>
      <div><span className="toolkit-stat-icon"><BookOpenCheck size={17} /></span><span className="toolkit-stat-label">Glossary terms</span><strong>{data.glossary.length}</strong><small>Definitions to revisit</small></div>
      <div><span className="toolkit-stat-icon"><Target size={17} /></span><span className="toolkit-stat-label">Cards mastered</span><strong>{masteredCount}</strong><small>Intervals of 14 days or more</small></div>
      <div><span className="toolkit-stat-icon"><Clock3 size={17} /></span><span className="toolkit-stat-label">Reviewed today</span><strong>{todayReviews}</strong><small>Cards reviewed at least once</small></div>
    </div>
    <div className="toolkit-tabs" role="tablist" aria-label="Study toolkit sections">
      {(['Overview', 'Flashcards', 'Glossary', 'Practice', 'Recaps'] as ToolkitTab[]).map(item => <button type="button" key={item} role="tab" aria-selected={tab === item} className={tab === item ? 'toolkit-tab-active' : ''} onClick={() => selectTab(item)}>{item === 'Flashcards' ? <Layers size={16} /> : item === 'Glossary' ? <BookOpenCheck size={16} /> : item === 'Practice' ? <Target size={16} /> : item === 'Recaps' ? <FileText size={16} /> : <BrainCircuit size={16} />}{item}{item === 'Flashcards' && dueCards.length > 0 && <span className="toolkit-tab-count">{dueCards.length}</span>}</button>)}
    </div>
    {tab === 'Overview' && <div className="toolkit-overview-grid">
      <article className="toolkit-panel toolkit-review-panel"><div className="toolkit-panel-heading"><div><span className="toolkit-kicker">Daily review</span><h2>Your next recall round</h2></div><span className="toolkit-panel-icon"><RotateCcw size={19} /></span></div><p>Recall the answer before revealing it. Revisit unfamiliar cards sooner and stretch the interval as the answer becomes easier to remember.</p><div className="toolkit-review-summary"><strong>{dueCards.length}</strong><span>{dueCards.length === 1 ? 'card due now' : 'cards due now'}</span></div><button type="button" className="toolkit-primary" disabled={!dueForDeck.length} onClick={() => { setReviewCardId(dueForDeck[0]?.id ?? ''); setShowAnswer(false); setTab('Flashcards'); }}>{dueForDeck.length ? 'Start review' : 'You’re up to date'} <ChevronRight size={16} /></button></article>
      <article className="toolkit-panel"><div className="toolkit-panel-heading"><div><span className="toolkit-kicker">Practice</span><h2>Test what you know</h2></div><span className="toolkit-panel-icon"><Target size={19} /></span></div><p>Try a short multiple-choice round made from saved flashcards. Incorrect options come from other answers in the selected deck.</p><div className="toolkit-mini-metrics"><div><strong>{noteCards.length}</strong><span>cards in selected deck</span></div><div><strong>{Math.min(10, noteCards.length)}</strong><span>questions per round</span></div></div><button type="button" className="toolkit-secondary" onClick={startPractice}>Start practice <ChevronRight size={15} /></button></article>
      <article className="toolkit-panel toolkit-wide-panel"><div className="toolkit-panel-heading"><div><span className="toolkit-kicker">Build a habit</span><h2>How review scheduling works</h2></div><span className="toolkit-panel-icon"><Clock3 size={19} /></span></div><div className="toolkit-schedule-grid"><div><b>Again</b><span>Bring the card back in 10 minutes.</span></div><div><b>Hard</b><span>Use a short interval, usually at least one day.</span></div><div><b>Good</b><span>Increase the gap as recall improves.</span></div><div><b>Easy</b><span>Use a longer interval for confident recall.</span></div></div><p className="toolkit-footnote">This simple local scheduler is a study aid, not a guarantee of mastery. Review dates use this device’s clock.</p></article>
    </div>}
    {tab === 'Flashcards' && <div className="toolkit-content-grid">
      <section className="toolkit-panel toolkit-card-stack"><div className="toolkit-panel-heading"><div><span className="toolkit-kicker">Recall before reveal</span><h2>Flashcards</h2></div><span className="toolkit-panel-icon"><Layers size={19} /></span></div><div className="toolkit-inline-filter"><label htmlFor="flashcard-deck">Study deck</label><select id="flashcard-deck" value={selectedNoteId} onChange={event => { setSelectedNoteId(event.target.value); setShowAnswer(false); setReviewCardId(''); }}><option value="">All decks</option>{sourceNotes.map(note => <option key={note.id} value={note.id}>{note.course + ' · ' + note.name}</option>)}</select></div>
      {reviewCard ? <div className="toolkit-flashcard"><span className="toolkit-flashcard-label">Due for review · {reviewCard.noteName}</span><p>{reviewCard.front}</p>{showAnswer ? <div className="toolkit-answer"><span>Answer</span><p>{reviewCard.back}</p></div> : <button type="button" className="toolkit-primary" onClick={() => setShowAnswer(true)}>Reveal answer</button>}{showAnswer && <div className="toolkit-rating"><span>How well did you recall it?</span><div><button type="button" onClick={() => rateCard('again')}>Again <small>10 min</small></button><button type="button" onClick={() => rateCard('hard')}>Hard <small>1 day+</small></button><button type="button" onClick={() => rateCard('good')}>Good <small>Next interval</small></button><button type="button" onClick={() => rateCard('easy')}>Easy <small>Longer gap</small></button></div></div>}</div> : <div className="toolkit-flashcard"><span className="toolkit-flashcard-label">{dueForDeck.length ? 'Review queue' : 'Create your first deck'}</span><h3>{dueForDeck.length ? 'Ready when you are.' : 'Start with a real lecture.'}</h3><p>{dueForDeck.length ? 'Start a review round to work through cards that are due.' : 'Generate a study set from a lecture above, or write your own card below.'}</p>{dueForDeck.length > 0 && <button type="button" className="toolkit-primary" onClick={() => { setReviewCardId(dueForDeck[0].id); setShowAnswer(false); }}>Start review</button>}</div>}
      <div className="toolkit-list-heading"><h3>Your cards</h3><span>{noteCards.length}</span></div>{noteCards.length ? <div className="toolkit-item-list">{noteCards.map(card => <article key={card.id} className="toolkit-item"><div><strong>{card.front}</strong><p>{card.back}</p><small>{card.generated ? 'Draft from lecture text' : 'Your card'} · {card.repetitions ? 'Reviewed ' + card.repetitions + ' times' : 'New card'} · Due {dateLabel(card.dueAt)}</small></div><button type="button" className="toolkit-icon-danger" aria-label="Delete flashcard" onClick={() => deleteCard(card.id)}><Trash2 size={15} /></button></article>)}</div> : <p className="toolkit-empty-copy">No cards in this deck yet.</p>}</section>
      <aside className="toolkit-panel toolkit-form-panel"><div className="toolkit-panel-heading"><div><span className="toolkit-kicker">Your own words</span><h2>Add a card</h2></div><span className="toolkit-panel-icon"><Plus size={19} /></span></div><form className="toolkit-form" onSubmit={addManualCard}><label htmlFor="new-card-front">Question or cue</label><textarea id="new-card-front" value={draftFront} onChange={event => setDraftFront(event.target.value)} rows={3} placeholder="What does a gyroscope measure?" required /><label htmlFor="new-card-back">Answer</label><textarea id="new-card-back" value={draftBack} onChange={event => setDraftBack(event.target.value)} rows={4} placeholder="Write a concise answer, including any important conditions…" required /><button type="submit" className="toolkit-primary">Save flashcard <Plus size={15} /></button></form><div className="toolkit-tip"><CircleHelp size={17} /><p>One idea per card works best. Keep the prompt focused and put the reasoning or worked steps on the reverse.</p></div></aside>
    </div>}
    {tab === 'Glossary' && <div className="toolkit-content-grid"><section className="toolkit-panel toolkit-glossary-panel"><div className="toolkit-panel-heading"><div><span className="toolkit-kicker">Terms, not just text</span><h2>Personal glossary</h2></div><span className="toolkit-panel-icon"><BookOpenCheck size={19} /></span></div><input className="toolkit-search" type="search" value={termSearch} onChange={event => setTermSearch(event.target.value)} placeholder="Search terms and definitions…" aria-label="Search glossary" /><p className="toolkit-footnote">Extracted definitions are drafts. If a direct definition is not detected, an entry shows context from the lecture instead of inventing an explanation.</p>{visibleTerms.length ? <div className="toolkit-glossary-list">{visibleTerms.map(term => <article key={term.id} className="toolkit-glossary-term"><div><h3>{term.term}</h3><p>{term.definition}</p><small>{term.generated ? 'Draft from extracted text · Source: ' : 'Source: '}{term.noteName}</small></div><button type="button" className="toolkit-icon-danger" aria-label={'Delete term ' + term.term} onClick={() => deleteTerm(term.id)}><Trash2 size={15} /></button></article>)}</div> : <div className="toolkit-empty"><BookOpenCheck size={24} /><h3>No glossary entries yet</h3><p>Generate a study set from a text-based lecture or add your own definition.</p></div>}</section><aside className="toolkit-panel toolkit-form-panel"><div className="toolkit-panel-heading"><div><span className="toolkit-kicker">Add context</span><h2>Add a term</h2></div><span className="toolkit-panel-icon"><Plus size={19} /></span></div><form className="toolkit-form" onSubmit={addManualTerm}><label htmlFor="new-glossary-term">Term</label><input id="new-glossary-term" value={draftTerm} onChange={event => setDraftTerm(event.target.value)} placeholder="e.g. Angular momentum" required /><label htmlFor="new-glossary-definition">Definition or explanation</label><textarea id="new-glossary-definition" value={draftDefinition} onChange={event => setDraftDefinition(event.target.value)} rows={5} placeholder="Explain it in your own words…" required /><button type="submit" className="toolkit-primary">Save term <Plus size={15} /></button></form></aside></div>}
    {tab === 'Practice' && <section className="toolkit-panel toolkit-practice-panel"><div className="toolkit-panel-heading"><div><span className="toolkit-kicker">No peeking</span><h2>Practice round</h2></div><span className="toolkit-panel-icon"><Target size={19} /></span></div>{!practiceStarted ? <div className="toolkit-empty"><Target size={25} /><h3>Ready to test your recall?</h3><p>Choose a lecture deck above, then start a multiple-choice round.</p><button type="button" className="toolkit-primary" onClick={startPractice}>Start practice</button></div> : practiceFinished ? <div className="toolkit-quiz-result"><span className="toolkit-kicker">Round complete</span><strong>{practiceScore} / {practiceCards.length}</strong><p>{practiceScore === practiceCards.length ? 'Perfect round. Keep the cards in rotation to maintain recall.' : 'Review missed answers, then try another round.'}</p><button type="button" className="toolkit-primary" onClick={startPractice}>Try another round <RotateCcw size={15} /></button></div> : practiceCards[practiceIndex] ? <div className="toolkit-question"><div className="toolkit-question-meta"><span>Question {practiceIndex + 1} of {practiceCards.length}</span><span>{practiceCards[practiceIndex].noteName}</span></div><h3>{practiceCards[practiceIndex].front}</h3><div className="toolkit-answer-options">{questionOptions.map((answer, index) => <button type="button" key={answer + index} className={'toolkit-answer-option ' + (practiceChoice ? answer === practiceCards[practiceIndex].back ? 'option-correct' : answer === practiceChoice ? 'option-wrong' : '' : '')} disabled={!!practiceChoice} onClick={() => choosePracticeAnswer(answer)}>{answer}</button>)}</div>{practiceChoice && <div className={'toolkit-feedback ' + (practiceChoice === practiceCards[practiceIndex].back ? 'feedback-correct' : 'feedback-wrong')}><strong>{practiceChoice === practiceCards[practiceIndex].back ? 'Correct' : 'Not quite'}</strong><p>{practiceCards[practiceIndex].back}</p><button type="button" className="toolkit-primary" onClick={advancePractice}>{practiceIndex + 1 === practiceCards.length ? 'See result' : 'Next question'} <ChevronRight size={15} /></button></div>}<div className="toolkit-question-progress"><span style={{ width: ((practiceIndex + (practiceChoice ? 1 : 0)) / practiceCards.length * 100) + '%' }} /></div></div> : null}</section>}
    {tab === 'Recaps' && <section className="toolkit-panel toolkit-recaps-panel"><div className="toolkit-panel-heading"><div><span className="toolkit-kicker">Small, useful refreshers</span><h2>Lecture recaps</h2></div><label className="toolkit-inline-select"><span>Filter</span><select value={recapFilter} onChange={event => setRecapFilter(event.target.value)}><option>All notes</option>{sourceNotes.map(note => <option key={note.id} value={note.id}>{note.name}</option>)}</select></label></div>{selectedRecaps.length ? <div className="toolkit-recap-grid">{selectedRecaps.map(recap => <article className="toolkit-recap-card" key={recap.id}><div className="toolkit-recap-meta"><span>{recap.course} · {recap.subject}</span><span>{recap.reviewedAt ? 'Reviewed ' + dateLabel(recap.reviewedAt) : 'Not reviewed yet'}</span></div><h3>{recap.noteName}</h3><span className="toolkit-kicker">Concepts surfaced in the source</span><ol>{recap.summary.map((line, index) => <li key={index}>{line}</li>)}</ol>{recap.keyTerms.length > 0 && <div className="toolkit-recap-chips">{recap.keyTerms.map(term => <span key={term}>{term}</span>)}</div>}{recap.equations.length > 0 && <div className="toolkit-recap-equations"><strong>Equation-like lines detected</strong>{recap.equations.map((line, index) => <code key={index}>{line}</code>)}</div>}<div className="toolkit-recap-actions"><button type="button" className="toolkit-secondary" onClick={() => { setSelectedNoteId(recap.noteId); setTab('Flashcards'); }}>Review cards <ChevronRight size={14} /></button><button type="button" onClick={() => markRecapReviewed(recap.id)}><Check size={14} /> Mark reviewed</button></div><small className="toolkit-footnote">This recap is a local extraction preview, not an AI-verified summary.</small></article>)}</div> : <div className="toolkit-empty"><FileText size={25} /><h3>No recaps yet</h3><p>Generate a study set to surface opening ideas, repeated terms and equation-like lines from a lecture.</p><button type="button" className="toolkit-primary" onClick={() => void generateForNote()} disabled={!selectedNoteId || isGenerating}>Generate a recap</button></div>}</section>}
  </section>;
}
