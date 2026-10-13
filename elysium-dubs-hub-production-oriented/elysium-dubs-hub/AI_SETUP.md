# Secure AI setup

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
