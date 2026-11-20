-- 제안 정산 계좌와 지급 예정일을 정산 대기까지 남깁니다.

alter table if exists public.bids
  add column if not exists bank_name text not null default '';
alter table if exists public.bids
  add column if not exists account_number text not null default '';
alter table if exists public.bids
  add column if not exists account_holder text not null default '';

alter table if exists public.payouts
  add column if not exists bank_name text not null default '';
alter table if exists public.payouts
  add column if not exists account_number text not null default '';
alter table if exists public.payouts
  add column if not exists account_holder text not null default '';
alter table if exists public.payouts
  add column if not exists settlement_due_at timestamptz;
