function trimEnv(value: string | undefined) {
  return value?.trim() || '';
}

/** 브라우저·서버 모두에서 읽는 위젯 클라이언트 키. Vercel에도 이 이름만 등록하면 됩니다. */
export function getTossClientKey() {
  return trimEnv(process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY);
}

/** 결제 승인 API 전용. 클라이언트에 노출되면 안 됩니다. */
export function getTossSecretKey() {
  return trimEnv(process.env.TOSS_SECRET_KEY);
}

export function isTossClientConfigured() {
  return Boolean(getTossClientKey());
}

export function isTossSecretConfigured() {
  return Boolean(getTossSecretKey());
}

/** 위젯 표시 여부. 시크릿 키 유무와 무관하게 공개 클라이언트 키만 봅니다. */
export function isTossConfigured() {
  return isTossClientConfigured();
}

export function getPaymentSigningSecret() {
  return getTossSecretKey() || 'sponsor-auction-demo-payment';
}
