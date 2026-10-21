-- 캠페인 채팅 메시지. 연락처·외부 링크는 앱에서 차단한 뒤 저장합니다.

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references public.auctions(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  sender_name text not null default '',
  body text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint chat_messages_body_not_empty check (char_length(trim(body)) > 0)
);

create index if not exists chat_messages_auction_created_idx
  on public.chat_messages (auction_id, created_at);

alter table public.chat_messages enable row level security;

drop policy if exists "chat_messages_select_participants" on public.chat_messages;
create policy "chat_messages_select_participants"
on public.chat_messages for select
to authenticated
using (
  public.is_admin()
  or sender_id = auth.uid()
  or exists (
    select 1
    from public.auctions a
    where a.id = chat_messages.auction_id
      and a.author_id = auth.uid()
  )
  or exists (
    select 1
    from public.bids b
    where b.auction_id = chat_messages.auction_id
      and b.creator_id = auth.uid()
  )
);

drop policy if exists "chat_messages_insert_participants" on public.chat_messages;
create policy "chat_messages_insert_participants"
on public.chat_messages for insert
to authenticated
with check (
  public.is_admin()
  or (
    sender_id = auth.uid()
    and (
      exists (
        select 1
        from public.auctions a
        where a.id = chat_messages.auction_id
          and a.author_id = auth.uid()
      )
      or exists (
        select 1
        from public.bids b
        where b.auction_id = chat_messages.auction_id
          and b.creator_id = auth.uid()
      )
    )
  )
);

grant select, insert on public.chat_messages to authenticated;
grant select, insert, update, delete on public.chat_messages to service_role;
revoke insert, update, delete on public.chat_messages from anon;
