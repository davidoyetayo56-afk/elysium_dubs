# Secure AI and cloud-sync setup

MechaMind's AI tutor and AI note organiser are designed to call the AI provider from the Supabase Edge Function. The browser must never receive the provider's secret key.

## Before enabling AI

1. Revoke any API key that has been pasted into a chat, issue, screenshot, browser code, or public repository.
2. Create a replacement key in the provider dashboard. Check the provider's pricing and usage limits first; a free account or a ChatGPT subscription does not necessarily include free API usage.
3. In the Supabase dashboard for this project, open **Edge Functions → Secrets** and add:
   - Name: `OPENAI_API_KEY`
   - Value: the replacement secret, pasted directly into the dashboard
4. Optionally add `OPENAI_MODEL` with a model your API account can access. If omitted, the function defaults to `gpt-4o-mini`.
5. Deploy the updated `ai-tutor` Edge Function from this repository to the same Supabase project. From the project root, sign in to the Supabase CLI, link the project, then run `supabase functions deploy ai-tutor`. The GitHub Pages workflow deploys the website only; it does not deploy Edge Functions.
6. Verify authentication, the CORS `SITE_URL`, provider usage limits, and the `OPENAI_API_KEY` secret before sharing the app.
7. Test the AI tutor, the **Make notes** action, and the **Analyse** action while signed in. If live AI is unavailable, readable notes still get a local quick analysis, but deeper reasoning requires the deployed function and its secrets.

## Important

- Never place a provider key in React code, `.env` variables prefixed with `VITE_`, GitHub Pages configuration, or a committed file.
- GitHub Pages serves client-side code publicly. Secrets belong only in server-side secret storage such as Supabase Edge Function Secrets.
- Set a usage budget or alert in the provider dashboard and review usage periodically.
- Imported lecture files and extracted text are stored in the user's browser storage. The app can extract selectable text from PDFs, DOCX documents, and supported text formats. Image-only/scanned PDFs are not OCR'd yet. When the user asks the live tutor to make notes or analyse a file, up to 30,000 extracted characters are sent to the configured Supabase Edge Function; the provider key remains server-side.

## Phase 3: optional private cloud sync

Cloud sync is disabled until the frontend has Supabase's public project URL and anon key and the schema migration is installed. This feature uses the regular authenticated Supabase client with row-level policies. It must not use a service-role key in the browser.

1. In the Supabase SQL Editor for the project, run `supabase/migrations/20261014000000_mechamind_cloud_sync.sql`. It creates `public.mechamind_workspaces`, enables Row Level Security, grants access to authenticated users only, and creates a private `mechamind-files` Storage bucket limited to 25 MiB per object with user-folder policies.
2. In GitHub, open **Settings → Secrets and variables → Actions → Variables**, then create:
   - `VITE_SUPABASE_URL`: your Supabase project URL.
   - `VITE_SUPABASE_ANON_KEY`: the project's publishable/anon client key.
   
   These two values are public client configuration, not server secrets. The anon key is designed to be visible in a browser and is safe only when your database and storage RLS policies are correct. Never use `service_role`, secret API keys, or `OPENAI_API_KEY` for either variable. The updated GitHub Pages build workflow reads these repository Variables at build time; rerun a deployment after setting them.
3. In Supabase **Authentication → URL Configuration**, set the Site URL to `https://davidoyetayo56-afk.github.io/elysium_dubs/` and add that exact URL to the allowed Redirect URLs. Enable email sign-in / magic links and ensure email delivery works for your project.
4. Open MechaMind, go to **Settings and privacy → Optional cloud sync**, enter your email, and use the sign-in link. After returning to the app, press **Sync now**. Sync is manual, not background sync.
5. Export a full local backup before the first sync. The first sync uploads original files up to 25 MB each plus extracted text and study workspace data. Larger new files are skipped with a warning. The local copy remains in this browser. Review the status message after each sync.

### Sync and privacy boundaries

- A signed-in user can access only their row and files in their own UUID folder, enforced by the supplied RLS and Storage policies. Do not disable these policies or make the bucket public.
- The sync row contains note metadata, reading progress, bookmarks, flashcards, glossary terms, recaps, and up to 500 recent activity records. Original files and extracted text use private Storage paths.
- Sync combines IDs from both devices. For the same note ID, the device doing the sync wins metadata/file conflicts; reading progress takes the latest timestamp; bookmarks and study items merge. This is a practical first-pass merge, not a full conflict-resolution engine.
- Deleting local data in MechaMind does not delete the cloud copy. To remove cloud data, sign in and delete the workspace row and that user's objects through a deliberate, account-aware workflow. Do not assume local deletion is global deletion.
- The AI tutor is a separate optional Edge Function. Configuring cloud sync does not automatically enable AI answers; deploy and configure that function separately as explained above.
