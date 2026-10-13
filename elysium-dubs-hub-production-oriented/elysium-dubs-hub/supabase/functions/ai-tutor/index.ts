import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigin = Deno.env.get("SITE_URL") ?? "https://davidoyetayo56-afk.github.io";
const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

const modeInstructions: Record<string, string> = {
  explain: "Teach patiently and clearly. Define unfamiliar terms, show the reasoning step by step, use a worked example, and end with one short check-for-understanding question when appropriate.",
  quiz: "Act as a thoughtful examiner. Ask one question at a time, wait for the learner's attempt when possible, explain the reasoning behind corrections, and adapt the next question to their level.",
  plan: "Create realistic, time-boxed study plans with short breaks, active recall, worked practice, and a quick review. Ask a clarifying question only if a critical detail is missing.",
  organize: "Classify a student lecture file from the filename and supplied excerpt. Return ONLY a valid JSON object with name, subject, course, tags. Use subject Engineering, Mathematics, Physics, Chemistry, Programming, Electronics, or Other. Mechatronics Engineering is the user's degree programme, not a separate subject category; classify the note by its actual topic when clear. tags must be an array of 1 to 4 concise strings. Do not invent course codes or details; use Unsorted when unknown.",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!apiKey) return json({ error: "The AI service is not configured yet. Add the OPENAI_API_KEY secret in Supabase." }, 503);
  if (!supabaseUrl || !anonKey) return json({ error: "The authentication service is not configured." }, 503);

  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "Sign in to use the AI tutor." }, 401);
  const supabase = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return json({ error: "Your session is invalid or expired. Please sign in again." }, 401);

  let body: { mode?: string; messages?: Array<{ role: string; content: string }> };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Please send a valid question." }, 400);
  }

  const mode = body.mode && modeInstructions[body.mode] ? body.mode : "explain";
  const messages = Array.isArray(body.messages)
    ? body.messages.filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim()).slice(-16)
    : [];
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return json({ error: "Enter a question before sending." }, 400);
  }
  if (messages.some((m) => m.content.length > 4000)) return json({ error: "Please keep each message under 4,000 characters." }, 413);

  const systemPrompt = [
    "You are Elysium Tutor, a warm, rigorous academic study assistant for secondary-school and university learners.",
    "Prioritise understanding over simply giving answers. Explain in clear British English, define technical terms, and show equations with units where relevant.",
    "Never pretend to have read files or course notes that were not supplied. If information is uncertain, say so. For homework, teach the method and include a worked example instead of shaming the learner.",
    "Use readable Markdown, short headings, and numbered steps when useful. Keep the answer focused and end with a useful next step or check question where appropriate.",
    modeInstructions[mode],
    ...(mode === "organize" ? ["Output JSON only. No Markdown fences or extra prose."] : []),
  ].join("\n\n");

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        temperature: 0.35,
        max_tokens: 1200,
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error("AI provider request failed", response.status, detail.slice(0, 500));
      return json({ error: response.status === 429 ? "The tutor is busy right now. Please try again shortly." : "The AI provider could not complete that request. Check the service configuration and try again." }, 502);
    }
    const result = await response.json();
    const reply = result?.choices?.[0]?.message?.content;
    if (typeof reply !== "string" || !reply.trim()) return json({ error: "The tutor returned an empty answer. Please try again." }, 502);
    return json({ reply: reply.trim(), mode, usage: result?.usage ?? null });
  } catch (error) {
    console.error("AI tutor request failed", error);
    return json({ error: "The tutor could not connect just now. Please try again." }, 502);
  }
});
