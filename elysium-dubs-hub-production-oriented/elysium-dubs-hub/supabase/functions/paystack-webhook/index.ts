import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

async function verifySignature(rawBody: string, signature: string, secret: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const signed = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)));
  const hex = [...signed].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (hex.length !== signature.length) return false;
  let mismatch = 0; for (let i = 0; i < hex.length; i++) mismatch |= hex.charCodeAt(i) ^ signature.toLowerCase().charCodeAt(i);
  return mismatch === 0;
}
Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
  if (!secret) return new Response('Payment secret missing', { status: 503 });
  const raw = await req.text(); const signature = req.headers.get('x-paystack-signature') ?? '';
  if (!await verifySignature(raw, signature, secret)) return new Response('Invalid signature', { status: 401 });
  let event: any; try { event = JSON.parse(raw); } catch { return new Response('Invalid JSON', { status: 400 }); }
  if (event.event !== 'charge.success' || !event.data?.reference) return new Response('Ignored', { status: 200 });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const reference = String(event.data.reference);
  const { data: tx } = await admin.from('payment_transactions').select('*').eq('reference', reference).maybeSingle();
  if (!tx) return new Response('Unknown reference', { status: 404 });
  const verify = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${secret}` } });
  const payload = await verify.json().catch(() => null);
  const valid = verify.ok && payload?.status === true && payload?.data?.status === 'success' && payload?.data?.reference === reference && payload?.data?.amount === tx.amount_kobo && payload?.data?.currency === 'NGN' && payload?.data?.customer?.email?.toLowerCase() === event.data?.customer?.email?.toLowerCase();
  if (!valid) return new Response('Verification failed', { status: 400 });
  await admin.from('payment_transactions').update({ status: 'success', paystack_transaction_id: String(payload.data.id), paid_at: payload.data.paid_at ?? new Date().toISOString() }).eq('id', tx.id);
  const { error } = await admin.from('purchases').upsert({ user_id: tx.user_id, resource_id: tx.resource_id, transaction_id: tx.id }, { onConflict: 'user_id,resource_id' });
  if (error) return new Response('Could not update purchase', { status: 500 });
  return new Response('OK', { status: 200 });
});
