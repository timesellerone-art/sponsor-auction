export type SettlementAccount = {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
};

export const SETTLEMENT_TYPES = ['individual', 'business'] as const;
export type SettlementType = (typeof SETTLEMENT_TYPES)[number];

export const SETTLEMENT_TYPE_LABEL: Record<SettlementType, string> = {
  individual: '개인 프리랜서',
  business: '사업자',
};

export type CreatorSettlementProfile = SettlementAccount & {
  settlementType: SettlementType;
};

export function isSettlementType(value: unknown): value is SettlementType {
  return value === 'individual' || value === 'business';
}

export function parseSettlementType(value: unknown): SettlementType {
  return isSettlementType(value) ? value : 'individual';
}

export function normalizeAccountNumber(value: string | null | undefined) {
  return (value ?? '').replace(/\D/g, '');
}

export function settlementAccountFromParts(input: {
  bankName?: string | null;
  accountNumber?: string | null;
  accountHolder?: string | null;
}): SettlementAccount {
  return {
    bankName: (input.bankName ?? '').trim().replace(/\s+/g, ' '),
    accountNumber: normalizeAccountNumber(input.accountNumber),
    accountHolder: (input.accountHolder ?? '').trim().replace(/\s+/g, ' '),
  };
}

export function composeBankAccount(account: SettlementAccount) {
  return [account.bankName, account.accountNumber].filter(Boolean).join(' ');
}

export function bankAccountWithHolder(account: SettlementAccount) {
  const base = composeBankAccount(account);
  return account.accountHolder ? `${base} / ${account.accountHolder}` : base;
}

export function settlementAccountFromBankField(raw: string | null | undefined): SettlementAccount {
  const trimmed = (raw ?? '').trim();
  const slash = trimmed.indexOf(' / ');
  const body = (slash >= 0 ? trimmed.slice(0, slash) : trimmed).trim();
  const accountHolder = slash >= 0 ? trimmed.slice(slash + 3).trim() : '';
  return {
    bankName: body.replace(/[0-9\-./()\s]+/g, ' ').trim().replace(/\s+/g, ' '),
    accountNumber: body.replace(/\D/g, ''),
    accountHolder,
  };
}

export const MISSING_SETTLEMENT_ACCOUNT_MESSAGE =
  '정산 계좌가 등록되지 않아 정산 요청을 진행할 수 없습니다. 마이페이지에서 은행명, 계좌번호, 예금주를 저장해 주세요.';

export function settlementAccountError(account: SettlementAccount) {
  if (account.bankName.length < 2) {
    return '은행명을 입력해 주세요.';
  }
  if (account.accountNumber.length < 6 || account.accountNumber.length > 20) {
    return '계좌번호는 숫자 6자리 이상이어야 합니다.';
  }
  if (account.accountHolder.length < 2) {
    return '예금주를 입력해 주세요.';
  }
  return null;
}

export function formatSettlementAccount(account: SettlementAccount) {
  return [account.bankName, account.accountNumber, account.accountHolder].filter(Boolean).join(' ');
}

export function creatorSettlementFromRow(row: {
  bank_name?: string | null;
  account_number?: string | null;
  account_holder?: string | null;
  settlement_type?: string | null;
}): CreatorSettlementProfile {
  return {
    ...settlementAccountFromParts({
      bankName: row.bank_name,
      accountNumber: row.account_number,
      accountHolder: row.account_holder,
    }),
    settlementType: parseSettlementType(row.settlement_type),
  };
}

export function creatorSettlementError(profile: CreatorSettlementProfile) {
  if (!isSettlementType(profile.settlementType)) {
    return '정산 유형을 선택해 주세요.';
  }
  return settlementAccountError(profile);
}
