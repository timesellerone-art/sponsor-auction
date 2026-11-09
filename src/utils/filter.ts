import {
  BYPASS_BLOCK_MESSAGE,
  findBypassHits,
  validateBypassContent,
  type BypassHit,
  type BypassHitKind,
} from '@/lib/moderation/bypassFilter';

export const BLOCKED_CONTACT_PLACEHOLDER = '[연락처/링크가 차단되었습니다]';

export const OFF_PLATFORM_BLOCK_MESSAGE = BYPASS_BLOCK_MESSAGE;

export type OffPlatformKind = BypassHitKind;

export const BYPASS_MONITOR_KEYWORDS = [
  '카톡',
  '카카오톡',
  '직거래',
  '텔레그램',
  'telegram',
  '계좌번호',
  '전화번호',
] as const;

export type OffPlatformHit = BypassHit;

export class OffPlatformContactError extends Error {
  readonly hits: OffPlatformHit[];

  constructor(hits: OffPlatformHit[], message = OFF_PLATFORM_BLOCK_MESSAGE) {
    super(message);
    this.name = 'OffPlatformContactError';
    this.hits = hits;
  }
}

export { validateBypassContent, findBypassHits };

export function findBypassKeywords(text: string | null | undefined): string[] {
  const source = text ?? '';
  if (!source.trim()) {
    return [];
  }
  return BYPASS_MONITOR_KEYWORDS.filter((keyword) => {
    if (/^[a-z]+$/i.test(keyword)) {
      return new RegExp(`\\b${keyword}\\b`, 'i').test(source);
    }
    return source.includes(keyword);
  });
}

export function findOffPlatformHits(text: string | null | undefined): OffPlatformHit[] {
  return findBypassHits(text);
}

export function hasOffPlatformContact(text: string | null | undefined): boolean {
  return !validateBypassContent(text ?? '').isValid;
}

export function maskOffPlatformContact(text: string | null | undefined): string {
  const source = text ?? '';
  if (!source) {
    return '';
  }

  const hits = findBypassHits(source);
  if (hits.length === 0) {
    return source;
  }

  return hits
    .slice()
    .sort((left, right) => right.index - left.index)
    .reduce((current, hit) => {
      if (!hit.value || hit.index < 0 || hit.index >= current.length) {
        return current;
      }
      return (
        current.slice(0, hit.index) +
        BLOCKED_CONTACT_PLACEHOLDER +
        current.slice(hit.index + hit.value.length)
      );
    }, source);
}

export function assertNoOffPlatformContact(text: string | null | undefined) {
  const result = validateBypassContent(text ?? '');
  if (!result.isValid) {
    throw new OffPlatformContactError(findBypassHits(text), result.reason);
  }
}

export function sanitizeUserText(
  text: string | null | undefined,
  mode: 'mask' | 'reject' = 'mask',
): string {
  const source = (text ?? '').trim();
  if (mode === 'reject') {
    assertNoOffPlatformContact(source);
    return source;
  }
  return maskOffPlatformContact(source);
}
