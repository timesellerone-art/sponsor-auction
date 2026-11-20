-- 회원 사업자등록번호와 인증 상태. 운영사 고정 정보와는 별개입니다.

alter table if exists public.profiles
  add column if not exists business_registration_number text not null default '';
alter table if exists public.profiles
  add column if not exists business_verification_status text not null default 'unregistered';
alter table if exists public.profiles
  add column if not exists business_status_detail text not null default '';
alter table if exists public.profiles
  add column if not exists business_review_note text not null default '';
alter table if exists public.profiles
  add column if not exists business_checked_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_business_verification_status_check;
alter table public.profiles
  add constraint profiles_business_verification_status_check
  check (
    business_verification_status in (
      'unregistered',
      'verified',
      'closed',
      'review_required',
      'rejected'
    )
  );

alter type public.payout_status add value if not exists 'hold';
