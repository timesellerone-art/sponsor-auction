-- AI 상담 위젯의 1:1 문의 접수. 누구나 insert, 관리자만 select.

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  name text not null,
  email text not null,
  category text not null check (category in ('payment', 'auction', 'account', 'other')),
  message text not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default timezone('utc', now()),
  constraint support_tickets_name_not_empty check (char_length(trim(name)) > 0),
  constraint support_tickets_message_not_empty check (char_length(trim(message)) >= 8)
);

create index if not exists support_tickets_created_idx
  on public.support_tickets (created_at desc);

alter table public.support_tickets enable row level security;

drop policy if exists "support_tickets_insert_anyone" on public.support_tickets;
create policy "support_tickets_insert_anyone"
on public.support_tickets for insert
to anon, authenticated
with check (true);

drop policy if exists "support_tickets_select_admin" on public.support_tickets;
create policy "support_tickets_select_admin"
on public.support_tickets for select
to authenticated
using (public.is_admin());

grant insert on public.support_tickets to anon, authenticated;
grant select on public.support_tickets to authenticated;
grant select, insert, update, delete on public.support_tickets to service_role;
