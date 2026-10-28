import { connection } from 'next/server';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  PENDING_MERGE_COOKIE,
  completePendingMerge,
  reconcileSocialIdentities,
} from '@/lib/auth-identity';
import { createClient } from '@/lib/supabase/server';

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
} as const;

export async function POST() {
  try {
    await connection();

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

    const cookieStore = await cookies();
    const pending = await completePendingMerge(
      cookieStore.get(PENDING_MERGE_COOKIE)?.value,
      data.user,
    );

    const linked = await reconcileSocialIdentities(pending.user);
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
    const response = NextResponse.json(
      {
        data: {
          id: current.data.user?.id ?? linked.user.id,
          email: current.data.user?.email ?? linked.user.email ?? null,
          merged: pending.merged || linked.switched,
        },
      },
      { headers: NO_STORE },
    );
    response.cookies.delete(PENDING_MERGE_COOKIE);
    return response;
  } catch (error) {
    console.error('[SponsorAuction] 소셜 계정 통합 중 예외가 발생했습니다.', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '소셜 계정을 연결하지 못했습니다.' },
      { status: 500, headers: NO_STORE },
    );
  }
}
