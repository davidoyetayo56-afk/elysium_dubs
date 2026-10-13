import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json, preflight } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Sign in before checkout.' }, 401);
  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
  const siteUrl = Deno.env.get('SITE_URL');
  if (!secret || !siteUrl) return json({ error: 'Payments are not configured yet.' }, 503);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const token = authorization.slice(7);
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user?.email) return json({ error: 'Your session is invalid. Please sign in again.' }, 401);
  let body: { resourceId?: string };
  try { body = await req.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }
  if (!body.resourceId || !/^[0-9a-f-]{36}$/i.test(body.resourceId)) return json({ error: 'Invalid resource.' }, 400);
  const { data: resource, error: resourceError } = await admin.from('resources').select('id,title,price_kobo,status').eq('id', body.resourceId).maybeSingle();
  if (resourceError || !resource || resource.status !== 'published') return json({ error: 'This resource is unavailable.' }, 404);
  if (resource.price_kobo <= 0) return json({ error: 'This resource is free. Use the download action instead.' }, 400);
  const { data: existing } = await admin.from('purchases').select('resource_id').eq('user_id', user.id).eq('resource_id', resource.id).maybeSingle();
  if (existing) return json({ error: 'You already own this resource.' }, 409);
  const recentCutoff = new Date(Date.now() - 60_000).toISOString();
  const { count: recentAttempts } = await admin.from('payment_transactions').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', recentCutoff);
  if ((recentAttempts ?? 0) >= 5) return json({ error: 'Too many checkout attempts. Please wait a minute and try again.' }, 429);
  const reference = `elysium_${crypto.randomUUID().replaceAll('-', '')}`;
  const { error: insertError } = await admin.from('payment_transactions').insert({ user_id: user.id, resource_id: resource.id, reference, amount_kobo: resource.price_kobo, currency: 'NGN', status: 'pending' });
  if (insertError) return json({ error: 'Could not start checkout. Please try again.' }, 500);
  const response = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user.email, amount: resource.price_kobo, currency: 'NGN', reference, callback_url: `${siteUrl.replace(/\/$/, '')}/?payment=verify`, metadata: { user_id: user.id, resource_id: resource.id, custom_fields: [{ display_name: 'Resource', variable_name: 'resource_title', value: resource.title }] } }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.status || !payload?.data?.authorization_url) {
    await admin.from('payment_transactions').update({ status: 'failed' }).eq('reference', reference);
    return json({ error: 'The payment provider could not start checkout. Please try again.' }, 502);
  }
  return json({ authorization_url: payload.data.authorization_url, reference });
});
