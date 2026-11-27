alter table if exists public.profiles
  add column if not exists business_company_name text not null default '';
alter table if exists public.profiles
  add column if not exists business_address text not null default '';
alter table if exists public.profiles
  add column if not exists business_contact text not null default '';

comment on column public.profiles.business_company_name is
  '사업자등록증 상호명';
comment on column public.profiles.business_address is
  '사업장 상세 주소(동·호수 포함)';
comment on column public.profiles.business_contact is
  '사업자 연락처(유선·대표번호·080·휴대폰)';
