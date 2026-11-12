alter table if exists public.auctions
  add column if not exists image_url text;

alter table if exists public.auctions
  add column if not exists thumbnail_url text;

comment on column public.auctions.image_url is
  '광고주가 업로드한 캠페인 대표 사진 public URL';
comment on column public.auctions.thumbnail_url is
  'image_url과 동일한 대표 사진 URL(호환용)';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'campaign-covers',
  'campaign-covers',
  true,
  5242880,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists "campaign_covers_public_read" on storage.objects;
create policy "campaign_covers_public_read"
  on storage.objects
  for select
  using (bucket_id = 'campaign-covers');

drop policy if exists "campaign_covers_auth_insert" on storage.objects;
create policy "campaign_covers_auth_insert"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'campaign-covers');
