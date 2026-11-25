'use client';

import { bankSelectOptions, canonicalBankName } from '@/lib/banks';
import { cn } from '@/lib/utils';

type BankSelectProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  className?: string;
  disabled?: boolean;
};

export function BankSelect({
  id,
  value,
  onChange,
  invalid = false,
  className,
  disabled = false,
}: BankSelectProps) {
  const selected = canonicalBankName(value);
  const options = bankSelectOptions(value);

  return (
    <select
      id={id}
      value={selected}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        'h-11 w-full rounded-xl border bg-white px-3 text-sm text-zinc-950 outline-none focus:ring-2',
        invalid
          ? 'border-rose-300 focus:ring-rose-200'
          : 'border-zinc-200 focus:border-clink-accent focus:ring-clink-peach-strong',
        className,
      )}
    >
      <option value="">은행을 선택해 주세요</option>
      {options.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
  );
}
