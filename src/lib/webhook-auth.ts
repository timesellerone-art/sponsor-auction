import { timingSafeEqual } from 'crypto';

export function webhookSecret() {
  return (
    process.env.SUPABASE_WEBHOOK_SECRET ||
    process.env.WEBHOOK_SECRET ||
    ''
  ).trim();
}

function headerSecret(request: Request) {
  const direct =
    request.headers.get('x-webhook-secret') ||
    request.headers.get('x-supabase-webhook-secret') ||
    '';
  if (direct.trim()) {
    return direct.trim();
  }
  const auth = request.headers.get('authorization') || '';
  const bearer = auth.match(/^Bearer\s+(.+)$/i);
  return bearer?.[1]?.trim() || '';
}

export function verifyWebhookSecret(request: Request) {
  const expected = webhookSecret();
  if (!expected) {
    return { ok: true, mocked: true as const };
  }
  const provided = headerSecret(request);
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  if (left.length === 0 || left.length !== right.length) {
    return { ok: false, mocked: false as const };
  }
  try {
    return { ok: timingSafeEqual(left, right), mocked: false as const };
  } catch {
    return { ok: false, mocked: false as const };
  }
}
