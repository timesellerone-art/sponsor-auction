-- 크리에이터 기본 정산 계좌와 정산 유형. 입찰/지급 건별 계좌 컬럼과 같은 이름을 씁니다.

alter table if exists public.profiles
  add column if not exists bank_name text not null default '';
alter table if exists public.profiles
  add column if not exists account_number text not null default '';
alter table if exists public.profiles
  add column if not exists account_holder text not null default '';
alter table if exists public.profiles
  add column if not exists settlement_type text not null default 'individual';

alter table public.profiles
  drop constraint if exists profiles_settlement_type_check;
alter table public.profiles
  add constraint profiles_settlement_type_check
  check (settlement_type in ('individual', 'business'));
