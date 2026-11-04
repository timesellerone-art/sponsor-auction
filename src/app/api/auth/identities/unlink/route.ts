import { connection } from 'next/server';
import { NextResponse, type NextRequest } from 'next/server';
import { unlinkSocialProvider } from '@/lib/account-delete';
import {
  SOCIAL_IDENTITY_PROVIDERS,
  canUnlinkProvider,
  findProviderIdentity,
  listLinkedAccountStatuses,
  type SocialIdentityProvider,
} from '@/lib/auth-identities';
import { clientIp, consumeRateLimit } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
} as const;

function isSocialProvider(value: string): value is SocialIdentityProvider {
  return (SOCIAL_IDENTITY_PROVIDERS as readonly string[]).includes(value);
}

export async function POST(request: NextRequest) {
  try {
    await connection();
    const limited = consumeRateLimit(clientIp(request), '/api/auth/identities/unlink');
    if (!limited.allowed) {
      return NextResponse.json(
        { error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
        { status: 429, headers: NO_STORE },
      );
    }

    const body = (await request.json().catch(() => null)) as { provider?: string } | null;
    const provider = body?.provider?.trim().toLowerCase() ?? '';
    if (!isSocialProvider(provider)) {
      return NextResponse.json({ error: '해제할 계정을 선택해 주세요.' }, { status: 400, headers: NO_STORE });
    }

    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Supabase가 설정되지 않았습니다.' },
        { status: 503, headers: NO_STORE },
      );
    }

    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401, headers: NO_STORE });
    }
    if (!canUnlinkProvider(data.user, provider)) {
      return NextResponse.json(
        { error: '마지막 로그인 수단은 해제할 수 없습니다.' },
        { status: 400, headers: NO_STORE },
      );
    }

    const identity = findProviderIdentity(data.user, provider);
    if (identity) {
      const unlinked = await supabase.auth.unlinkIdentity(identity);
      if (unlinked.error) {
        console.warn('[SponsorAuction] GoTrue unlinkIdentity 실패, RPC로 이어갑니다', unlinked.error.message);
      }
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: '계정 연동을 해제할 수 있는 관리자 키가 없습니다.' },
        { status: 503, headers: NO_STORE },
      );
    }

    const updated = await unlinkSocialProvider(admin, data.user, provider);
    return NextResponse.json(
      { data: { accounts: listLinkedAccountStatuses(updated) } },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.warn('[SponsorAuction] 소셜 연동 해제 예외', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '연동을 해제하지 못했습니다.' },
      { status: 500, headers: NO_STORE },
    );
  }
}
