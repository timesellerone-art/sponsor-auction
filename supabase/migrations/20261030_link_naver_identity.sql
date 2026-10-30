-- 커스텀 네이버 OAuth를 auth.identities(provider=naver)에 붙이고,
-- 연락처 조회가 identities.sub 도 보도록 한다.

create or replace function public.link_naver_identity(
  p_user_id uuid,
  p_naver_id text,
  p_email text default null,
  p_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = auth, public
as $$
declare
  v_id uuid;
  v_data jsonb;
begin
  if p_user_id is null or coalesce(trim(p_naver_id), '') = '' then
    return null;
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'link target % not found', p_user_id;
  end if;

  v_data := jsonb_strip_nulls(
    jsonb_build_object(
      'sub', trim(p_naver_id),
      'iss', 'https://nid.naver.com',
      'provider', 'naver',
      'email', nullif(lower(trim(coalesce(p_email, ''))), ''),
      'name', nullif(trim(coalesce(p_name, '')), ''),
      'email_verified', true
    )
  );

  update auth.identities
     set user_id = p_user_id,
         identity_data = coalesce(identity_data, '{}'::jsonb) || v_data,
         last_sign_in_at = now(),
         updated_at = now()
   where provider = 'naver'
     and identity_data ->> 'sub' = trim(p_naver_id)
  returning id into v_id;

  if v_id is not null then
    return v_id;
  end if;

  begin
    insert into auth.identities (
      id,
      user_id,
      identity_id,
      provider,
      provider_id,
      identity_data,
      last_sign_in_at,
      created_at,
      updated_at
    )
    values (
      gen_random_uuid(),
      p_user_id,
      gen_random_uuid(),
      'naver',
      trim(p_naver_id),
      v_data,
      now(),
      now(),
      now()
    )
    returning id into v_id;
    return v_id;
  exception
    when unique_violation then
      update auth.identities
         set user_id = p_user_id,
             identity_data = coalesce(identity_data, '{}'::jsonb) || v_data,
             last_sign_in_at = now(),
             updated_at = now()
       where provider = 'naver'
         and (
           provider_id = trim(p_naver_id)
           or identity_data ->> 'sub' = trim(p_naver_id)
         )
      returning id into v_id;
      return v_id;
    when undefined_column then
      insert into auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        last_sign_in_at,
        created_at,
        updated_at
      )
      values (
        trim(p_naver_id),
        p_user_id,
        v_data,
        'naver',
        now(),
        now(),
        now()
      );
      return null;
  end;
end;
$$;

revoke all on function public.link_naver_identity(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.link_naver_identity(uuid, text, text, text) to service_role;

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
        or exists (
          select 1
          from auth.identities i
          where i.user_id = u.id
            and i.provider = 'naver'
            and i.identity_data ->> 'sub' = p_naver_id
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

  delete from auth.identities src
   using auth.identities dst
   where src.user_id = p_from
     and dst.user_id = p_to
     and src.provider = dst.provider
     and src.identity_data ->> 'sub' is not distinct from dst.identity_data ->> 'sub';

  update auth.identities
     set user_id = p_to,
         updated_at = now()
   where user_id = p_from
     and provider <> 'email';
  get diagnostics v_moved = row_count;
  return v_moved;
end;
$$;

notify pgrst, 'reload schema';
