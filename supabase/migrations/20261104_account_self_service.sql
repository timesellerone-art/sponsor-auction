-- 로그인 유저가 소셜 연동을 해제하고, 회원 탈퇴 시 관련 데이터를 완전히 지운다.

create or replace function public.unlink_provider_identity(
  p_user_id uuid,
  p_provider text
)
returns boolean
language plpgsql
security definer
set search_path = auth, public
as $$
declare
  v_provider text;
begin
  v_provider := lower(trim(coalesce(p_provider, '')));
  if v_provider = 'custom:naver' then
    v_provider := 'naver';
  end if;
  if p_user_id is null or v_provider not in ('google', 'kakao', 'naver', 'phone') then
    return false;
  end if;
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'cannot unlink another user';
  end if;

  delete from auth.identities
   where user_id = p_user_id
     and (
       provider = v_provider
       or (v_provider = 'naver' and provider = 'custom:naver')
     );

  if v_provider = 'phone' then
    update auth.users
       set phone = null,
           phone_confirmed_at = null,
           updated_at = now()
     where id = p_user_id;
  end if;

  return true;
end;
$$;

create or replace function public.delete_own_account(p_user_id uuid default null)
returns void
language plpgsql
security definer
set search_path = auth, public
as $$
declare
  v_id uuid;
begin
  v_id := coalesce(p_user_id, auth.uid());
  if v_id is null then
    raise exception 'not authenticated';
  end if;
  if auth.uid() is not null and auth.uid() <> v_id then
    raise exception 'cannot delete another user';
  end if;

  delete from public.creator_metrics where profile_id = v_id;
  delete from public.chat_messages where sender_id = v_id;
  delete from public.time_slot_bids where advertiser_id = v_id;
  delete from public.time_slots where creator_id = v_id;
  update public.payouts set creator_id = null where creator_id = v_id;
  update public.bids set creator_id = null where creator_id = v_id;
  update public.auctions set author_id = null where author_id = v_id;
  delete from public.compliance_logs where actor_id = v_id;
  delete from public.profiles where id = v_id;
  delete from auth.identities where user_id = v_id;
  delete from auth.users where id = v_id;
end;
$$;

revoke all on function public.unlink_provider_identity(uuid, text) from public, anon;
revoke all on function public.delete_own_account(uuid) from public, anon;
grant execute on function public.unlink_provider_identity(uuid, text) to authenticated, service_role;
grant execute on function public.delete_own_account(uuid) to authenticated, service_role;
