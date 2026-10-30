-- 네이버/소셜 계정 병합 시 auth.users 전체 스캔(listUsers) 대신 연락처·네이버 id로 바로 찾는다.

create or replace function public.find_auth_user_ids_by_contact(
  p_emails text[] default '{}'::text[],
  p_phone text default null,
  p_naver_id text default null
)
returns table(id uuid)
language sql
stable
security definer
set search_path = auth, public
as $$
  with wanted as (
    select lower(trim(e)) as email
    from unnest(coalesce(p_emails, '{}'::text[])) as e
    where trim(e) <> '' and position('@' in e) > 0
  ),
  digits as (
    select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') as phone
  )
  select distinct u.id
  from auth.users u
  left join digits d on true
  where
    exists (
      select 1
      from wanted w
      where
        lower(coalesce(u.email, '')) = w.email
        or lower(coalesce(u.raw_app_meta_data ->> 'contact_email', '')) = w.email
        or lower(coalesce(u.raw_user_meta_data ->> 'email', '')) = w.email
    )
    or (
      d.phone is not null
      and char_length(d.phone) >= 10
      and (
        regexp_replace(coalesce(u.phone, ''), '\D', '', 'g') = d.phone
        or regexp_replace(coalesce(u.raw_app_meta_data ->> 'contact_phone', ''), '\D', '', 'g') = d.phone
        or regexp_replace(coalesce(u.raw_user_meta_data ->> 'phone', ''), '\D', '', 'g') = d.phone
      )
    )
    or (
      coalesce(p_naver_id, '') <> ''
      and (
        coalesce(u.raw_app_meta_data -> 'naver_ids', '[]'::jsonb) ? p_naver_id
        or coalesce(u.raw_user_meta_data ->> 'naver_id', '') = p_naver_id
      )
    );
$$;

revoke all on function public.find_auth_user_ids_by_contact(text[], text, text) from public;
grant execute on function public.find_auth_user_ids_by_contact(text[], text, text) to service_role;
