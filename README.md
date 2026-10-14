# MechaMind

**Your learning space.** A private study library designed for science and engineering students.

- **Live app:** https://davidoyetayo56-afk.github.io/elysium_dubs/
- **Application source and setup guide:** [MechaMind app folder](./elysium-dubs-hub-production-oriented/elysium-dubs-hub/)
- **AI setup and privacy notes:** [AI_SETUP.md](./elysium-dubs-hub-production-oriented/elysium-dubs-hub/AI_SETUP.md)
- **Deployment:** GitHub Pages builds the React + TypeScript + Vite frontend with GitHub Actions.
- **Phase 2 study tools:** local flashcards, glossary, practice rounds, spaced review and lecture recaps.
- **Phase 3:** local study analytics and opt-in, manual Supabase sync, which requires the migration and GitHub Actions Variables described in the app README.
- **Local-first:** imported files and reading progress stay in browser storage by default. AI requests require a separately configured Supabase Edge Function; provider keys never belong in browser code.

The app folder README lists current features, limitations, and local development commands.
