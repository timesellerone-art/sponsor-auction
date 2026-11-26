'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageContainer } from '@/components/PageContainer';
import { TimeslotCard, TimeslotCardSkeleton } from '@/components/TimeslotCard';
import { partitionTimeSlots } from '@/lib/timeslots';
import type { TimeSlotItem } from '@/types/timeslot';

export function TimeslotMarketplace() {
  const [slots, setSlots] = useState<TimeSlotItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async (silent = false) => {
      if (!silent) {
        setLoading(true);
      }
      try {
        const response = await fetch('/api/timeslots', { cache: 'no-store' });
        const payload = (await response.json().catch(() => null)) as {
          data?: TimeSlotItem[];
          error?: string;
          errorMessage?: string;
        } | null;
        if (cancelled) {
          return;
        }
        const rows = Array.isArray(payload?.data) ? payload.data : [];
        setSlots(rows);
        setError(
          response.ok
            ? null
            : payload?.errorMessage || payload?.error || '크리에이터 상품을 불러오지 못했습니다.',
        );
      } catch {
        if (!cancelled) {
          setSlots([]);
          setError('크리에이터 상품을 불러오지 못했습니다.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    const onChanged = () => {
      void load(true);
    };
    window.addEventListener('timeslots:changed', onChanged);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener('timeslots:changed', onChanged);
    };
  }, []);

  const { open, closed } = useMemo(() => partitionTimeSlots(slots), [slots]);

  return (
    <PageContainer className="flex min-w-0 flex-1 flex-col py-8 sm:py-12">
      <p className="text-sm font-semibold tracking-wide text-clink-accent">크리에이터 상품</p>
      <h1 className="mt-1 text-2xl font-bold tracking-[-0.03em] leading-[1.15] text-zinc-950 sm:text-3xl">
        크리에이터 상품 마켓플레이스
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-zinc-500">
        크리에이터가 등록한 예상 조회수·시작가 광고 상품에 광고주가 콘텐츠를 제안합니다. 마감 전 최고가가 실시간으로
        갱신됩니다.
      </p>

      {loading ? (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <TimeslotCardSkeleton key={index} />
          ))}
        </div>
      ) : slots.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
          <p className="text-base font-medium text-zinc-800">
            {error || '등록된 크리에이터 상품이 없습니다'}
          </p>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-10">
          <section>
            <h2 className="text-lg font-bold text-zinc-950">제안 가능</h2>
            {open.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-500">지금 제안 가능한 상품이 없습니다.</p>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {open.map((slot) => (
                  <TimeslotCard key={slot.id} slot={slot} />
                ))}
              </div>
            )}
          </section>
          {closed.length > 0 ? (
            <section>
              <h2 className="text-lg font-bold text-zinc-950">마감·낙찰</h2>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {closed.map((slot) => (
                  <TimeslotCard key={slot.id} slot={slot} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </PageContainer>
  );
}
