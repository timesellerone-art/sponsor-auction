-- 크리에이터 평판 점수와 유튜브 채널 지표를 1:1로 보관합니다.

create table if not exists public.creator_metrics (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  rating numeric(3, 2) not null default 0
    constraint creator_metrics_rating_range check (rating >= 0 and rating <= 5),
  completion_rate numeric(5, 2) not null default 0
    constraint creator_metrics_completion_range check (completion_rate >= 0 and completion_rate <= 100),
  penalty_count integer not null default 0
    constraint creator_metrics_penalty_nonneg check (penalty_count >= 0),
  youtube_verified boolean not null default false,
  youtube_channel_id text,
  youtube_channel_url text,
  youtube_channel_title text,
  youtube_subscriber_count bigint not null default 0
    constraint creator_metrics_subscribers_nonneg check (youtube_subscriber_count >= 0),
  youtube_video_count integer not null default 0
    constraint creator_metrics_videos_nonneg check (youtube_video_count >= 0),
  youtube_view_count bigint not null default 0
    constraint creator_metrics_views_nonneg check (youtube_view_count >= 0),
  youtube_metrics_synced_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists creator_metrics_rating_idx
  on public.creator_metrics (rating desc);

alter table public.creator_metrics enable row level security;

drop policy if exists "creator_metrics_select_own" on public.creator_metrics;
create policy "creator_metrics_select_own"
on public.creator_metrics for select
to authenticated
using (auth.uid() = profile_id or public.is_admin());

drop policy if exists "creator_metrics_insert_own" on public.creator_metrics;
create policy "creator_metrics_insert_own"
on public.creator_metrics for insert
to authenticated
with check (auth.uid() = profile_id or public.is_admin());

drop policy if exists "creator_metrics_update_own" on public.creator_metrics;
create policy "creator_metrics_update_own"
on public.creator_metrics for update
to authenticated
using (auth.uid() = profile_id or public.is_admin())
with check (auth.uid() = profile_id or public.is_admin());

grant select, insert, update on public.creator_metrics to authenticated;
grant select, insert, update, delete on public.creator_metrics to service_role;
