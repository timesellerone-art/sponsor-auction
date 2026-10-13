const STORAGE_KEY = 'sponsor-auction-mine';
const DEMO_CAMPAIGN_IDS = ['auc-001', 'auc-002'];

function asIdList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is string => typeof item === 'string' && item.trim().length > 0,
  );
}

export function getMyAuctionIds(): string[] {
  if (typeof window === 'undefined') {
    return [...DEMO_CAMPAIGN_IDS];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [...DEMO_CAMPAIGN_IDS];
    }

    const ids = asIdList(JSON.parse(raw) as unknown);
    return ids.length > 0 ? ids : [...DEMO_CAMPAIGN_IDS];
  } catch {
    return [...DEMO_CAMPAIGN_IDS];
  }
}

export function isMyAuction(id: string) {
  if (!id.trim()) {
    return false;
  }

  return getMyAuctionIds().includes(id.trim());
}

export function rememberMyAuction(id: string) {
  if (typeof window === 'undefined' || !id.trim()) {
    return;
  }

  try {
    const next = Array.from(new Set([id.trim(), ...getMyAuctionIds()]));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage를 쓸 수 없어도 상세 페이지에서 낙찰은 가능합니다.
  }
}
