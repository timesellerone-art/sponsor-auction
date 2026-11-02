-- 구글·카카오·네이버·전화를 auth.identities에 붙여 한 UID로 묶는다.

create or replace function public.link_provider_identity(
  p_user_id uuid,
  p_provider text,
  p_provider_id text,
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
  v_provider text;
  v_iss text;
begin
  v_provider := lower(trim(coalesce(p_provider, '')));
  if v_provider = 'custom:naver' then
    v_provider := 'naver';
  end if;
  if p_user_id is null
    or coalesce(trim(p_provider_id), '') = ''
    or v_provider not in ('google', 'kakao', 'naver', 'phone') then
    return null;
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'link target % not found', p_user_id;
  end if;

  v_iss := case v_provider
    when 'google' then 'https://accounts.google.com'
    when 'kakao' then 'https://kauth.kakao.com'
    when 'naver' then 'https://nid.naver.com'
    else null
  end;

  v_data := jsonb_strip_nulls(
    jsonb_build_object(
      'sub', trim(p_provider_id),
      'iss', v_iss,
      'provider', v_provider,
      'email', nullif(lower(trim(coalesce(p_email, ''))), ''),
      'name', nullif(trim(coalesce(p_name, '')), ''),
      'email_verified', true,
      'phone', case when v_provider = 'phone' then trim(p_provider_id) else null end,
      'phone_verified', case when v_provider = 'phone' then true else null end
    )
  );

  update auth.identities
     set user_id = p_user_id,
         identity_data = coalesce(identity_data, '{}'::jsonb) || v_data,
         last_sign_in_at = now(),
         updated_at = now()
   where provider = v_provider
     and (
       provider_id = trim(p_provider_id)
       or identity_data ->> 'sub' = trim(p_provider_id)
     )
  returning id into v_id;

  if v_id is not null then
    return v_id;
  end if;

  begin
    insert into auth.identities (
      user_id,
      provider,
      provider_id,
      identity_data,
      last_sign_in_at,
      created_at,
      updated_at
    )
    values (
      p_user_id,
      v_provider,
      trim(p_provider_id),
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
       where provider = v_provider
         and (
           provider_id = trim(p_provider_id)
           or identity_data ->> 'sub' = trim(p_provider_id)
         )
      returning id into v_id;
      return v_id;
  end;
end;
$$;

revoke all on function public.link_provider_identity(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.link_provider_identity(uuid, text, text, text, text) to service_role;

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
begin
  return public.link_provider_identity(p_user_id, 'naver', p_naver_id, p_email, p_name);
end;
$$;

notify pgrst, 'reload schema';
