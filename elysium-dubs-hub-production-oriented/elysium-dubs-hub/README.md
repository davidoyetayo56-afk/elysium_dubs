# MechaMind

**Your learning space**, built for university students who work with lecture notes, equations, diagrams and long reading sessions.

MechaMind is a React + TypeScript + Vite app published on GitHub Pages. Its private library stores files in the browser's IndexedDB by default, so the core library does not require a server or user account.

## Current experience

- Personalised dashboard for Bowen University Mechatronics Engineering, with a Ligron learning path.
- Private local vault for imported files, favourites, subject/course labels, and grid or list views.
- Bulk upload and local text extraction for selectable-text PDFs, DOCX and supported plain-text formats.
- Full-text search across extracted note text, course/subject filters, file-type filters, and sorting.
- Reading room for extracted lecture text, saved reading progress, bookmarks, adjustable text size and width, and browser read-aloud.
- In-browser playback for imported audio/video and image preview. Media never auto-plays.
- A persistent "Now studying" bar, course shelves, backup export and a delete-local-data action.
- Study toolkit with source-text draft flashcards, manual cards, glossary entries, multiple-choice practice rounds, spaced review scheduling, and short lecture recaps. Study-tool data stays in browser storage and is included in full backup export.
- Deep-black, light and system appearance settings.
- Optional secure AI note generation and lecture analysis through a Supabase Edge Function. The browser must never contain a provider API key.
- Installable PWA shell with an offline cache for previously visited app shell and built assets.

## Run locally

Requires Node.js 20 or later.

```bash
npm install
npm run dev
```

Before creating a production build, run:

```bash
npm run typecheck
npm run build
npm run preview
```

The GitHub Actions workflow at `.github/workflows/deploy.yml` builds the Vite app and deploys the `dist` directory to GitHub Pages.

## Privacy and file handling

- Original files and extracted text are saved locally in this browser's IndexedDB. They are not automatically uploaded or synced.
- When you explicitly ask the configured AI tutor to make notes or analyse a lecture, up to 30,000 extracted characters may be sent to the configured Supabase Edge Function. Read that service's privacy terms before sending sensitive material.
- A backup export contains original file data, note metadata and study progress. Keep the export private.
- "Delete all local data" removes the saved note files and associated progress from this browser. It does not affect copies or backups downloaded elsewhere.
- There are no third-party analytics or tracker libraries in the app. Google Fonts are currently loaded from Google's font CDN.

## Known limits

- Image-only/scanned PDFs and handwritten pages require OCR, which is not enabled yet. Extracted text may omit figures, diagrams and complex mathematical layout.
- PDF reading currently presents extracted text with page markers, not a pixel-perfect PDF page canvas. Use the original download for exact layout.
- PPTX/legacy slide text extraction and synced audio/video transcripts are not implemented.
- Reading progress is a percentage of the reader page and adapts to the current viewport; it is not yet an exact PDF page/scroll-position anchor across device sizes.
- Course shelves are inferred from the course code/labels on imported files. Collections, cloud sync and advanced learning analytics are not implemented yet.
- Study-toolkit cards, glossary entries and recaps are generated with local text-pattern heuristics, not a language model. They can miss context or create awkward prompts, so verify all generated material against the original lecture. Manual editing of individual generated cards is not yet available; you can delete and recreate a note's generated set.
- The live AI service requires Supabase project configuration and a separate deployment of the Edge Function. GitHub Pages deploys only the static website.

## AI service setup

See [AI_SETUP.md](./AI_SETUP.md). Provider secrets belong in Supabase Edge Function Secrets, never in GitHub Pages or browser code.
