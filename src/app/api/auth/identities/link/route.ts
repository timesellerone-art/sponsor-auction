import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { reconcileSocialIdentities } from '@/lib/auth-identity';
import { createClient } from '@/lib/supabase/server';

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
} as const;

export async function POST() {
  try {
    try {
      await connection();
    } catch {
      // 동적 렌더 힌트가 없어도 계정 연결은 계속합니다.
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
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401, headers: NO_STORE },
      );
    }

    const linked = await reconcileSocialIdentities(data.user);
    if (linked.switched && linked.tokenHash) {
      const verified = await supabase.auth.verifyOtp({
        token_hash: linked.tokenHash,
        type: 'magiclink',
      });
      if (verified.error) {
        console.warn('[SponsorAuction] 통합 계정 세션 전환 실패', verified.error.message);
      }
    }

    const current = await supabase.auth.getUser();
    return NextResponse.json(
      {
        data: {
          id: current.data.user?.id ?? linked.user.id,
          email: current.data.user?.email ?? linked.user.email ?? null,
          switched: linked.switched,
        },
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.warn('[SponsorAuction] 소셜 계정 연결 중 예외가 발생했습니다.', error);
    return NextResponse.json(
      { error: '소셜 계정을 연결하지 못했습니다.' },
      { status: 500, headers: NO_STORE },
    );
  }
}
