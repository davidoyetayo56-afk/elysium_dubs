import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { json, preflight } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Sign in to verify your purchase.' }, 401);
  const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
  if (!secret) return json({ error: 'Payments are not configured yet.' }, 503);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: { user }, error: authError } = await admin.auth.getUser(authorization.slice(7));
  if (authError || !user) return json({ error: 'Your session is invalid.' }, 401);
  let reference: string;
  try { reference = String((await req.json()).reference ?? ''); } catch { return json({ error: 'Invalid request body.' }, 400); }
  if (!/^elysium_[a-f0-9]{32}$/i.test(reference)) return json({ error: 'Invalid payment reference.' }, 400);
  const { data: transaction } = await admin.from('payment_transactions').select('*').eq('reference', reference).eq('user_id', user.id).maybeSingle();
  if (!transaction) return json({ error: 'Payment record not found.' }, 404);
  if (transaction.status === 'success') return json({ verified: true, resourceId: transaction.resource_id });
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${secret}` } });
  const result = await response.json().catch(() => null);
  const paid = response.ok && result?.status === true && result?.data?.status === 'success' && result?.data?.reference === reference && result?.data?.amount === transaction.amount_kobo && result?.data?.currency === 'NGN' && result?.data?.customer?.email?.toLowerCase() === user.email?.toLowerCase();
  if (!paid) {
    if (result?.data?.status === 'failed' || result?.data?.status === 'abandoned') await admin.from('payment_transactions').update({ status: 'failed' }).eq('id', transaction.id);
    return json({ verified: false, error: 'Payment has not been verified. If you were charged, contact support with your payment reference.' }, 402);
  }
  const { error: updateError } = await admin.from('payment_transactions').update({ status: 'success', paystack_transaction_id: String(result.data.id), paid_at: result.data.paid_at ?? new Date().toISOString() }).eq('id', transaction.id);
  if (updateError) return json({ error: 'Payment verified but library update failed. Please retry verification.' }, 500);
  const { error: purchaseError } = await admin.from('purchases').upsert({ user_id: user.id, resource_id: transaction.resource_id, transaction_id: transaction.id }, { onConflict: 'user_id,resource_id' });
  if (purchaseError) return json({ error: 'Payment verified but library update failed. Please contact support.' }, 500);
  return json({ verified: true, resourceId: transaction.resource_id });
});
