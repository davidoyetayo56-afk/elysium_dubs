-- ELYSIUM Dubs Hub: baseline schema. Apply with `supabase db push` after reviewing.
create extension if not exists pgcrypto;

create type public.resource_status as enum ('draft', 'published', 'archived');
create type public.transaction_status as enum ('pending', 'success', 'failed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Learner' check (char_length(display_name) between 1 and 60),
  avatar_url text,
  role text not null default 'learner' check (role in ('learner','moderator','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 3 and 160),
  subject text not null check (char_length(subject) between 2 and 60),
  resource_type text not null check (char_length(resource_type) between 2 and 60),
  level text not null default 'All levels' check (char_length(level) <= 80),
  description text not null check (char_length(description) between 10 and 1800),
  price_kobo integer not null default 0 check (price_kobo >= 0),
  file_path text,
  cover_path text,
  accent text not null default 'violet' check (accent in ('violet','blue','green','orange','pink','teal')),
  symbol text not null default '✦' check (char_length(symbol) <= 8),
  status public.resource_status not null default 'draft',
  featured boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint published_resource_has_file check (status <> 'published' or price_kobo = 0 or file_path is not null)
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null check (char_length(subject) between 2 and 60),
  title text not null check (char_length(title) between 5 and 120),
  body text not null check (char_length(body) between 10 and 5000),
  status text not null default 'published' check (status in ('published','hidden','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.post_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  status text not null default 'published' check (status in ('published','hidden','removed')),
  created_at timestamptz not null default now()
);

create table public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.bookmarks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  resource_id uuid not null references public.resources(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, resource_id)
);

create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  resource_id uuid not null references public.resources(id) on delete restrict,
  reference text unique not null,
  amount_kobo integer not null check (amount_kobo > 0),
  currency text not null default 'NGN' check (currency = 'NGN'),
  status public.transaction_status not null default 'pending',
  paystack_transaction_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.purchases (
  user_id uuid not null references public.profiles(id) on delete cascade,
  resource_id uuid not null references public.resources(id) on delete restrict,
  transaction_id uuid not null unique references public.payment_transactions(id) on delete restrict,
  purchased_at timestamptz not null default now(),
  primary key (user_id, resource_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  reply_id uuid references public.post_replies(id) on delete cascade,
  reason text not null check (char_length(reason) between 5 and 500),
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now(),
  constraint report_has_target check (post_id is not null or reply_id is not null)
);

create index resources_public_order on public.resources(status, featured desc, published_at desc);
create index posts_feed_order on public.posts(status, created_at desc);
create index replies_post_order on public.post_replies(post_id, created_at asc);
create index transactions_user_order on public.payment_transactions(user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger resources_updated_at before update on public.resources for each row execute function public.set_updated_at();
create trigger posts_updated_at before update on public.posts for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(coalesce(new.email, 'learner'), '@', 1)))
  on conflict (id) do nothing;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role in ('admin','moderator'));
$$;

alter table public.profiles enable row level security;
alter table public.resources enable row level security;
alter table public.posts enable row level security;
alter table public.post_replies enable row level security;
alter table public.post_likes enable row level security;
alter table public.bookmarks enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.purchases enable row level security;
alter table public.reports enable row level security;

create policy "public profile labels are visible" on public.profiles for select to anon, authenticated using (true);
-- Profile updates are intentionally disabled in the client until a controlled profile-edit workflow exists. Roles cannot be self-assigned.
create policy "published resources are public" on public.resources for select to anon, authenticated using (status = 'published' or (auth.uid() is not null and created_by = auth.uid()) or public.is_staff());
create policy "staff manage resources" on public.resources for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "published posts are visible" on public.posts for select to anon, authenticated using (status = 'published' or author_id = auth.uid() or public.is_staff());
create policy "signed-in members create own posts" on public.posts for insert to authenticated with check (author_id = auth.uid());
create policy "authors or staff edit posts" on public.posts for update to authenticated using (author_id = auth.uid() or public.is_staff()) with check (author_id = auth.uid() or public.is_staff());
create policy "authors or staff remove posts" on public.posts for delete to authenticated using (author_id = auth.uid() or public.is_staff());
create policy "published replies are visible" on public.post_replies for select to anon, authenticated using (status = 'published' or author_id = auth.uid() or public.is_staff());
create policy "signed-in members create replies" on public.post_replies for insert to authenticated with check (author_id = auth.uid());
create policy "authors or staff edit replies" on public.post_replies for update to authenticated using (author_id = auth.uid() or public.is_staff()) with check (author_id = auth.uid() or public.is_staff());
create policy "authors or staff delete replies" on public.post_replies for delete to authenticated using (author_id = auth.uid() or public.is_staff());
create policy "likes are visible" on public.post_likes for select to anon, authenticated using (true);
create policy "members like as themselves" on public.post_likes for insert to authenticated with check (user_id = auth.uid());
create policy "members unlike as themselves" on public.post_likes for delete to authenticated using (user_id = auth.uid());
create policy "members view own bookmarks" on public.bookmarks for select to authenticated using (user_id = auth.uid());
create policy "members create own bookmarks" on public.bookmarks for insert to authenticated with check (user_id = auth.uid());
create policy "members delete own bookmarks" on public.bookmarks for delete to authenticated using (user_id = auth.uid());
create policy "members view own transactions" on public.payment_transactions for select to authenticated using (user_id = auth.uid());
create policy "members view own purchases" on public.purchases for select to authenticated using (user_id = auth.uid());
create policy "members submit reports" on public.reports for insert to authenticated with check (reporter_id = auth.uid());
create policy "reporters and staff view reports" on public.reports for select to authenticated using (reporter_id = auth.uid() or public.is_staff());
create policy "staff update reports" on public.reports for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- Private storage. Upload resources through an admin workflow; do not expose the bucket publicly.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resource-files', 'resource-files', false, 52428800, array['application/pdf','application/epub+zip','application/zip'])
on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resource-covers', 'resource-covers', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy "staff manage private resource files" on storage.objects for all to authenticated using (bucket_id = 'resource-files' and public.is_staff()) with check (bucket_id = 'resource-files' and public.is_staff());
create policy "public can view resource covers" on storage.objects for select to anon, authenticated using (bucket_id = 'resource-covers');
create policy "staff manage resource covers" on storage.objects for all to authenticated using (bucket_id = 'resource-covers' and public.is_staff()) with check (bucket_id = 'resource-covers' and public.is_staff());
