export const KOREAN_BANKS = [
  '국민은행',
  '신한은행',
  '우리은행',
  '하나은행',
  '농협은행',
  '기업은행',
  '카카오뱅크',
  '토스뱅크',
  '케이뱅크',
  '새마을금고',
  '우체국',
  'SC제일은행',
  '씨티은행',
  '대구은행(iM뱅크)',
  '부산은행',
  '경남은행',
  '광주은행',
  '전북은행',
  '제주은행',
  '수협은행',
  '신협',
] as const;

const BANK_ALIASES: Array<[RegExp, string]> = [
  [/카카오/, '카카오뱅크'],
  [/토스/, '토스뱅크'],
  [/케이\s*뱅크|k뱅크/i, '케이뱅크'],
  [/농협|nh/i, '농협은행'],
  [/기업|ibk/i, '기업은행'],
  [/신한/, '신한은행'],
  [/국민|kb/i, '국민은행'],
  [/우리/, '우리은행'],
  [/하나/, '하나은행'],
  [/우체국/, '우체국'],
  [/새마을/, '새마을금고'],
  [/신협/, '신협'],
  [/수협/, '수협은행'],
  [/부산/, '부산은행'],
  [/대구|i\s*m\s*뱅크/i, '대구은행(iM뱅크)'],
  [/경남/, '경남은행'],
  [/광주/, '광주은행'],
  [/전북/, '전북은행'],
  [/제주/, '제주은행'],
  [/sc|제일/i, 'SC제일은행'],
  [/씨티|citi/i, '씨티은행'],
];

function compactBankLabel(value: string) {
  return value.trim().replace(/\s+/g, '');
}

export function canonicalBankName(value: string | null | undefined) {
  const raw = (value ?? '').trim();
  if (!raw) {
    return '';
  }
  const compact = compactBankLabel(raw);
  const exact = KOREAN_BANKS.find(
    (name) => name === raw || compactBankLabel(name) === compact,
  );
  if (exact) {
    return exact;
  }
  for (const [pattern, name] of BANK_ALIASES) {
    if (pattern.test(raw) || pattern.test(compact)) {
      return name;
    }
  }
  return raw;
}

export function bankSelectOptions(current?: string | null) {
  const selected = canonicalBankName(current);
  if (selected && !KOREAN_BANKS.includes(selected as (typeof KOREAN_BANKS)[number])) {
    return [selected, ...KOREAN_BANKS];
  }
  return [...KOREAN_BANKS];
}
