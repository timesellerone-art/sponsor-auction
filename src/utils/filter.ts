export const BLOCKED_CONTACT_PLACEHOLDER = '[연락처/링크가 차단되었습니다]';

export const OFF_PLATFORM_BLOCK_MESSAGE =
  '전화번호, 이메일, 카카오 ID, 외부 링크 등 플랫폼 우회 연락처는 사용할 수 없습니다.';

export type OffPlatformKind = 'phone' | 'email' | 'kakao' | 'url';

export type OffPlatformHit = {
  kind: OffPlatformKind;
  value: string;
  index: number;
};

export class OffPlatformContactError extends Error {
  readonly hits: OffPlatformHit[];

  constructor(hits: OffPlatformHit[], message = OFF_PLATFORM_BLOCK_MESSAGE) {
    super(message);
    this.name = 'OffPlatformContactError';
    this.hits = hits;
  }
}

const PHONE_PATTERN =
  /(?:\+82[-\s.]*)?0?1[016789](?:[-\s.]?\d{3,4}){2}\b|(?:\+82[-\s.]*)?0\d{1,2}[-\s.]?\d{3,4}[-\s.]?\d{4}\b/g;

const EMAIL_PATTERN =
  /[a-z0-9._%+-]+(?:\s*(?:@|\[at\]|\(at\)|at|골뱅이)\s*)[a-z0-9.-]+\.[a-z]{2,}/gi;

const KAKAO_PATTERN =
  /(?:https?:\/\/)?(?:open\.)?kakao(?:talk)?\.(?:com|me)\/\S+|카카오톡(?:\s*(?:아이디|id|ID))?|카톡(?:\s*(?:아이디|id|ID))?|kakao(?:talk)?\s*(?:id|아이디)/gi;

const URL_PATTERN =
  /(?:https?:\/\/|www\.)[^\s<>"']+|\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:com|net|org|io|me|kr|co\.kr)\b(?:\/[^\s<>"']*)?/gi;

const PATTERNS: Array<{ kind: OffPlatformKind; pattern: RegExp }> = [
  { kind: 'phone', pattern: PHONE_PATTERN },
  { kind: 'email', pattern: EMAIL_PATTERN },
  { kind: 'kakao', pattern: KAKAO_PATTERN },
  { kind: 'url', pattern: URL_PATTERN },
];

function cloneGlobal(pattern: RegExp) {
  return new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
}

export function findOffPlatformHits(text: string | null | undefined): OffPlatformHit[] {
  const source = text ?? '';
  if (!source.trim()) {
    return [];
  }

  const hits: OffPlatformHit[] = [];
  for (const { kind, pattern } of PATTERNS) {
    const matcher = cloneGlobal(pattern);
    let matched = matcher.exec(source);
    while (matched) {
      const value = matched[0]?.trim() ?? '';
      if (value) {
        hits.push({ kind, value: matched[0], index: matched.index });
      }
      if (matched[0].length === 0) {
        matcher.lastIndex += 1;
      }
      matched = matcher.exec(source);
    }
  }

  return hits.sort((left, right) => left.index - right.index);
}

export function hasOffPlatformContact(text: string | null | undefined): boolean {
  return findOffPlatformHits(text).length > 0;
}

export function maskOffPlatformContact(text: string | null | undefined): string {
  const source = text ?? '';
  if (!source) {
    return '';
  }

  const combined = new RegExp(
    PATTERNS.map((item) => `(?:${item.pattern.source})`).join('|'),
    'gi',
  );
  return source.replace(combined, BLOCKED_CONTACT_PLACEHOLDER);
}

export function assertNoOffPlatformContact(text: string | null | undefined) {
  const hits = findOffPlatformHits(text);
  if (hits.length > 0) {
    throw new OffPlatformContactError(hits);
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
