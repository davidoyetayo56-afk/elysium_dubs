import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { json, preflight } from '../_shared/cors.ts';
Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Sign in to access your library.' }, 401);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: { user }, error } = await admin.auth.getUser(authorization.slice(7));
  if (error || !user) return json({ error: 'Your session is invalid.' }, 401);
  let resourceId: string; try { resourceId = String((await req.json()).resourceId ?? ''); } catch { return json({ error: 'Invalid request body.' }, 400); }
  if (!/^[0-9a-f-]{36}$/i.test(resourceId)) return json({ error: 'Invalid resource.' }, 400);
  const { data: resource } = await admin.from('resources').select('id,file_path,status,price_kobo').eq('id', resourceId).maybeSingle();
  if (!resource || resource.status !== 'published' || !resource.file_path) return json({ error: 'This file is not available.' }, 404);
  if (resource.price_kobo > 0) {
    const { data: purchase } = await admin.from('purchases').select('resource_id').eq('user_id', user.id).eq('resource_id', resource.id).maybeSingle();
    if (!purchase) return json({ error: 'Purchase this resource to access the file.' }, 403);
  }
  const { data: signed, error: signError } = await admin.storage.from('resource-files').createSignedUrl(resource.file_path, 60, { download: true });
  if (signError || !signed?.signedUrl) return json({ error: 'Could not prepare a secure download. Please retry.' }, 500);
  return json({ url: signed.signedUrl, expiresIn: 60 });
});
