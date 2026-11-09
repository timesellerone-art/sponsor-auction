export const BYPASS_BLOCK_MESSAGE =
  '안전한 거래를 위해 연락처(전화번호, 계좌번호, 카카오톡 등) 및 직거래 유도 표현은 입력할 수 없습니다.';

export type BypassHitKind =
  | 'phone'
  | 'account'
  | 'hangul-digits'
  | 'contact-phrase'
  | 'messenger'
  | 'direct-deal'
  | 'email'
  | 'contact-url';

export type BypassHit = {
  kind: BypassHitKind;
  value: string;
  index: number;
};

export type BypassValidation = {
  isValid: boolean;
  matchedPattern?: string;
  reason?: string;
};

export type BypassFilterOptions = {
  allowPortfolioUrl?: boolean;
};

const HANGUL_DIGIT_TOKEN =
  '(?:공|영|빵|제로|일|하나|이|둘|삼|셋|사|넷|오|다섯|육|여섯|칠|일곱|팔|여덟|구|아홉)';

const CONTACT_PHRASES = [
  '전화번호',
  '폰번호',
  '핸드폰번호',
  '휴대폰번호',
  '휴대전화번호',
  '계좌번호',
  '통장번호',
  '계좌이체',
  '번호남겨',
  '번호드릴게요',
  '번호주세요',
  '번호알려',
  '연락주세요',
  '연락처',
  '연락바랍니다',
  '연락줘요',
];

const MESSENGER_COMPACT = [
  '카톡',
  '카카오톡',
  '오픈카톡',
  '오픈채팅',
  '옵챗',
  '옾챗',
  'ㅋㅌ',
  '갠톡',
  'katalk',
  'kakaotalk',
  'telegram',
  '텔레그램',
  '텔레아이디',
  '라인톡',
  '라인아이디',
  '디엠',
  '인스타디엠',
  '위챗',
  'wechat',
  'whatsapp',
];

const DIRECT_DEAL_COMPACT = [
  '직거래',
  '무통장',
  '개인입금',
  '토스송금',
  '따로결제',
  '밖에서거래',
  '외부거래',
  '초록창검색',
  '따로연락',
  '개인적으로연락',
];

const SAFE_PORTFOLIO_HOSTS = [
  'youtube.com',
  'youtu.be',
  'instagram.com',
  'tiktok.com',
  'x.com',
  'twitter.com',
  'threads.net',
  'naver.com',
  'blog.naver.com',
  'facebook.com',
  'fb.com',
];

const CONTACT_HOSTS = [
  'kakao.com',
  'kakao.me',
  'open.kakao.com',
  't.me',
  'telegram.me',
  'telegram.org',
  'line.me',
  'discord.gg',
  'wa.me',
];

const QUANTITY_BEFORE =
  /(?:조회수|팔로워|구독자|예산|금액|단가|평균|약)$/i;
const QUANTITY_AFTER =
  /^(?:원|회|명|뷰|만|억|건|원대|views?|won)/i;

function normalize(text: string) {
  return text.normalize('NFKC');
}

function compactText(text: string) {
  return normalize(text)
    .toLowerCase()
    .replace(/[\s\u200b\u200c\u200d\ufeff._\-*/\\|:;,'"`~!@#$%^&=+()[\]{}<>?]+/g, '');
}

function pushHit(hits: BypassHit[], kind: BypassHitKind, value: string, index: number) {
  if (!value) {
    return;
  }
  hits.push({ kind, value, index: Math.max(0, index) });
}

function isQuantityContext(source: string, index: number, length: number) {
  const before = source.slice(Math.max(0, index - 16), index).replace(/[\s,._]/g, '');
  const after = source.slice(index + length, index + length + 10).replace(/[\s,._]/g, '');
  return QUANTITY_BEFORE.test(before) || QUANTITY_AFTER.test(after);
}

function collectDigitHits(source: string, hits: BypassHit[]) {
  const phone = /(?:\+82[-.\s]*)?0?1[016789][-.\s]?[0-9]{3,4}[-.\s]?[0-9]{4}/g;
  let matched = phone.exec(source);
  while (matched) {
    pushHit(hits, 'phone', matched[0], matched.index);
    matched = phone.exec(source);
  }

  const collapsed = source.replace(/(\d)[\s.\-_()*]+(?=\d)/g, '$1');
  const run = /\d{7,14}/g;
  let digits = run.exec(collapsed);
  while (digits) {
    const value = digits[0];
    const originalIndex = source.search(value) >= 0 ? source.search(value) : digits.index;
    const looksLikePhone = /^01[016789]\d{7,8}$/.test(value) || /^1[016789]\d{7,8}$/.test(value);
    if (value.length >= 10 || looksLikePhone) {
      pushHit(hits, value.length >= 10 && !looksLikePhone ? 'account' : 'phone', value, originalIndex);
    } else if (!isQuantityContext(collapsed, digits.index, value.length)) {
      pushHit(hits, 'account', value, originalIndex);
    }
    digits = run.exec(collapsed);
  }
}

function collectHangulDigitHits(source: string, hits: BypassHit[]) {
  const pattern = new RegExp(`(?:${HANGUL_DIGIT_TOKEN}[\\s.\\-]*){7,14}`, 'g');
  let matched = pattern.exec(source);
  while (matched) {
    pushHit(hits, 'hangul-digits', matched[0].trim(), matched.index);
    matched = pattern.exec(source);
  }
}

function includesCompact(haystack: string, needle: string) {
  const compactNeedle = compactText(needle);
  return Boolean(compactNeedle) && haystack.includes(compactNeedle);
}

function collectKeywordHits(source: string, hits: BypassHit[]) {
  const compact = compactText(source);
  const lower = normalize(source).toLowerCase();

  for (const phrase of CONTACT_PHRASES) {
    const compactPhrase = compactText(phrase);
    const index = lower.indexOf(phrase.toLowerCase());
    const compactIndex = compact.indexOf(compactPhrase);
    if (index >= 0 || compactIndex >= 0) {
      pushHit(hits, 'contact-phrase', phrase, index >= 0 ? index : 0);
    }
  }

  if (
    /(?:^|[^\uac00-\ud7a3])(?:제|내)\s*번호/.test(lower) ||
    /번호\s*(?:남겨|드릴게|주세요|알려)/.test(lower)
  ) {
    pushHit(hits, 'contact-phrase', '번호 요청', lower.search(/번호/));
  }
  if (/연락\s*(?:주세요|줘요|바랍니다)/.test(lower) || compact.includes('연락처')) {
    pushHit(hits, 'contact-phrase', '연락 요청', lower.search(/연락/));
  }

  for (const keyword of MESSENGER_COMPACT) {
    if (includesCompact(compact, keyword)) {
      pushHit(hits, 'messenger', keyword, 0);
    }
  }

  if (/(?:^|[^가-힣a-z])텔레(?!비|마케팅)/.test(lower) || compact.includes('텔레그램')) {
    pushHit(hits, 'messenger', '텔레', 0);
  }
  if (/\b(?:dm|kakao)\b/i.test(source) || compact.includes('카카오톡') || compact.includes('카톡')) {
    pushHit(hits, 'messenger', 'messenger-id', 0);
  }
  if (/카카오\s*(?!뱅크|페이|모먼트|광고|비즈니스)/.test(lower)) {
    pushHit(hits, 'messenger', '카카오', lower.search(/카카오/));
  }

  for (const keyword of DIRECT_DEAL_COMPACT) {
    if (includesCompact(compact, keyword)) {
      pushHit(hits, 'direct-deal', keyword, 0);
    }
  }
}

function hostOf(value: string) {
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`);
    return url.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function isSafePortfolioHost(host: string) {
  return SAFE_PORTFOLIO_HOSTS.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
}

function isContactHost(host: string) {
  return CONTACT_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}

function collectUrlAndEmailHits(
  source: string,
  hits: BypassHit[],
  options?: BypassFilterOptions,
) {
  const email =
    /[a-z0-9._%+-]+(?:\s*(?:@|\[at\]|\(at\)|골뱅이)\s*)[a-z0-9.-]+\.[a-z]{2,}/gi;
  let matched = email.exec(source);
  while (matched) {
    pushHit(hits, 'email', matched[0], matched.index);
    matched = email.exec(source);
  }

  const url =
    /(?:https?:\/\/|www\.)[^\s<>"']+|\b(?:t\.me|discord\.gg|line\.me|open\.kakao\.com)\/[^\s<>"']+/gi;
  matched = url.exec(source);
  while (matched) {
    const value = matched[0];
    const host = hostOf(value);
    if (isContactHost(host) || /kakao|telegram|t\.me|line\.me/i.test(value)) {
      pushHit(hits, 'contact-url', value, matched.index);
    } else if (!options?.allowPortfolioUrl && host && !isSafePortfolioHost(host)) {
      pushHit(hits, 'contact-url', value, matched.index);
    }
    matched = url.exec(source);
  }
}

export function findBypassHits(
  text: string | null | undefined,
  options?: BypassFilterOptions,
): BypassHit[] {
  const source = normalize(text ?? '');
  if (!source.trim()) {
    return [];
  }

  const hits: BypassHit[] = [];
  collectDigitHits(source, hits);
  collectHangulDigitHits(source, hits);
  collectKeywordHits(source, hits);
  collectUrlAndEmailHits(source, hits, options);
  return hits.sort((left, right) => left.index - right.index);
}

export function validateBypassContent(
  text: string,
  options?: BypassFilterOptions,
): BypassValidation {
  const hits = findBypassHits(text, options);
  if (hits.length === 0) {
    return { isValid: true };
  }
  const first = hits[0];
  return {
    isValid: false,
    matchedPattern: first.value,
    reason: BYPASS_BLOCK_MESSAGE,
  };
}
