-- 이메일이 달라도 010 / +82 / 82 휴대전화가 같으면 한 계정으로 찾는다.
-- 이미 같은 provider identity가 있으면 소스 행을 지우고 나머지만 옮긴다.

create or replace function public.normalize_kr_phone(p_phone text)
returns text
language sql
immutable
as $$
  with digits as (
    select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') as value
  )
  select case
    when char_length(value) < 10 then ''
    when value like '82%' and char_length(value) >= 11 then '0' || substr(value, 3)
    when value like '10%' and char_length(value) = 10 then '0' || value
    else value
  end
  from digits;
$$;

revoke all on function public.normalize_kr_phone(text) from public, anon, authenticated;
grant execute on function public.normalize_kr_phone(text) to service_role;

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
  wanted_phone as (
    select public.normalize_kr_phone(p_phone) as phone
  )
  select distinct u.id
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join wanted_phone wp on true
  where
    exists (
      select 1
      from wanted w
      where
        lower(coalesce(u.email, '')) = w.email
        or lower(coalesce(u.raw_app_meta_data ->> 'contact_email', '')) = w.email
        or lower(coalesce(u.raw_user_meta_data ->> 'email', '')) = w.email
        or lower(coalesce(p.email, '')) = w.email
    )
    or (
      wp.phone <> ''
      and (
        public.normalize_kr_phone(u.phone) = wp.phone
        or public.normalize_kr_phone(u.raw_app_meta_data ->> 'contact_phone') = wp.phone
        or public.normalize_kr_phone(u.raw_user_meta_data ->> 'phone') = wp.phone
        or public.normalize_kr_phone(p.phone) = wp.phone
        or exists (
          select 1
          from auth.identities i
          where i.user_id = u.id
            and i.provider = 'phone'
            and (
              public.normalize_kr_phone(i.provider_id) = wp.phone
              or public.normalize_kr_phone(i.identity_data ->> 'phone') = wp.phone
              or public.normalize_kr_phone(i.identity_data ->> 'sub') = wp.phone
            )
        )
      )
    )
    or (
      coalesce(p_naver_id, '') <> ''
      and (
        coalesce(u.raw_app_meta_data -> 'naver_ids', '[]'::jsonb) ? p_naver_id
        or coalesce(u.raw_user_meta_data ->> 'naver_id', '') = p_naver_id
        or exists (
          select 1
          from auth.identities i
          where i.user_id = u.id
            and i.provider in ('naver', 'custom:naver')
            and (
              i.provider_id = p_naver_id
              or i.identity_data ->> 'sub' = p_naver_id
            )
        )
      )
    );
$$;

create or replace function public.merge_auth_identities(p_from uuid, p_to uuid)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_moved integer;
begin
  if p_from is null or p_to is null or p_from = p_to then
    return 0;
  end if;
  if not exists (select 1 from auth.users where id = p_to) then
    raise exception 'merge target % not found', p_to;
  end if;

  -- 대상에 이미 같은 provider가 있으면 소스 identity는 버린다(phone 중복 포함).
  delete from auth.identities src
   using auth.identities dst
   where src.user_id = p_from
     and dst.user_id = p_to
     and src.provider = dst.provider
     and (
       src.provider = 'email'
       or src.provider = 'phone'
       or src.identity_data ->> 'sub' is not distinct from dst.identity_data ->> 'sub'
       or src.provider_id is not distinct from dst.provider_id
     );

  update auth.identities src
     set user_id = p_to,
         updated_at = now()
   where src.user_id = p_from
     and src.provider <> 'email'
     and not exists (
       select 1
       from auth.identities dst
       where dst.user_id = p_to
         and dst.provider = src.provider
     );
  get diagnostics v_moved = row_count;

  delete from auth.identities
   where user_id = p_from
     and provider <> 'email';

  return v_moved;
end;
$$;

notify pgrst, 'reload schema';
