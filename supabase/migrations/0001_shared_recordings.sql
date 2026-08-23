-- Shared family audio recordings for the Amharic Fidel app.
--
-- One row per (fam, ord) letter that has a family recording. The actual
-- audio bytes live in the "recordings" storage bucket; this table is just
-- the index the client reads to know what exists and where.
--
-- Reads are public (anyone with the app URL can listen). Writes are NOT
-- exposed to the client at all — only the shared-audio Edge Function,
-- running with the service role key, can insert/update/delete. The
-- function itself gates writes behind a family passcode (see
-- supabase/functions/shared-audio/index.ts). This is what keeps the
-- endpoint from being an open write target once the app is on the public
-- internet instead of behind Claude.ai's login.

create table if not exists public.shared_recordings (
  fam smallint not null,
  ord smallint not null,
  storage_path text not null,
  updated_at timestamptz not null default now(),
  primary key (fam, ord)
);

alter table public.shared_recordings enable row level security;

-- Public read: the app lists/plays shared recordings without any login.
create policy "shared_recordings_public_read"
  on public.shared_recordings
  for select
  to anon, authenticated
  using (true);

-- Deliberately no insert/update/delete policy for anon/authenticated.
-- The only writer is the Edge Function, which uses the service role key
-- (set as a Supabase secret, never shipped to the client) and therefore
-- bypasses RLS entirely. That's the enforcement point for the passcode.

-- Storage bucket for the audio blobs themselves.
insert into storage.buckets (id, name, public)
values ('recordings', 'recordings', true)
on conflict (id) do nothing;

-- Public read of the recordings bucket (same rationale as the table).
create policy "recordings_public_read"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'recordings');

-- No insert/update/delete storage policy for anon/authenticated either —
-- same reasoning: only the service-role Edge Function can write objects.
