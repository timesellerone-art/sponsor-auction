function trimEnv(value: string | undefined) {
  return value?.trim() || '';
}

/** 브라우저·서버 모두에서 읽는 위젯 클라이언트 키. Vercel에도 이 이름만 등록하면 됩니다. */
export function getTossClientKey() {
  return trimEnv(process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY);
}

function normalizeTossSecret(raw: string) {
  const key = raw.replace(/^["']+|["']+$/g, '').trim();
  if (/^basic\s+/i.test(key)) {
    const encoded = key.replace(/^basic\s+/i, '').trim();
    try {
      const decoded = Buffer.from(encoded, 'base64').toString('utf8');
      if (decoded.endsWith(':')) {
        return decoded.slice(0, -1);
      }
    } catch {
      // keep the trimmed key
    }
  }
  return key.replace(/\s+/g, '');
}

/** 결제 승인 API 전용. 클라이언트에 노출되면 안 됩니다. */
export function getTossSecretKey() {
  return normalizeTossSecret(trimEnv(process.env.TOSS_SECRET_KEY));
}

export function describeTossKeyKind(key: string) {
  const kind = key.startsWith('test_')
    ? 'test'
    : key.startsWith('live_')
      ? 'live'
      : 'unknown';
  return { kind, prefix: key.slice(0, 8), length: key.length };
}

export function describeTossSecret(secretKey: string) {
  return describeTossKeyKind(secretKey);
}

/** 토스 개발자센터 웹훅 보안 키. API 시크릿(TOSS_SECRET_KEY)과 다릅니다. */
export function getTossWebhookSecret() {
  return trimEnv(process.env.TOSS_WEBHOOK_SECRET || process.env.TOSS_SECURITY_KEY);
}

export function isTossClientConfigured() {
  return Boolean(getTossClientKey());
}

export function isTossSecretConfigured() {
  return Boolean(getTossSecretKey());
}

export function getPaymentSigningSecret() {
  const configured =
    getTossSecretKey() ||
    trimEnv(process.env.SUPABASE_SERVICE_ROLE_KEY) ||
    trimEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (configured) {
    return configured;
  }
  return process.env.NODE_ENV === 'production' ? '' : 'sponsor-auction-demo-payment';
}
