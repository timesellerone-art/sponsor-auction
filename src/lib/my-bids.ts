const STORAGE_KEY = 'sponsor-auction-my-bids';

function asIdList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is string => typeof item === 'string' && item.trim().length > 0,
  );
}

export function getMyBidIds(): string[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    return asIdList(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

export function rememberMyBid(id: string) {
  if (typeof window === 'undefined' || !id.trim()) {
    return;
  }
  try {
    const next = Array.from(new Set([id.trim(), ...getMyBidIds()]));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 저장에 실패해도 제안 자체는 이미 등록된 상태입니다.
  }
}
