export type AdminListSort = 'newest' | 'oldest' | 'amount_desc' | 'amount_asc';

export const ADMIN_LIST_SORTS: { id: AdminListSort; label: string }[] = [
  { id: 'newest', label: '🕒 최근 처리순' },
  { id: 'oldest', label: '⏳ 오래된순' },
  { id: 'amount_desc', label: '💰 금액 높은순' },
  { id: 'amount_asc', label: '🪙 금액 낮은순' },
];

export function sortByAdminList<T>(
  items: T[],
  sort: AdminListSort,
  getTime: (item: T) => string,
  getAmount: (item: T) => number,
) {
  const next = [...items];
  next.sort((left, right) => {
    if (sort === 'amount_desc') {
      return getAmount(right) - getAmount(left);
    }
    if (sort === 'amount_asc') {
      return getAmount(left) - getAmount(right);
    }
    const leftTime = Date.parse(getTime(left)) || 0;
    const rightTime = Date.parse(getTime(right)) || 0;
    return sort === 'oldest' ? leftTime - rightTime : rightTime - leftTime;
  });
  return next;
}

function csvCell(value: string | number | null | undefined) {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  if (typeof window === 'undefined') {
    return;
  }
  const lines = [
    headers.map(csvCell).join(','),
    ...rows.map((row) => row.map(csvCell).join(',')),
  ];
  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
