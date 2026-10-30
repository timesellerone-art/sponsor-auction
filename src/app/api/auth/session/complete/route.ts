import { connection } from 'next/server';
import { type NextRequest } from 'next/server';
import { completeLoginError, completeMagicLinkSession } from '@/lib/auth-complete';
import { requestOrigin } from '@/lib/naver-oauth';
import { clientIp, consumeRateLimit } from '@/lib/rate-limit';

export async function GET(request: NextRequest) {
  try {
    await connection();
    const limited = consumeRateLimit(clientIp(request), '/api/auth/session/complete');
    if (!limited.allowed) {
      return completeLoginError(
        request,
        requestOrigin(request),
        '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
      );
    }

    const origin = requestOrigin(request);
    const url = new URL(request.url);
    const tokenHash = url.searchParams.get('token_hash')?.trim() ?? '';
    const next = url.searchParams.get('next') ?? '';
    const type = url.searchParams.get('type') === 'email' ? 'email' : 'magiclink';
    if (!tokenHash) {
      return completeLoginError(request, origin, '로그인 세션이 저장되지 않았습니다. 다시 로그인해 주세요.');
    }

    return completeMagicLinkSession({
      request,
      origin,
      tokenHash,
      type,
      next,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : '로그인 세션을 만들지 못했습니다.';
    console.warn('[SponsorAuction] 세션 완료 처리 예외', error);
    return completeLoginError(request, requestOrigin(request), detail);
  }
}
