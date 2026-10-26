-- 역경매 상세/제안 모달이 로그인 사용자에게도 항상 조회되도록 SELECT 정책을 재적용합니다.
drop policy if exists "auctions_select_public" on public.auctions;
create policy "auctions_select_public"
on public.auctions for select
to anon, authenticated
using (true);

grant select on public.auctions to anon, authenticated;
