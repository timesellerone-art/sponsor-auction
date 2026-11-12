alter table if exists public.auctions
  add column if not exists category text;

comment on column public.auctions.category is
  '공식 콘텐츠 분야: beauty, food, tech, living, pet, fitness, parenting';
