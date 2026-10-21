import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const wonFormatter = new Intl.NumberFormat('ko-KR');

export function formatWon(value: number) {
  const amount = Number.isFinite(value) ? value : 0;
  return `${wonFormatter.format(amount)}원`;
}

export function formatViews(value: number) {
  const amount = Number.isFinite(value) ? value : 0;
  if (amount >= 10_000) {
    return `${wonFormatter.format(Math.round(amount / 10_000))}만 회`;
  }
  return `${wonFormatter.format(amount)}회`;
}

const dateTimeLongFormatter = new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatDateTime(value: string | undefined) {
  if (!value) {
    return '제출 일자 없음';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '제출 일자 없음';
  }

  return dateTimeLongFormatter.format(date);
}

export function formatAdminTimestamp(value: string | undefined | null) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  const hour = pick('hour') === '24' ? '00' : pick('hour');
  return `${pick('year')}-${pick('month')}-${pick('day')} ${hour}:${pick('minute')}`;
}
