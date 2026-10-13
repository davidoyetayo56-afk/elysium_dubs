# AI Tutor setup

The tutor interface works in preview mode without an AI provider. Live AI answers use a Supabase Edge Function so the provider key never ships to the browser.

## 1. Configure Supabase secrets

In your Supabase project, open **Project Settings → Edge Functions → Secrets** and add:

- `OPENAI_API_KEY`: your private provider API key.
- `OPENAI_MODEL`: optional model name; defaults to `gpt-4o-mini`.
- `SITE_URL`: `https://davidoyetayo56-afk.github.io` (the origin only, without the repository path).

Never add `OPENAI_API_KEY` to a `VITE_*` variable or commit it to GitHub.

## 2. Deploy the function

From the app directory, link the project if it is not already linked, then run:

```sh
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy ai-tutor
```

The app already invokes the function as `ai-tutor`. The function verifies the signed-in Supabase user before forwarding the conversation to the AI provider.

## 3. Test it

1. Confirm `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in the frontend deployment environment.
2. Sign in to Elysium Dubs Hub.
3. Open **AI Tutor**, choose Explain, Quiz, or Study plan, and send a question.
4. If the function has not been deployed or the secret is missing, the interface displays a setup message. Preview mode remains available when no backend is configured.

GitHub Pages only hosts the frontend. It cannot run the Supabase Edge Function itself.
