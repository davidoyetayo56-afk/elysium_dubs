# Secure AI setup

MechaMind's AI tutor and AI note organiser are designed to call the AI provider from the Supabase Edge Function. The browser must never receive the provider's secret key.

## Before enabling AI

1. Revoke any API key that has been pasted into a chat, issue, screenshot, browser code, or public repository.
2. Create a replacement key in the provider dashboard. Check the provider's pricing and usage limits first; a free account or a ChatGPT subscription does not necessarily include free API usage.
3. In the Supabase dashboard for this project, open **Edge Functions → Secrets** and add:
   - Name: `OPENAI_API_KEY`
   - Value: the replacement secret, pasted directly into the dashboard
4. Optionally add `OPENAI_MODEL` with a model your API account can access. If omitted, the function defaults to `gpt-4o-mini`.
5. Deploy the `ai-tutor` Edge Function and verify its authentication, CORS site URL, and usage limits before sharing the app.
6. Test the AI tutor and note organiser while signed in. If the backend is not configured, the app should continue to provide its local study examples and filename-based organisation.

## Important

- Never place a provider key in React code, `.env` variables prefixed with `VITE_`, GitHub Pages configuration, or a committed file.
- GitHub Pages serves client-side code publicly. Secrets belong only in server-side secret storage such as Supabase Edge Function Secrets.
- Set a usage budget or alert in the provider dashboard and review usage periodically.
- Imported lecture files are currently saved in the user's browser storage. AI organisation analyses readable text formats supported by the app; PDF and Word extraction require a separate extraction implementation.
