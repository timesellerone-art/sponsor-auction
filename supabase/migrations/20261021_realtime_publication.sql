-- Realtime: 채팅·입찰 INSERT를 클라이언트 구독에 노출합니다.
do $$
declare
  tbl text;
begin
  foreach tbl in array array['chat_messages', 'bids', 'time_slot_bids']
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = tbl
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    end if;
  end loop;
end
$$;
