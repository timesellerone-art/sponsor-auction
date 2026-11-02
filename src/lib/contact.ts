const PLACEHOLDER_EMAIL_SUFFIX = '@oauth.sponsor-auction.local';

export function isPlaceholderOAuthEmail(value: string | null | undefined) {
  const email = value?.trim().toLowerCase() ?? '';
  return !email.includes('@') || email.endsWith(PLACEHOLDER_EMAIL_SUFFIX);
}

export function normalizeContactEmail(value: string | null | undefined) {
  const email = value?.trim().toLowerCase() ?? '';
  if (!email.includes('@') || isPlaceholderOAuthEmail(email)) {
    return '';
  }
  return email;
}

export function normalizePhone(value: string | null | undefined) {
  const digits = (value ?? '').replace(/\D/g, '');
  if (digits.length < 10) {
    return '';
  }
  let local = digits;
  if (local.startsWith('82') && local.length >= 11) {
    local = `0${local.slice(2)}`;
  } else if (local.startsWith('10') && local.length === 10) {
    local = `0${local}`;
  }
  return local;
}

/** 010·+82·82 표기를 같은 휴대전화로 본다. */
export function sameKrPhone(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  const a = normalizePhone(left);
  const b = normalizePhone(right);
  return Boolean(a) && a === b;
}

export function phoneSearchKeys(value: string | null | undefined) {
  const local = normalizePhone(value);
  if (!local) {
    return [] as string[];
  }
  const keys = new Set<string>([local, (value ?? '').replace(/\D/g, '')]);
  if (local.startsWith('0') && local.length >= 10) {
    keys.add(local.slice(1));
    keys.add(`82${local.slice(1)}`);
    keys.add(`+82${local.slice(1)}`);
  }
  return [...keys].filter((item) => item.length >= 10);
}

export function toE164Kr(phone: string | null | undefined) {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return '';
  }
  if (normalized.startsWith('0')) {
    return `+82${normalized.slice(1)}`;
  }
  return `+${normalized}`;
}

function stringPhone(value: unknown) {
  return typeof value === 'string' ? value : '';
}

type PhoneIdentity = {
  provider?: string | null;
  id?: string | null;
  identity_data?: Record<string, unknown> | null;
};

export function collectPhoneValues(source: {
  phone?: string | null;
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
  identities?: PhoneIdentity[] | null;
}) {
  const meta = source.user_metadata ?? {};
  const app = source.app_metadata ?? {};
  const raw: Array<string | null | undefined> = [
    source.phone,
    stringPhone(app.contact_phone),
    stringPhone(meta.phone),
    stringPhone(meta.phone_number),
    stringPhone(meta.mobile),
    stringPhone(meta.mobile_e164),
  ];
  for (const identity of source.identities ?? []) {
    const data = identity.identity_data ?? {};
    raw.push(
      stringPhone(data.phone),
      stringPhone(data.phone_number),
      stringPhone(data.mobile),
      stringPhone(data.mobile_e164),
    );
    if (identity.provider === 'phone') {
      raw.push(stringPhone(identity.id), stringPhone(data.sub));
    }
  }
  return [...new Set(raw.map((item) => normalizePhone(item)).filter(Boolean))];
}

export function hasMatchingPhone(
  source: {
    phone?: string | null;
    app_metadata?: Record<string, unknown> | null;
    user_metadata?: Record<string, unknown> | null;
    identities?: PhoneIdentity[] | null;
  },
  phone: string | null | undefined,
) {
  const wanted = normalizePhone(phone);
  return Boolean(wanted) && collectPhoneValues(source).includes(wanted);
}

export function isValidContactEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) && !isPlaceholderOAuthEmail(value);
}

export function isValidPhone(value: string) {
  const phone = normalizePhone(value);
  return phone.length >= 10 && phone.length <= 11;
}
