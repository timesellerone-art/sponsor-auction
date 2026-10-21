-- 직거래·우회 키워드 모니터링 로그

create table if not exists public.compliance_logs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  keywords text[] not null default '{}'::text[],
  snippet text not null default '',
  blocked boolean not null default false,
  actor_id uuid,
  auction_id text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists compliance_logs_created_idx
  on public.compliance_logs (created_at desc);

alter table public.compliance_logs enable row level security;

drop policy if exists "compliance_logs_admin_select" on public.compliance_logs;
create policy "compliance_logs_admin_select"
on public.compliance_logs for select
to authenticated
using (public.is_admin());

drop policy if exists "compliance_logs_insert_authenticated" on public.compliance_logs;
create policy "compliance_logs_insert_authenticated"
on public.compliance_logs for insert
to authenticated, service_role
with check (true);

grant select, insert on public.compliance_logs to authenticated;
grant select, insert, update, delete on public.compliance_logs to service_role;
revoke all on public.compliance_logs from anon;
