export type SettlementAccount = {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
};

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
