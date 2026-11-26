-- 국세청 진위확인(validate)용 대표자 성명·개업일자. 상태조회(status) 컬럼과 별개입니다.

alter table if exists public.profiles
  add column if not exists business_representative_name text not null default '';
alter table if exists public.profiles
  add column if not exists business_opened_on text not null default '';
