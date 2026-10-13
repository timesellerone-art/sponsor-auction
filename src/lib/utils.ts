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

const dateTimeFormatter = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function formatDate(value: string | undefined) {
  if (!value) {
    return '날짜 없음';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '날짜 없음';
  }

  return dateTimeFormatter.format(date);
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
