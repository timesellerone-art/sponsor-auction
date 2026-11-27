alter table if exists public.profiles
  add column if not exists business_certificate_path text not null default '';
alter table if exists public.profiles
  add column if not exists business_certificate_name text not null default '';

comment on column public.profiles.business_certificate_path is
  '비공개 버킷 business-certificates 객체 경로';
comment on column public.profiles.business_certificate_name is
  '사업자등록증 원본 파일명';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'business-certificates',
  'business-certificates',
  false,
  10485760,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
