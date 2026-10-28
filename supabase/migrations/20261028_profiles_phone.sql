alter table if exists public.profiles
  add column if not exists phone text;

create unique index if not exists profiles_phone_unique
  on public.profiles (phone)
  where phone is not null and char_length(trim(phone)) > 0;
