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
  if (digits.startsWith('82') && digits.length >= 11) {
    return `0${digits.slice(2)}`;
  }
  return digits;
}

export function isValidContactEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) && !isPlaceholderOAuthEmail(value);
}

export function isValidPhone(value: string) {
  const phone = normalizePhone(value);
  return phone.length >= 10 && phone.length <= 11;
}
