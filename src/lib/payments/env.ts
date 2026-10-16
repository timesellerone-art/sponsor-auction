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

export function describeTossSecret(secretKey: string) {
  const prefix = secretKey.slice(0, 8);
  const kind = secretKey.startsWith('test_')
    ? 'test'
    : secretKey.startsWith('live_')
      ? 'live'
      : 'unknown';
  return { kind, prefix, length: secretKey.length };
}

export function isTossClientConfigured() {
  return Boolean(getTossClientKey());
}

export function isTossSecretConfigured() {
  return Boolean(getTossSecretKey());
}

export function getPaymentSigningSecret() {
  return getTossSecretKey() || 'sponsor-auction-demo-payment';
}
