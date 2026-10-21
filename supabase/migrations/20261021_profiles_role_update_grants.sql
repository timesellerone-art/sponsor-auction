-- 로그인 사용자가 온보딩에서 본인 역할을 저장할 수 있게 합니다.
grant select, insert, update on public.profiles to authenticated;
