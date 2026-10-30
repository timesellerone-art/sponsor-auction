-- 테스트/병합 과정에서 남은 고아 프로필과 pending_merge 메타데이터를 정리한다.
delete from public.profiles p
where not exists (select 1 from auth.users u where u.id = p.id);

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'pending_merge'
where raw_app_meta_data ? 'pending_merge';
