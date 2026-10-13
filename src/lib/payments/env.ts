function trimEnv(value: string | undefined) {
  return value?.trim() || '';
}

export function getTossClientKey() {
  return (
    trimEnv(process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY) ||
    trimEnv(process.env.NEXT_PUBLIC_TOSS_WIDGET_CLIENT_KEY)
  );
}

export function getTossSecretKey() {
  return trimEnv(process.env.TOSS_SECRET_KEY);
}

export function isTossConfigured() {
  return Boolean(getTossClientKey() && getTossSecretKey());
}

export function getPaymentSigningSecret() {
  return getTossSecretKey() || 'sponsor-auction-demo-payment';
}
