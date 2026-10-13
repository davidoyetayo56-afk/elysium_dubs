import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  ArrowDownToLine, ArrowRight, BookOpen, Bookmark, BookmarkPlus, BrainCircuit, CalendarDays, Copy,
  Check, ChevronDown, Clock3, Command, File, FileText, FolderOpen, Grid2X2,
  HardDrive, Image as ImageIcon, Library, List, Menu, MessageCircle, MoreHorizontal,
  Download, Moon, Plus, Search, Send, Settings2, Sparkles, Star, Sun, Trash2, UploadCloud, X, Zap
} from 'lucide-react';
import { backendConfigured, friendlyError, supabase } from './lib/supabase';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

type Note = {
  id: string; name: string; subject: string; course: string; kind: string;
  size: number; createdAt: string; starred: boolean; tags: string[];
  storageKey?: string; sample?: boolean; fileName?: string;
};
type StudyMode = 'explain' | 'notes' | 'analyze' | 'quiz' | 'plan';
type ChatMessage = { role: 'user' | 'assistant'; content: string };
type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }> };
type Page = 'Overview' | 'My library' | 'Starred' | 'AI study desk';

const DB_NAME = 'mechamind-vault';
const STORE = 'files';
const META_KEY = 'mechamind-notes-v1';
const subjects = ['All subjects', 'Engineering', 'Mathematics', 'Physics', 'Chemistry', 'Programming', 'Electronics', 'Other'];

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
  if (['doc', 'docx', 'odt', 'txt', 'rtf', 'md', 'markdown'].includes(ext)) return 'Document';
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
  { id: 'sample-1', name: 'Introduction to Mechatronics Engineering', subject: 'Engineering', course: 'MCT 101', kind: 'PDF', size: 2450000, createdAt: '2026-10-12T10:00:00.000Z', starred: true, tags: ['lecture', 'foundations'], sample: true },
  { id: 'sample-2', name: 'Vectors and Scalar Products', subject: 'Mathematics', course: 'MTH 101', kind: 'PDF', size: 1380000, createdAt: '2026-10-11T10:00:00.000Z', starred: false, tags: ['week 3', 'revision'], sample: true },
  { id: 'sample-3', name: 'Newtonian Mechanics: Lecture 2', subject: 'Physics', course: 'PHY 101', kind: 'Document', size: 820000, createdAt: '2026-10-10T10:00:00.000Z', starred: true, tags: ['mechanics'], sample: true },
  { id: 'sample-4', name: 'Basic Circuit Analysis', subject: 'Electronics', course: 'EEE 102', kind: 'PDF', size: 3100000, createdAt: '2026-10-08T10:00:00.000Z', starred: false, tags: ['circuits', 'week 2'], sample: true },
];


const personalTutorContext = "Study profile for this workspace: the learner studies Mechatronics Engineering at Bowen University. They prefer thorough, step-by-step academic explanations, clear derivations, worked calculations with units, visual intuition or simple diagrams when useful, and mini-quizzes with one question at a time. Use clear British English and briefly explain advanced terminology. Relevant recent context, only when on-topic: a shared CHM 101 Module 1 titled Chemical Equation and Stoichiometry, with visible topics including equation parts, reaction/state symbols, balancing, conservation of mass and balancing complex equations with simultaneous equations; recent questions on vector fields and conservative-force tests; and deriving equations of motion from v = u + at. Long-term ambition: build Ligron, a world-class technology company. For the field F = (-y i + x j)/(x² + y²), be mathematically careful: the curl is zero away from the origin, but circulation around the unit circle is 2π, so it is not globally conservative on the punctured plane. Use that nuance only when relevant.";
const chatWelcome = "Welcome back, David! This desk is tuned to your Mechatronics Engineering journey at Bowen University: clear step-by-step explanations, worked calculations, diagrams where useful, and one-question mini-quizzes. We can revisit your CHM 101 chemical-equation module, check vector fields carefully, derive the equations of motion, or map a realistic path towards building Ligron. What are we tackling first?";
const personalStudyPaths = [
  {
    code: "CHM 101",
    label: "YOUR SHARED MODULE",
    title: "Chemical equations & stoichiometry",
    description: "Reaction symbols, balancing equations and conservation of mass.",
    glyph: "CHM",
    prompt: "Teach me CHM 101 Module 1, Chemical Equation and Stoichiometry. Cover the parts of chemical equations, reactants and products, state and reaction symbols, balancing equations, conservation of mass, and complex equations using simultaneous equations. Explain each step, preserve the lecture notes' terminology, flag apparent errors rather than silently correcting them, and finish with one short quiz question."
  },
  {
    code: "VECTOR FIELDS",
    label: "VECTOR CALCULUS",
    title: "Vector fields & conservative forces",
    description: "Curl, domain checks and the closed-loop test.",
    glyph: "∇ ×",
    prompt: "Help me revisit the vector-field example F = (-y i + x j)/(x² + y²) and check whether it is truly conservative. Derive the curl step by step, discuss the domain around the origin, and use a closed-loop integral if useful. Explain why zero curl alone does not always establish global conservativeness."
  },
  {
    code: "MECHANICS",
    label: "PHYSICS FOUNDATIONS",
    title: "Derive the equations of motion",
    description: "Start from v = u + at, then build the other equations logically.",
    glyph: "F = ma",
    prompt: "Derive the four equations of uniformly accelerated motion, starting from v = u + at. State the assumptions, define every symbol, show the algebra step by step, include a worked numerical example, and finish with one check-for-understanding question."
  },
  {
    code: "LIGRON BUILD TRACK",
    label: "YOUR LONG-TERM MISSION",
    title: "Turn fundamentals into a build",
    description: "Connect programming, electronics, sensors, control and robotics.",
    glyph: "L",
    prompt: "Create a realistic learning roadmap for a Bowen University Mechatronics Engineering student whose long-term goal is to build Ligron, a world-class technology company. Connect maths, physics, programming, electronics, sensors, actuators, control systems, robotics and AI. Give me one beginner-friendly project, a clear bill of learning prerequisites, and the exact first step I can take today. Keep the advice ambitious but grounded."
  }
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
    ['Engineering', /\b(engineering|mechatronics|robotics|robot|sensor|actuator|control system|embedded|mct\s?10\d)\b/],
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
  const maxChars = 30000;
  if (['txt', 'md', 'csv', 'json', 'html', 'xml', 'rtf'].includes(extension) || file.type.startsWith('text/')) {
    return (await file.text()).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, maxChars);
  }
  if (extension === 'pdf' || file.type === 'application/pdf') {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages: string[] = [];
    try {
      const pageCount = Math.min(document.numPages, 45);
      let stoppedAtCharacterLimit = false;
      for (let pageNo = 1; pageNo <= pageCount; pageNo++) {
        const page = await document.getPage(pageNo);
        const pageText = await page.getTextContent();
        const readablePage = pageText.items.map(item => ('str' in item ? item.str : '')).join(' ');
        pages.push('\n\n[PAGE ' + pageNo + ']\n' + readablePage);
        if (pages.join('\n').length >= maxChars) { stoppedAtCharacterLimit = true; break; }
      }
      const extracted = pages.join('\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').slice(0, maxChars).trim();
      const notes: string[] = [];
      if (pageCount < document.numPages) notes.push('Extraction coverage: pages 1-' + pageCount + ' of ' + document.numPages + '.');
      if (stoppedAtCharacterLimit) notes.push('The extracted text reached the character limit. Later text from this file may be missing.');
      return extracted + (notes.length ? '\n\n[NOTE: ' + notes.join(' ') + ']' : '');
    } finally {
      await document.destroy();
    }
  }
  if (extension === 'docx' || file.type.includes('wordprocessingml')) {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return result.value.replace(/\s{3,}/g, '\n\n').slice(0, maxChars).trim();
  }
  return '';
}
async function aiOrganize(fileName: string, content: string) {
  if (!backendConfigured || !supabase || !content.trim()) return null;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return null;
  const { data, error } = await supabase.functions.invoke('ai-tutor', {
    body: { mode: 'organize', messages: [{ role: 'user', content:
      'Organise this student lecture file. Return ONLY a JSON object with keys name, subject, course, tags. subject must be one of Engineering, Mathematics, Physics, Chemistry, Programming, Electronics, Other. tags must be an array of 1-4 short strings. Use filename and excerpt; do not invent facts.\nFilename: ' + fileName + '\nExcerpt: ' + content.slice(0, 3500)
    }] }
  });
  if (error || typeof data?.reply !== 'string') return null;
  try {
    const match = data.reply.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    const allowed = ['Engineering', 'Mathematics', 'Physics', 'Chemistry', 'Programming', 'Electronics', 'Other'];
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
  if (/conservative|curl|vector field/.test(p)) return "Let us check the mathematics carefully.\n\nFor F = (-y i + x j)/(x² + y²), write P = -y/(x² + y²) and Q = x/(x² + y²). Away from the origin, ∂Q/∂x = ∂P/∂y, so the two-dimensional curl is zero there.\n\nBut the field is undefined at (0, 0), and the domain with the origin removed is not simply connected. Around the unit circle, F · dr = 1, so the closed-loop integral is ∮F · dr = 2π, not zero. Therefore the field is not globally conservative on that domain. This is an important caveat: zero curl is sufficient on a suitable simply connected domain, not on every domain.\n\nQuick check: what point must be excluded from the domain?";
  if (/stoichiometry|chemical equation|balanc\w*\s+(?:a\s+)?equation|reactant|product|chm 101/.test(p)) return "CHM 101 · Chemical equations and stoichiometry\n\n1. Reactants are on the left of the arrow; products are on the right.\n2. Coefficients change the number of molecules or formula units. Subscripts are part of a chemical formula, so do not change them when balancing an equation.\n3. A balanced equation has the same number of atoms of each element on both sides, following conservation of mass.\n\nWorked example: H₂ + O₂ → H₂O is not balanced because there are two oxygen atoms on the left but only one on the right. Put 2 before H₂O, then 2 before H₂: 2H₂ + O₂ → 2H₂O. Now both sides have four hydrogen atoms and two oxygen atoms.\n\nMini-quiz: balance Fe + O₂ → Fe₂O₃. Start by balancing iron, then oxygen.";
  if (/equations of motion|derive.*motion|uniformly accelerated|v\s*=\s*u\s*\+\s*at/.test(p)) return "Let u be initial velocity, v final velocity, a constant acceleration, t time and s displacement. Assume acceleration is uniform.\n\n1. First equation: v = u + at (the starting relation).\n2. From average velocity, s = (u + v)t/2. Substitute v = u + at: s = ut + ½at².\n3. Since u = v − at, substitute into s = (u + v)t/2 to get s = vt − ½at².\n4. From v = u + at, t = (v − u)/a. Substitute into s = (u + v)t/2 and simplify to get v² = u² + 2as.\n\nQuick check: which equation is most useful when time is not given?";
  if (/ligron|roadmap|robot|mechatronics/.test(p)) return "Your Ligron build track can grow in practical stages:\n\n1. Foundations: strengthen algebra, calculus, mechanics and basic programming.\n2. Make things move: learn circuits, microcontrollers, sensors and actuators.\n3. Close the loop: build a small control system, measure its behaviour and tune it.\n4. Add intelligence: use data and AI only where they solve a real problem.\n5. Build a product: interview users, prototype cheaply, test, improve and document what works.\n\nA strong first project is a sensor-based system that measures something, makes a decision and controls an output. Begin by choosing one measurable problem and writing what success looks like.";
  if (/circuit|ohm|resistor/.test(p)) return "Start with Ohm’s law: V = IR, where voltage V is measured in volts, current I in amperes and resistance R in ohms. For a 6 Ω resistor with 12 V across it, I = V/R = 12/6 = 2 A. In a real circuit, check component ratings before applying power.\n\nMini-quiz: if voltage stays at 12 V and resistance doubles to 12 Ω, what happens to current?";
  if (/newton|force|acceleration/.test(p)) return "Start with Newton’s second law: F = ma. F is the net force in newtons, m is mass in kilograms and a is acceleration in m/s². Rearrange to a = F/m. Example: a 12 N net force on a 3 kg object gives a = 12/3 = 4 m/s².\n\nMini-quiz: what acceleration does a 20 N net force produce on a 5 kg object?";
  if (/vector|scalar/.test(p)) return "A scalar has magnitude only, such as mass or temperature. A vector has magnitude and direction, such as force or displacement. For A = (a₁, a₂) and B = (b₁, b₂), the dot product is A · B = a₁b₁ + a₂b₂, which is a scalar.\n\nWould you like to try a worked example?";
  return "Let us break this down together. First, identify the key terms and what the question is asking. Next, connect the idea to a principle or equation, then work through a small example. I’ll keep the reasoning visible and add a quick check question. For a precise explanation of your lecture, import the file into your MechaMind library or paste the relevant excerpt here. Live AI answers need the secure AI service connected.";
}

function localStudyModeReply(prompt: string, mode: StudyMode): string {
  if (mode === 'notes') {
    const explanation = localStudyReply(prompt);
    return "# Quick study notes: " + prompt.slice(0, 90) + "\n\n## Core explanation\n" + explanation + "\n\n## Revision checklist\n- Define the key terms in your own words.\n- Write down the governing formula and the meaning of each symbol.\n- Work through one example without looking at the answer.\n\n## Self-test\n1. State the main principle in one sentence.\n2. Give a small example that demonstrates it.\n\n**Preview limitation:** These are starter notes. Attach a lecture file and connect the live tutor for a complete, source-grounded set of notes.";
  }
  if (mode === 'analyze') {
    return "## Let’s analyse your actual notes\n\nChoose **Analyse** on a file in My library, or paste a lecture excerpt into this chat. I need the note's text to identify its main ideas, definitions, equations, gaps and likely exam questions. I will not pretend to have analysed a file that has not been attached.";
  }
  if (mode === 'plan') {
    return "# Study plan\n\n1. **Understand (10 minutes):** read the section and list unfamiliar terms.\n2. **Rebuild (10 minutes):** close the notes and explain the principle from memory.\n3. **Practise (15 minutes):** solve a worked problem or answer questions.\n4. **Review (5 minutes):** correct mistakes and record one question to revisit.\n\nTell me the topic and how much time you have for a more tailored plan.";
  }
  return localStudyReply(prompt);
}

function localDocumentStudy(documentText: string, documentName: string, mode: StudyMode): string {
  const clean = documentText.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const lines = clean.split(/\n|(?<=[.!?])\s+/).map(line => line.trim()).filter(line => line.length > 22);
  const sentences = clean.split(/(?<=[.!?])\s+/).map(line => line.trim()).filter(line => line.length > 28);
  const formulaPattern = /[^\n]{0,55}(?:=|→|⇌|∫|∑|∇|√|Δ|±|≤|≥|\b(?:equation|formula|theorem|law)\b)[^\n]{0,75}/gi;
  const formulaMatches = clean.match(formulaPattern) ?? [];
  const formulas = [...new Set(formulaMatches.map(item => item.replace(/\s+/g, ' ').trim()).filter(item => item.length > 5))].slice(0, 8);
  const wordCounts = new Map<string, number>();
  const stopWords = new Set("about after again against all also among and are because been before being between both but can could did does each either else for from further had has have her here him his how into its just more most much must not other our out over own same should some such than that the their them then there these they this those through too under until very was were what when where which while who will with would your you".split(" "));
  for (const match of clean.toLowerCase().matchAll(/[a-z][a-z-]{3,}/g)) {
    const word = match[0];
    if (!stopWords.has(word)) wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
  }
  const keyTerms = [...wordCounts.entries()].sort((x, y) => y[1] - x[1]).slice(0, 9).map(([word, count]) => word + " (" + count + " mentions)");
  const summary = (sentences.length ? sentences : lines).slice(0, 6);
  const summaryLines = summary.map((line, index) => (index + 1) + ". " + line);
  const name = documentName || 'Uploaded lecture';
  if (mode === 'notes') {
    return "# Quick revision notes: " + name + "\n\n**Source:** text extracted from your uploaded file.\n\n## Overview\n" + (summaryLines.length ? summaryLines.join('\n') : 'There is too little readable text to form a summary.') + "\n\n## Repeated key terms\n" + (keyTerms.length ? keyTerms.map(term => "- " + term).join('\n') : '- No clear repeated terms were detected.') + "\n\n## Equations and important statements\n" + (formulas.length ? formulas.map((formula, i) => (i + 1) + ". " + formula).join('\n') : 'No obvious equations or formula statements were detected by the quick local scan.') + "\n\n## Test yourself\n1. What is the central idea of this lecture?\n2. Define two of the repeated key terms in your own words.\n3. Explain one equation or important statement and when it applies.\n4. Write a short example that demonstrates the main concept.\n\n**Note:** This is a fast, on-device draft based on text patterns, not a full AI interpretation. Select the live AI service for a deeper, course-aware set of notes.";
  }
  if (mode === 'analyze') {
    return "# Quick note analysis: " + name + "\n\n## At a glance\n- Readable text: approximately " + clean.length.toLocaleString() + " characters.\n- Paragraphs/lines detected: " + lines.length + ".\n- Repeated concepts detected: " + (keyTerms.slice(0, 6).map(item => item.split(' (')[0]).join(', ') || 'not enough data') + ".\n\n## Main ideas surfaced\n" + (summaryLines.length ? summaryLines.join('\n') : 'There is too little readable text to summarise.') + "\n\n## Key terms\n" + (keyTerms.length ? keyTerms.map(term => "- " + term).join('\n') : '- No clear key terms detected.') + "\n\n## Equations and statements to review\n" + (formulas.length ? formulas.map((formula, i) => (i + 1) + ". " + formula).join('\n') : 'No obvious equations were found. If the lecture is image-based or scanned, its text may not be extractable.') + "\n\n## Questions worth asking\n1. Which concept appears most often, and why is it important?\n2. Which assumptions or definitions are needed before applying the key equations?\n3. Can you find a worked example in the note and reproduce it without looking?\n4. Is any definition, step or conclusion left unexplained?\n\n**Limit:** This is a local pattern-based scan. It can identify repeated terms and equation-like lines, but cannot reliably judge whether a claim is correct. Use the connected AI tutor for deeper reasoning and error checks.";
  }
  return localStudyReply("Please help me study " + name);
}

function renderInlineMessage(line: string): ReactNode {
  return line.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : part
  );
}

function NeuralCanvas({ darkMode }: { darkMode: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width = 0, height = 0, frame = 0, tick = 0;
    let points: Array<{ x: number; y: number; vx: number; vy: number; r: number; phase: number }> = [];
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
      width = window.innerWidth; height = window.innerHeight;
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = width < 650 ? 22 : width < 1100 ? 32 : 48;
      points = Array.from({ length: count }, (_, i) => {
        const seed = (i + 1) * 127.1;
        const x = (((Math.sin(seed) * 43758.5453) % 1 + 1) % 1) * width;
        const y = (((Math.sin(seed * 1.73) * 24634.6345) % 1 + 1) % 1) * height;
        return { x, y, vx: Math.sin(seed * 2.1) * 0.11, vy: Math.cos(seed * 1.3) * 0.10, r: 1.1 + (i % 3) * 0.45, phase: i * 0.77 };
      });
    };
    const draw = () => {
      context.clearRect(0, 0, width, height);
      const linkDistance = width < 650 ? 115 : 155;
      const lineColor = darkMode ? '150,202,165' : '111,104,180';
      const dotColor = darkMode ? '161,218,177' : '117,102,210';
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        for (let j = i + 1; j < points.length; j++) {
          const q = points[j], dx = p.x - q.x, dy = p.y - q.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < linkDistance) {
            context.strokeStyle = 'rgba(' + lineColor + ',' + ((1 - distance / linkDistance) * (darkMode ? 0.17 : 0.13)) + ')';
            context.lineWidth = 0.7; context.beginPath(); context.moveTo(p.x, p.y); context.lineTo(q.x, q.y); context.stroke();
          }
        }
        const pulse = 0.65 + (Math.sin(tick * 0.018 + p.phase) + 1) * 0.24;
        context.beginPath(); context.arc(p.x, p.y, p.r * pulse, 0, Math.PI * 2);
        context.fillStyle = 'rgba(' + dotColor + ',' + (darkMode ? 0.58 : 0.42) + ')'; context.fill();
        if (i % 8 === 0) {
          context.beginPath(); context.arc(p.x, p.y, p.r * 3.2 * pulse, 0, Math.PI * 2);
          context.fillStyle = 'rgba(' + dotColor + ',' + (darkMode ? 0.055 : 0.045) + ')'; context.fill();
        }
        if (!reducedMotion) {
          p.x += p.vx; p.y += p.vy;
          if (p.x < -8) p.x = width + 8; if (p.x > width + 8) p.x = -8;
          if (p.y < -8) p.y = height + 8; if (p.y > height + 8) p.y = -8;
        }
      }
      tick++;
      if (!reducedMotion) frame = window.requestAnimationFrame(draw);
    };
    resize(); draw(); window.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); if (frame) window.cancelAnimationFrame(frame); };
  }, [darkMode]);
  return <canvas ref={canvasRef} className="neural-canvas" aria-hidden="true" />;
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
  const [darkMode, setDarkMode] = useState(() => {
    try {
      const savedTheme = localStorage.getItem('mechamind-theme');
      const migrated = localStorage.getItem('mechamind-deep-theme-v1') === '1';
      if (!migrated) { localStorage.setItem('mechamind-deep-theme-v1', '1'); return true; }
      return savedTheme ? savedTheme === 'dark' : true;
    } catch { return true; }
  });
  const [menuNote, setMenuNote] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [studyMode, setStudyMode] = useState<StudyMode>('explain');
  const [activeDocumentText, setActiveDocumentText] = useState('');
  const [activeDocumentName, setActiveDocumentName] = useState('');
  const [chat, setChat] = useState<ChatMessage[]>([{ role: 'assistant', content: chatWelcome }]);
  const [mobileNav, setMobileNav] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [ready, setReady] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(META_KEY);
      setNotes(stored ? (JSON.parse(stored) as Note[]).map(note => note.subject === 'Mechatronics' ? { ...note, subject: 'Engineering' } : note) : sampleNotes);
    } catch {
      setNotes(sampleNotes);
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) localStorage.setItem(META_KEY, JSON.stringify(notes));
  }, [notes, ready]);
  useEffect(() => {
    try { localStorage.setItem('mechamind-theme', darkMode ? 'dark' : 'light'); } catch { /* Theme still works for this session. */ }
  }, [darkMode]);
  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstallPrompt(null);
      setToast('App installed. Your study space is ready.');
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

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
      const extractedText = await readableText(file).catch(() => '');
      if (extractedText.trim()) {
        try { await vaultPut('text-' + id, new Blob([extractedText], { type: 'text/plain' })); } catch { /* Original file remains saved if the text cache cannot be written. */ }
      }
      const guessed = autoOrganize ? inferNoteMetadata(file.name, extractedText) : {
        name: file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim() || file.name,
        subject: 'Other', course: 'Unsorted', tags: ['new import']
      };
      const aiMetadata = autoOrganize && extractedText.length > 30 ? await aiOrganize(file.name, extractedText).catch(() => null) : null;
      const metadata = aiMetadata ?? guessed;
      added.push({
        id, name: metadata.name || guessed.name, subject: metadata.subject || 'Other', course: metadata.course || 'Unsorted',
        kind: fileKind(file.name), size: file.size, createdAt: new Date().toISOString(),
        starred: false, tags: metadata.tags?.length ? metadata.tags : ['lecture'], storageKey: id, fileName: file.name
      });
    }
    if (added.length) {
      setNotes(current => [...added, ...current.filter(n => !n.sample)]);
      setSubject('All subjects');
      setPage('My library');
      setUploadOpen(false);
      notify(added.length + (added.length === 1 ? ' file added and organised.' : ' files added and organised.') + ' PDF, DOCX and text extraction is ready where the file contains selectable text. Scanned PDFs may need OCR.');
    }
  }
  async function downloadNote(note: Note) {
    if (note.sample || !note.storageKey) { notify('This is a sample card. Import your own file to download it here.'); return; }
    const blob = await vaultGet(note.storageKey);
    if (!blob) { notify('This file is no longer in browser storage.'); return; }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = note.fileName ?? note.name + (blob.type === 'application/pdf' ? '.pdf' : '');
    anchor.click();
    URL.revokeObjectURL(url);
    notify('Your file is ready.');
  }
  async function deleteNote(note: Note) {
    if (note.storageKey) { await vaultDelete(note.storageKey); await vaultDelete('text-' + note.storageKey); }
    setNotes(current => current.filter(n => n.id !== note.id));
    setMenuNote(null);
    notify('Note removed from your library.');
  }
  function toggleStar(note: Note) {
    setNotes(current => current.map(n => n.id === note.id ? { ...n, starred: !n.starred } : n));
    setMenuNote(null);
  }
  async function copyStudyResult(content: string) {
    try {
      await navigator.clipboard.writeText(content);
      notify('Study result copied to the clipboard.');
    } catch {
      notify('Clipboard access was blocked by the browser. Use Download Markdown instead.');
    }
  }

  function downloadStudyResult(content: string) {
    const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim() || activeDocumentName || 'MechaMind study result';
    const safeName = heading.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 100) || 'MechaMind study result';
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = safeName + '.md';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('Markdown file downloaded.');
  }

  async function saveGeneratedNote(noteContent: string) {
    const heading = noteContent.match(/^#\s+(.+)$/m)?.[1]?.trim();
    const baseName = ('Study notes - ' + (activeDocumentName || heading || new Date().toLocaleDateString('en-GB')))
      .replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 100);
    const fileName = (baseName || 'MechaMind study notes') + '.md';
    const blob = new Blob([noteContent], { type: 'text/markdown;charset=utf-8' });
    const id = crypto.randomUUID();
    try {
      await vaultPut(id, blob);
      await vaultPut('text-' + id, blob);
      const metadata = inferNoteMetadata(fileName, noteContent);
      const saved: Note = {
        id, name: metadata.name || baseName, subject: metadata.subject || 'Other',
        course: metadata.course || 'Unsorted', kind: 'Document', size: blob.size,
        createdAt: new Date().toISOString(), starred: true,
        tags: [...new Set([...metadata.tags, 'generated'])].slice(0, 4),
        storageKey: id, fileName
      };
      setNotes(current => [saved, ...current.filter(note => !note.sample)]);
      setPage('My library');
      setSubject('All subjects');
      notify('Saved to your private MechaMind library.');
    } catch {
      notify('Could not save this result to browser storage. Check available device storage.');
    }
  }

  async function runTutorPrompt(
    prompt: string,
    mode: StudyMode = studyMode,
    documentText: string = activeDocumentText,
    documentName: string = activeDocumentName,
    startingChat: ChatMessage[] = chat
  ) {
    if (!prompt.trim() || chatBusy) return;
    const next: ChatMessage[] = [...startingChat, { role: 'user', content: prompt.trim() }];
    setChat(next);
    setChatInput('');
    setChatBusy(true);
    try {
      if (backendConfigured && supabase) {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session) {
          const { data, error } = await supabase.functions.invoke('ai-tutor', {
            body: {
              mode,
              documentName: documentName || undefined,
              documentText: documentText ? documentText.slice(0, 30000) : undefined,
              messages: [{ role: 'assistant', content: personalTutorContext }, ...next.slice(-14).map(m => ({ role: m.role, content: m.content.slice(-4000) }))]
            }
          });
          if (error || !data?.reply) throw new Error(data?.error ?? friendlyError(error));
          setChat([...next, { role: 'assistant', content: data.reply }]);
        } else {
          const fallback = documentText
            ? localDocumentStudy(documentText, documentName, mode) + '\n\n**Live AI note:** Sign in to the configured study account for a deeper AI-powered analysis.'
            : 'Your notes stay available locally. Sign in to the configured study account to use live AI. The built-in study preview can still help with common concepts.';
          setChat([...next, { role: 'assistant', content: fallback }]);
        }
      } else {
        await new Promise(resolve => window.setTimeout(resolve, 220));
        setChat([...next, { role: 'assistant', content: documentText ? localDocumentStudy(documentText, documentName, mode) : localStudyModeReply(prompt, mode) }]);
      }
    } catch (error) {
      const fallback = documentText
        ? 'The live AI service is unavailable, so here is a quick local pass instead.\n\n' + localDocumentStudy(documentText, documentName, mode) + '\n\nFor deeper AI reasoning, check the tutor service connection.'
        : localStudyModeReply(prompt, mode) + '\n\nLive AI connection note: ' + friendlyError(error);
      setChat([...next, { role: 'assistant', content: fallback }]);
    } finally {
      setChatBusy(false);
    }
  }

  async function sendQuestion(event: FormEvent) {
    event.preventDefault();
    const typedText = chatInput.trim();
    if (!typedText || chatBusy) return;
    let prompt = typedText;
    let sourceText = activeDocumentText;
    let sourceName = activeDocumentName;
    if (!sourceText && (studyMode === 'notes' || studyMode === 'analyze') && typedText.length > 700 && /\r|\n/.test(typedText)) {
      sourceText = typedText.slice(0, 30000);
      sourceName = 'Pasted lecture excerpt';
      prompt = studyMode === 'notes'
        ? 'Create structured revision notes from the pasted lecture text. Preserve course terminology, show formulas and worked examples where supported, and include a self-test with answers.'
        : 'Analyse the pasted lecture text: summarise it, map topics, identify definitions and formulas, flag gaps or ambiguous claims, provide likely test questions with model answers, and create a prioritised revision plan.';
    }
    await runTutorPrompt(prompt, studyMode, sourceText, sourceName, chat);
  }

  async function openNoteForStudy(note: Note, mode: 'notes' | 'analyze') {
    if (note.sample || !note.storageKey) {
      notify('That card is a preview. Import the actual lecture PDF or document to generate notes from its contents.');
      setUploadOpen(true);
      return;
    }
    setPage('AI study desk');
    setStudyMode(mode);
    setMobileNav(false);
    setActiveDocumentName(note.name);
    setActiveDocumentText('');
    setChat([{ role: 'assistant', content: 'Opening ' + note.name + ' and extracting readable text from your saved file…' }]);
    setChatBusy(true);
    let documentText = '';
    try {
      const cachedText = await vaultGet('text-' + note.storageKey);
      if (cachedText) documentText = await cachedText.text();
      if (!documentText.trim()) {
        const sourceBlob = await vaultGet(note.storageKey);
        if (!sourceBlob) throw new Error('The original file is missing from this browser storage.');
        const inferredName = note.fileName ?? (note.kind === 'PDF' ? note.name + '.pdf' : note.name + '.docx');
        const sourceFile = new window.File([sourceBlob], inferredName, { type: sourceBlob.type });
        documentText = await readableText(sourceFile);
      }
      if (documentText.trim().length < 80) {
        const warning = 'I could not extract enough readable text from this file. It may be a scanned/image-only PDF or an unsupported file format. Try a text-based PDF, DOCX or TXT file. OCR for scanned pages is not enabled yet.';
        setActiveDocumentText('');
        setChat([{ role: 'assistant', content: warning }]);
        notify('Not enough selectable text was found in that file.');
        return;
      }
      documentText = documentText.slice(0, 30000);
      setActiveDocumentText(documentText);
    } catch (error) {
      setActiveDocumentText('');
      setChat([{ role: 'assistant', content: 'I could not open that note from this browser. ' + friendlyError(error) }]);
      notify('Could not read that saved file.');
      return;
    } finally {
      setChatBusy(false);
    }
    const initialChat: ChatMessage[] = [{ role: 'assistant', content: 'Loaded ' + note.name + '. I’ll ground this session in the readable text extracted from your file.' }];
    setChat(initialChat);
    const prompt = mode === 'notes'
      ? 'Generate clear, well-structured revision notes from the uploaded lecture "' + note.name + '". Preserve the lecturer’s terminology; organise by headings; explain concepts step by step; include formulas, definitions, worked examples where the source supports them, a concise recap, and a short self-test with answers. Flag unclear or potentially mistaken source statements rather than silently rewriting them.'
      : 'Analyse my uploaded lecture "' + note.name + '". Give me an executive summary, topic map, essential definitions, formulas and assumptions, the most important takeaways, gaps or ambiguous statements to revisit, likely exam-style questions with model answers, and a prioritised revision plan. Ground claims in the source and distinguish actual source content from your own explanatory clarifications.';
    await runTutorPrompt(prompt, mode, documentText, note.name, initialChat);
  }

  const pageTitle = page === 'Overview' ? "David's engineering cockpit" : page === 'My library' ? 'My library' : page === 'Starred' ? 'Starred notes' : 'AI study desk';
  const pageSubtitle = page === 'Overview' ? 'Bowen University · Mechatronics Engineering · one concept closer to your Ligron mission.' : page === 'My library' ? 'Every lecture, handout and revision file, in one place.' : page === 'Starred' ? 'The notes you want to find in a heartbeat.' : 'Ask better questions. Understand the why, not just the answer.';
  const navItems: { name: Page; icon: ReactNode }[] = [
    { name: 'Overview', icon: <Grid2X2 size={18} /> },
    { name: 'My library', icon: <Library size={18} /> },
    { name: 'Starred', icon: <Bookmark size={18} /> },
    { name: 'AI study desk', icon: <BrainCircuit size={18} /> },
  ];

  async function installApp() {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === 'accepted') notify('Installing your study app…');
      else notify('No problem. You can install it whenever you like.');
      setInstallPrompt(null);
      return;
    }
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIOS) notify('On iPhone/iPad: tap Share in Safari, then Add to Home Screen.');
    else if (window.matchMedia('(display-mode: standalone)').matches) notify('The app is already installed on this device.');
    else notify('If your browser supports installation, open its menu and choose Install app or Add to Home screen.');
  }

  function choosePage(next: Page) { setPage(next); setMobileNav(false); setSubject('All subjects'); }
  function startPersonalStudy(prompt: string) {
    setChatInput(prompt);
    setActiveDocumentText('');
    setActiveDocumentName('');
    setStudyMode('explain');
    setPage('AI study desk');
    setMobileNav(false);
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  function NoteCard({ note }: { note: Note }) {
    return <article className={'note-card ' + (view === 'list' ? 'note-list' : '')}>
      <div className={'note-cover cover-' + (note.subject.toLowerCase().replace(/[^a-z]/g, '') || 'other')}>
        <div className="cover-top"><span className="file-kind">{fileIcon(note.kind)} {note.kind}</span><button className={'icon-button star-button ' + (note.starred ? 'is-starred' : '')} aria-label="Toggle favourite" onClick={() => toggleStar(note)}><Star size={17} fill={note.starred ? 'currentColor' : 'none'} /></button></div>
        <div className="cover-mark">{note.subject === 'Mathematics' ? '∑' : note.subject === 'Physics' ? '∿' : note.subject === 'Electronics' ? '⌁' : note.subject === 'Engineering' ? '⚙' : '✳'}</div>
        <span className="cover-course">{note.course}</span>
      </div>
      <div className="note-card-body">
        <div className="note-meta"><span>{note.subject}</span><span className="meta-dot">·</span><span>{new Date(note.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></div>
        <h3>{note.name}</h3>
        <div className="note-tags">{note.tags.slice(0, 2).map(tag => <span key={tag}>{tag}</span>)}{note.sample && <span className="sample-tag">Sample</span>}</div>
        <div className="note-study-actions"><button type="button" onClick={() => void openNoteForStudy(note, 'notes')}><FileText size={13} /> Make notes</button><button type="button" onClick={() => void openNoteForStudy(note, 'analyze')}><BrainCircuit size={13} /> Analyse</button></div>
        <div className="note-card-footer"><span><HardDrive size={13} /> {formatSize(note.size)}</span><div className="note-actions"><button className="icon-button" aria-label="Download note" onClick={() => void downloadNote(note)}><ArrowDownToLine size={16} /></button><div className="more-wrap"><button className="icon-button" aria-label="More note actions" onClick={() => setMenuNote(menuNote === note.id ? null : note.id)}><MoreHorizontal size={17} /></button>{menuNote === note.id && <div className="action-menu"><button onClick={() => toggleStar(note)}><Star size={14} /> {note.starred ? 'Remove star' : 'Add star'}</button><button onClick={() => void downloadNote(note)}><ArrowDownToLine size={14} /> Download file</button><button className="danger-action" onClick={() => void deleteNote(note)}><Trash2 size={14} /> Remove note</button></div>}</div></div></div>
      </div>
    </article>;
  }

  return <div className={'mm-app ' + (darkMode ? 'theme-dark' : '')}>
    <NeuralCanvas darkMode={darkMode} />
    <aside className={'sidebar ' + (mobileNav ? 'sidebar-open' : '')}>
      <div className="brand-lockup"><div className="brand-symbol"><span>m</span><i /></div><div><strong>mecha<span>mind</span></strong><small>YOUR LEARNING SPACE</small></div><button className="mobile-close icon-button" onClick={() => setMobileNav(false)}><X size={19} /></button></div>
      <div className="workspace-label">WORKSPACE <ChevronDown size={13} /></div>
      <nav className="main-nav">{navItems.map(item => <button key={item.name} className={'nav-item ' + (page === item.name ? 'nav-active' : '')} onClick={() => choosePage(item.name)}>{item.icon}<span>{item.name}</span>{item.name === 'Starred' && starredCount > 0 && <small>{starredCount}</small>}{item.name === 'My library' && <small>{notes.length}</small>}</button>)}</nav>
      <div className="sidebar-divider" />
      <div className="workspace-label">YOUR SUBJECTS <button className="tiny-add" aria-label="Add subject" onClick={() => notify('Custom subjects are coming in the next build.')}><Plus size={14} /></button></div>
      <div className="subject-nav">{subjects.slice(1).map((s, i) => <button key={s} onClick={() => { setSubject(s); setPage('My library'); setMobileNav(false); }} className={subject === s ? 'subject-active' : ''}><span className={'subject-dot subject-dot-' + i} />{s}</button>)}</div>
      <div className="sidebar-bottom"><div className="storage-card"><div className="storage-icon"><HardDrive size={17} /></div><div className="storage-copy"><strong>Your private vault</strong><span>{savedCount} files saved · {formatSize(totalBytes)}</span></div><div className="storage-meter"><i style={{ width: Math.min(100, totalBytes / (250 * 1024 * 1024) * 100) + '%' }} /></div><small>Stored on this device</small></div><button className="nav-item settings-link" onClick={() => notify('Settings will arrive with cloud sync and account preferences.')}><Settings2 size={17} /><span>Settings</span></button><div className="profile-row"><div className="profile-avatar">D</div><div className="profile-copy"><strong>David's workspace</strong><small>Mechatronics Engineering</small></div><MoreHorizontal size={18} /></div></div>
    </aside>

    <main className="main-shell">
      <header className="topbar"><button className="mobile-menu icon-button" onClick={() => setMobileNav(true)}><Menu size={20} /></button><div className="breadcrumb"><span>Workspace</span><span className="crumb-slash">/</span><strong>{page}</strong></div><div className="topbar-actions"><label className="global-search"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search your notes..." /><kbd><Command size={11} /> K</kbd></label><button className="install-app-button" onClick={() => void installApp()} title="Install app on this device"><Download size={16} /><span>Install app</span></button><button className="theme-toggle icon-button" aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"} title={darkMode ? "Switch to light mode" : "Switch to dark mode"} onClick={() => setDarkMode(value => !value)}>{darkMode ? <Sun size={18} /> : <Moon size={18} />}</button><button className="top-upload" onClick={() => setUploadOpen(true)}><Plus size={17} /> <span>Add notes</span></button><div className="top-avatar">D</div></div></header>

      <div className="page-content">
        {page !== 'AI study desk' ? <>
          <section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> {page === 'Overview' ? 'BOWEN UNIVERSITY · MECHATRONICS ENGINEERING' : page === 'My library' ? 'YOUR STUDY MATERIALS' : 'YOUR FAVOURITES'}</div><h1>{pageTitle}<span className="heading-period">.</span></h1><p>{pageSubtitle}</p></div><button className="primary-button" onClick={() => setUploadOpen(true)}><UploadCloud size={17} /> Import notes <ArrowRight size={16} /></button></section>
          {page === 'Overview' && (
            <section className="welcome-panel">
              <div className="welcome-copy">
                <div className="welcome-pill"><Sparkles size={13} /> DAVID'S ENGINEERING COCKPIT</div>
                <h2>Build skills. <em>Build Ligron.</em></h2>
                <p>Bowen University · Mechatronics Engineering. Learn step by step, master the maths, then connect your lessons to robotics, AI, electronics and real-world builds.</p>
                <button className="welcome-button" onClick={() => startPersonalStudy(personalStudyPaths[3].prompt)}>Start my engineering mission <ArrowRight size={16} /></button>
                <div className="welcome-foot">
                  <span><Check size={14} /> Step-by-step learning</span>
                  <span><Zap size={14} /> Worked examples + mini-quizzes</span>
                </div>
              </div>
              <div className="welcome-illustration">
                <div className="orbit-ring ring-one" />
                <div className="orbit-ring ring-two" />
                <div className="floating-note floating-note-one"><FileText size={20} /><span><b>CHM 101</b><small>Equations & stoichiometry</small></span></div>
                <div className="floating-note floating-note-two"><BookOpen size={20} /><span><b>Vectors & mechanics</b><small>Step-by-step practice</small></span></div>
                <div className="brain-orb"><BrainCircuit size={51} strokeWidth={1.35} /></div>
                <span className="orbit-spark">✦</span>
              </div>
            </section>
          )}
          <section className="stats-row"><div className="stat-card"><div className="stat-icon stat-lilac"><Library size={18} /></div><div><span>Total notes</span><strong>{notes.filter(n => !n.sample).length}<small>{notes.some(n => n.sample) ? ' + samples' : ' files'}</small></strong></div><span className="stat-trend"><ArrowRight size={14} /></span></div><div className="stat-card"><div className="stat-icon stat-peach"><Bookmark size={18} /></div><div><span>Starred notes</span><strong>{starredCount}<small> saved for later</small></strong></div><span className="stat-trend"><Star size={14} /></span></div><div className="stat-card"><div className="stat-icon stat-mint"><CalendarDays size={18} /></div><div><span>Study rhythm</span><strong>{savedCount ? 'Building' : 'Ready'}<small> one step at a time</small></strong></div><span className="stat-trend"><Zap size={14} /></span></div></section>
          {page === 'Overview' && <section className="personal-runway">
            <div className="section-heading personal-runway-heading">
              <div><div className="section-kicker">YOUR CURRENT STUDY MAP</div><h2>Pick your next concept <span>4 pathways</span></h2></div>
              <span className="personal-learning-badge"><BrainCircuit size={14} /> Built for deep understanding</span>
            </div>
            <div className="personal-path-grid">
              {personalStudyPaths.map(path => <button type="button" key={path.code} className="personal-path-card" onClick={() => startPersonalStudy(path.prompt)} aria-label={"Study " + path.title}>
                <div className="personal-path-top"><span className="personal-path-glyph">{path.glyph}</span><span className="personal-path-label">{path.label}</span></div>
                <h3>{path.title}</h3>
                <p>{path.description}</p>
                <span className="personal-path-action">Study this next <ArrowRight size={14} /></span>
              </button>)}
            </div>
            <div className="personal-mission">
              <div className="personal-mission-icon"><Zap size={20} /></div>
              <div className="personal-mission-copy"><span className="section-kicker">LONG-TERM NORTH STAR</span><h3>Ligron</h3><p>Turn concepts into capability: learn the principle, build a small prototype, test it, and improve it.</p></div>
              <div className="personal-milestones"><span><b>01</b> Learn foundations</span><span><b>02</b> Build prototypes</span><span><b>03</b> Solve real problems</span></div>
            </div>
            <p className="personal-runway-note">The CHM 101 path is mapped from the module you shared. Import the original PDF through <strong>Add notes</strong> to keep the file in this browser's private vault.</p>
          </section>}
          <section className="library-section"><div className="section-heading"><div><div className="section-kicker">{page === 'Starred' ? 'YOUR FAVOURITES' : page === 'My library' ? 'THE COLLECTION' : 'PICK UP WHERE YOU LEFT OFF'}</div><h2>{page === 'Starred' ? 'Saved for later' : page === 'My library' ? 'All your notes' : 'Recently organised'} <span>{filteredNotes.length}</span></h2></div><div className="library-tools"><label className="subject-select"><select value={subject} onChange={e => setSubject(e.target.value)}>{subjects.map(s => <option key={s}>{s}</option>)}</select><ChevronDown size={15} /></label><div className="view-toggle"><button aria-label="Grid view" className={view === 'grid' ? 'view-active' : ''} onClick={() => setView('grid')}><Grid2X2 size={16} /></button><button aria-label="List view" className={view === 'list' ? 'view-active' : ''} onClick={() => setView('list')}><List size={17} /></button></div></div></div>
            {filteredNotes.length ? <div className={'notes-grid ' + (view === 'list' ? 'list-view' : '')}>{filteredNotes.map(note => <NoteCard key={note.id} note={note} />)}</div> : <div className="empty-state"><div className="empty-icon"><FolderOpen size={25} /></div><h3>No notes found</h3><p>Try another search or import a lecture file to start your collection.</p><button className="primary-button" onClick={() => setUploadOpen(true)}><Plus size={16} /> Add a note</button></div>}
          </section>
          {page === 'Overview' && <section className="whatsapp-tip"><div className="whatsapp-mark"><MessageCircle size={21} /></div><div><strong>Notes arriving through WhatsApp?</strong><p>Open the lecture in WhatsApp, save or share the attachment to your device, then import it here. Direct WhatsApp linking is a future upgrade.</p></div><button onClick={() => setUploadOpen(true)}>Import a file <ArrowRight size={15} /></button></section>}
        </> : <section className="study-page"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> THINK IT THROUGH</div><h1>AI study desk<span className="heading-period">.</span></h1><p>One question can unlock a whole topic. Start anywhere.</p></div><div className="ai-status"><span /> {backendConfigured ? 'AI service configured' : 'Study preview'}</div></div><div className="study-layout"><aside className="study-aside"><div className="study-aside-icon"><BrainCircuit size={25} /></div><h2>Learn for understanding.</h2><p>Bring a question, a tricky formula or a concept you want to see from a different angle.</p><div className="study-divider" /><span className="section-kicker">YOUR NEXT STUDY MOVES</span><button onClick={() => setChatInput(personalStudyPaths[0].prompt)}><FileText size={16} /><span><b>CHM 101 deep dive</b><small>Balancing + stoichiometry</small></span><ArrowRight size={15} /></button><button onClick={() => setChatInput(personalStudyPaths[1].prompt)}><BrainCircuit size={16} /><span><b>Check the vector field</b><small>Curl, domain + circulation</small></span><ArrowRight size={15} /></button><button onClick={() => setChatInput(personalStudyPaths[2].prompt)}><Zap size={16} /><span><b>Derive motion equations</b><small>Start from v = u + at</small></span><ArrowRight size={15} /></button><button onClick={() => setChatInput(personalStudyPaths[3].prompt)}><BookOpen size={16} /><span><b>Map the Ligron path</b><small>Learning into real prototypes</small></span><ArrowRight size={15} /></button><div className="study-note-link"><BrainCircuit size={17} /><span><b>Your learning style</b><small>Step-by-step reasoning, worked calculations, diagrams where useful, and short quizzes that test understanding.</small></span></div></aside><div className="chat-panel"><div className="chat-panel-head"><div className="chat-bot-icon"><Sparkles size={18} /></div><div><strong>David's MechaMind companion</strong><small>Mechatronics · clear steps · real builds</small></div><button className="icon-button" onClick={() => { setChat([{ role: 'assistant', content: chatWelcome }]); setActiveDocumentText(''); setActiveDocumentName(''); setStudyMode('explain'); }}><MoreHorizontal size={18} /></button></div><div className="study-mode-picker" role="group" aria-label="Choose study mode"><span>MODE</span><button className={studyMode === 'explain' ? 'mode-active' : ''} onClick={() => setStudyMode('explain')} type="button">Explain</button><button className={studyMode === 'notes' ? 'mode-active' : ''} onClick={() => setStudyMode('notes')} type="button">Make notes</button><button className={studyMode === 'analyze' ? 'mode-active' : ''} onClick={() => setStudyMode('analyze')} type="button">Analyse</button><button className={studyMode === 'quiz' ? 'mode-active' : ''} onClick={() => setStudyMode('quiz')} type="button">Quiz</button><button className={studyMode === 'plan' ? 'mode-active' : ''} onClick={() => setStudyMode('plan')} type="button">Study plan</button></div>{activeDocumentName && <div className="active-document-pill"><FileText size={14} /><span>Using note: <strong>{activeDocumentName}</strong></span><button type="button" aria-label="Stop using this note" onClick={() => { setActiveDocumentName(''); setActiveDocumentText(''); }}>×</button></div>}<div className="chat-messages">{chat.map((message, index) => <div key={index} className={'chat-message ' + (message.role === 'user' ? 'user-message' : '')}><div className="message-avatar">{message.role === 'assistant' ? <Sparkles size={15} /> : 'D'}</div><div className="message-bubble">{message.content.split('\n').map((line, i) => { const value = line.trim(); if (!value) return <div key={i} className="chat-md-spacer" />; if (value.startsWith('### ')) return <h5 key={i} className="chat-md-h5">{renderInlineMessage(value.slice(4))}</h5>; if (value.startsWith('## ')) return <h4 key={i} className="chat-md-h4">{renderInlineMessage(value.slice(3))}</h4>; if (value.startsWith('# ')) return <h3 key={i} className="chat-md-h3">{renderInlineMessage(value.slice(2))}</h3>; if (/^[-*]\s/.test(value)) return <p key={i} className="chat-md-list">• {renderInlineMessage(value.slice(2))}</p>; if (/^\d+\.\s/.test(value)) return <p key={i} className="chat-md-list">{renderInlineMessage(value)}</p>; return <p key={i}>{renderInlineMessage(value)}</p>; })}{message.role === 'assistant' && index > 0 && message.content.length > 220 && <div className="generated-result-actions"><button type="button" onClick={() => void copyStudyResult(message.content)}><Copy size={13} /> Copy</button><button type="button" onClick={() => downloadStudyResult(message.content)}><ArrowDownToLine size={13} /> Download Markdown</button><button type="button" className="save-generated-note" onClick={() => void saveGeneratedNote(message.content)}><BookmarkPlus size={13} /> Save to notes</button></div>}</div></div>)}{chatBusy && <div className="chat-message"><div className="message-avatar"><Sparkles size={15} /></div><div className="typing-dots"><i /><i /><i /></div></div>}<div ref={dropRef} /></div><form className="chat-composer" onSubmit={sendQuestion}><textarea value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder={studyMode === 'notes' ? 'Paste lecture text or ask for structured notes…' : studyMode === 'analyze' ? 'Ask about a note, or analyse the attached file…' : studyMode === 'quiz' ? 'Choose a topic to be quizzed on…' : 'Ask anything you’re learning…'} rows={2} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendQuestion(e as unknown as FormEvent); } }} /><div className="composer-footer"><span><Sparkles size={13} /> Check the reasoning, not just the result</span><button type="submit" disabled={!chatInput.trim() || chatBusy} aria-label="Send message"><Send size={17} /></button></div></form><div className="chat-disclaimer">PDF, DOCX and text extraction runs in this browser. Extracted text is sent to the secure AI tutor only when you ask it to study a note; image-only scanned PDFs need OCR, which is not enabled yet.</div></div></div></section>}
          <footer className="page-footer"><span>Made for curious minds <span className="footer-spark">✳</span></span><span><span className="privacy-dot" /> Your files stay on this device in this version</span></footer>
      </div>
    </main>

    {mobileNav && <button className="mobile-scrim" aria-label="Close menu" onClick={() => setMobileNav(false)} />}
    {uploadOpen && <div className="modal-scrim" onClick={() => setUploadOpen(false)}><div className="upload-modal" onClick={e => e.stopPropagation()}><div className="modal-head"><div><span className="section-kicker">GROW YOUR LIBRARY</span><h2>Bring your notes in.</h2><p>PDFs, slides, documents, images and audio files are welcome.</p></div><button className="icon-button" onClick={() => setUploadOpen(false)}><X size={19} /></button></div><label className="auto-organize-toggle"><input type="checkbox" checked={autoOrganize} onChange={e => setAutoOrganize(e.target.checked)} /><span className="auto-organize-icon"><Sparkles size={17} /></span><span><strong>Auto-organise my notes</strong><small>Suggests subjects, course codes and tags. Connected AI can analyse readable text files.</small></span><span className={"toggle-track " + (autoOrganize ? "toggle-on" : "")}><i /></span></label><div className={'drop-zone ' + (dragging ? 'drop-zone-active' : '')} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); void importFiles(e.dataTransfer.files); }}><div className="drop-icon"><UploadCloud size={25} /></div><strong>Drag your files here</strong><span>or choose them from your device</span><button className="primary-button" onClick={() => fileInput.current?.click()}><Plus size={16} /> Choose files</button><small>Files are stored in this browser, not uploaded to a cloud server.</small></div><input ref={fileInput} type="file" multiple hidden onChange={e => { if (e.target.files) void importFiles(e.target.files); e.currentTarget.value = ''; }} /><div className="import-hint"><div className="hint-icon"><MessageCircle size={17} /></div><div><strong>Import from WhatsApp</strong><p>Save the document from WhatsApp to your device first, then select it above. You can also drag files straight from your Downloads folder.</p></div></div><div className="modal-bottom"><span><Check size={14} /> No subscription. No upload limit set by us.</span><button className="text-button" onClick={() => setUploadOpen(false)}>Done</button></div></div></div>}
    {toast && <div className="toast"><Check size={16} /> {toast}</div>}
  </div>;
}
