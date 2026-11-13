-- 소셜 로그인 콜백에서 이메일 단건 조회가 인덱스만 타도록 한다.
create index if not exists profiles_email_idx on public.profiles (email);
