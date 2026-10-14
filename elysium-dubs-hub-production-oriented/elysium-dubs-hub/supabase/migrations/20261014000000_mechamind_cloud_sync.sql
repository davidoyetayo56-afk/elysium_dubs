-- MechaMind Phase 3: private, opt-in workspace sync.
-- Run this migration in the Supabase project connected to the MechaMind frontend.
-- Every row and file is scoped to the authenticated user; no public bucket or service-role key is used.

create table if not exists public.mechamind_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  snapshot jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.mechamind_workspaces enable row level security;
revoke all on public.mechamind_workspaces from anon;
grant select, insert, update, delete on public.mechamind_workspaces to authenticated;

drop policy if exists "Users can read their own MechaMind workspace" on public.mechamind_workspaces;
create policy "Users can read their own MechaMind workspace"
  on public.mechamind_workspaces for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own MechaMind workspace" on public.mechamind_workspaces;
create policy "Users can create their own MechaMind workspace"
  on public.mechamind_workspaces for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own MechaMind workspace" on public.mechamind_workspaces;
create policy "Users can update their own MechaMind workspace"
  on public.mechamind_workspaces for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own MechaMind workspace" on public.mechamind_workspaces;
create policy "Users can delete their own MechaMind workspace"
  on public.mechamind_workspaces for delete to authenticated
  using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit)
values ('mechamind-files', 'mechamind-files', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = 26214400;

drop policy if exists "Users can read their own MechaMind files" on storage.objects;
create policy "Users can read their own MechaMind files"
  on storage.objects for select to authenticated
  using (bucket_id = 'mechamind-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can upload their own MechaMind files" on storage.objects;
create policy "Users can upload their own MechaMind files"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'mechamind-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can update their own MechaMind files" on storage.objects;
create policy "Users can update their own MechaMind files"
  on storage.objects for update to authenticated
  using (bucket_id = 'mechamind-files' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'mechamind-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can delete their own MechaMind files" on storage.objects;
create policy "Users can delete their own MechaMind files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'mechamind-files' and (storage.foldername(name))[1] = auth.uid()::text);
