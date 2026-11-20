const FIXED_MONTH_DAYS = ['01-01', '03-01', '05-05', '06-06', '08-15', '10-03', '10-09', '12-25'];

/** 양력 고정일이 아닌 관공서 공휴일·대체공휴일. 제헌절은 공휴일이 아니라 넣지 않습니다. */
const EXTRA_HOLIDAYS = new Set([
  '2025-01-28',
  '2025-01-29',
  '2025-01-30',
  '2025-03-03',
  '2025-05-06',
  '2025-10-05',
  '2025-10-06',
  '2025-10-07',
  '2026-02-16',
  '2026-02-17',
  '2026-02-18',
  '2026-03-02',
  '2026-05-24',
  '2026-05-25',
  '2026-06-03',
  '2026-08-17',
  '2026-09-24',
  '2026-09-25',
  '2026-09-26',
  '2026-10-05',
]);

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function seoulDateKey(input: Date | string) {
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.trim())) {
    return input.trim();
  }
  const date = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function parts(key: string) {
  const [year, month, day] = key.split('-').map((item) => Number(item));
  return { year, month, day };
}

function shiftDateKey(key: string, days: number) {
  const { year, month, day } = parts(key);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

export function isKoreanBusinessDay(input: Date | string) {
  const key = seoulDateKey(input);
  if (!key) {
    return false;
  }
  const { year, month, day } = parts(key);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  if (weekday === 0 || weekday === 6) {
    return false;
  }
  const monthDay = key.slice(5);
  if (FIXED_MONTH_DAYS.includes(monthDay) || EXTRA_HOLIDAYS.has(key)) {
    return false;
  }
  return true;
}

export function addBusinessDays(input: Date | string, businessDays: number) {
  const start = seoulDateKey(input);
  if (!start || !Number.isInteger(businessDays) || businessDays <= 0) {
    return '';
  }
  let cursor = start;
  let remaining = businessDays;
  while (remaining > 0) {
    cursor = shiftDateKey(cursor, 1);
    if (isKoreanBusinessDay(cursor)) {
      remaining -= 1;
    }
  }
  return cursor;
}

export function settlementDueAtIso(requestedAt: Date | string, businessDays = 4) {
  const due = addBusinessDays(requestedAt, businessDays);
  if (!due) {
    return null;
  }
  return `${due}T00:00:00+09:00`;
}

export function formatSeoulDateLabel(input: Date | string | null | undefined) {
  const key = input ? seoulDateKey(input) : '';
  if (!key) {
    return '';
  }
  const [year, month, day] = key.split('-');
  return `${year}.${month}.${day}`;
}
