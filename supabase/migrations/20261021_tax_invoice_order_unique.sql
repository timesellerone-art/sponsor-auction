-- 운영 DB에 tax_invoice_logs만 있고 payment_order_id가 없는 경우를 맞춤.
-- 컬럼을 먼저 추가한 뒤, 비어 있지 않은 주문 ID에만 유니크 인덱스를 겁니다.

create table if not exists public.tax_invoice_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.tax_invoice_logs add column if not exists payout_id text;
alter table public.tax_invoice_logs add column if not exists payment_order_id text;
alter table public.tax_invoice_logs add column if not exists auction_id text;
alter table public.tax_invoice_logs add column if not exists bid_id text;
alter table public.tax_invoice_logs add column if not exists supply_amount integer not null default 0;
alter table public.tax_invoice_logs add column if not exists vat_amount integer not null default 0;
alter table public.tax_invoice_logs add column if not exists withholding_amount integer not null default 0;
alter table public.tax_invoice_logs add column if not exists net_payout integer not null default 0;
alter table public.tax_invoice_logs add column if not exists status text not null default 'fallback';
alter table public.tax_invoice_logs add column if not exists provider text not null default 'popbill';
alter table public.tax_invoice_logs add column if not exists mgt_key text;
alter table public.tax_invoice_logs add column if not exists payload jsonb;
alter table public.tax_invoice_logs add column if not exists created_at timestamptz not null default timezone('utc', now());

-- 동일 주문 ID가 이미 있으면 ctid가 더 작은(먼저 생긴) 행만 남깁니다.
delete from public.tax_invoice_logs as extra
using public.tax_invoice_logs as keep
where keep.payment_order_id is not null
  and btrim(keep.payment_order_id) <> ''
  and extra.payment_order_id is not null
  and btrim(extra.payment_order_id) <> ''
  and keep.payment_order_id = extra.payment_order_id
  and extra.ctid > keep.ctid;

create unique index if not exists tax_invoice_logs_payment_order_uidx
  on public.tax_invoice_logs (payment_order_id)
  where payment_order_id is not null and btrim(payment_order_id) <> '';
