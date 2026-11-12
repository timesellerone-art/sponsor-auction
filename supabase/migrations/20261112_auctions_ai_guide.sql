alter table if exists public.auctions
  add column if not exists ai_guide jsonb;

comment on column public.auctions.ai_guide is
  'Gemini 캠페인 가이드 캐시. {fingerprint, concepts, expectedEffect}';
