import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import {
  forbiddenJson,
  getPaymentActor,
  unauthorizedJson,
} from '@/lib/payments/guard';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSchemaMismatch } from '@/lib/supabase/errors';
import { isAuthProfileRole } from '@/types/auth';

const PROFILE_COLUMNS = 'id, name, email, role, status, created_at';
const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
} as const;

export async function GET() {
  try {
    await connection();
    const actor = await getPaymentActor();
    if (!actor) {
      return unauthorizedJson('회원 목록을 조회하려면 로그인해 주세요.');
    }
    if (actor.role !== 'admin') {
      return forbiddenJson('회원 목록은 관리자만 볼 수 있습니다.');
    }

    const client = createAdminClient();
    if (!client) {
      return NextResponse.json(
        {
          error: 'SUPABASE_SERVICE_ROLE_KEY가 없어 회원 목록을 DB에서 읽을 수 없습니다.',
          fallbackMock: true,
        },
        { status: 409, headers: NO_STORE },
      );
    }

    const { data, error } = await client
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .order('created_at', { ascending: false });

    if (error && isSchemaMismatch(error)) {
      return NextResponse.json({ fallbackMock: true }, { status: 409, headers: NO_STORE });
    }
    if (error) {
      console.warn('[SponsorAuction] 관리자 회원 목록 조회 실패', error.message);
      return NextResponse.json(
        { error: '회원 목록을 불러오지 못했습니다.' },
        { status: 500, headers: NO_STORE },
      );
    }

    const profiles = (data ?? [])
      .filter((row) => {
        const role = typeof row.role === 'string' ? row.role : '';
        const status = row.status === 'suspended' ? 'suspended' : 'active';
        return Boolean(row.id && row.email && isAuthProfileRole(role) && status);
      })
      .map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
        status: row.status,
        createdAt: row.created_at,
      }));

    return NextResponse.json({ data: profiles }, { headers: NO_STORE });
  } catch (error) {
    console.warn('[SponsorAuction] 관리자 회원 목록 API 예외', error);
    return NextResponse.json(
      { error: '회원 목록을 불러오지 못했습니다.' },
      { status: 500, headers: NO_STORE },
    );
  }
}
