import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { isMemberRole } from '@/types/auth';
import { createAdminClient } from '@/lib/supabase/admin';

const PROFILE_COLUMNS = 'id, name, email, role, status, created_at';

function bearerToken(request: Request) {
  const header = request.headers.get('authorization') ?? '';
  const matched = header.match(/^Bearer\s+(\S+)/i);
  return matched?.[1]?.trim() ?? '';
}

export async function POST(request: Request) {
  try {
    await connection();
    const token = bearerToken(request);
    if (!token) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as {
      role?: string;
      name?: string;
      email?: string;
    } | null;
    const role = body?.role;
    if (!isMemberRole(role)) {
      return NextResponse.json(
        { error: '광고주 또는 크리에이터 역할을 선택해 주세요.' },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ error: '프로필을 저장할 수 없습니다.' }, { status: 503 });
    }

    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const user = authData.user;
    if (authError || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const email =
      body?.email?.trim() ||
      user.email?.trim() ||
      `user.${user.id.replace(/-/g, '').slice(0, 12)}@oauth.sponsor-auction.local`;
    const name =
      body?.name?.trim() ||
      (typeof user.user_metadata?.name === 'string' ? user.user_metadata.name.trim() : '') ||
      email.split('@')[0] ||
      '회원';

    const payload = {
      id: user.id,
      name,
      email,
      role,
      status: 'active' as const,
    };

    const upserted = await admin
      .from('profiles')
      .upsert(payload, { onConflict: 'id' })
      .select(PROFILE_COLUMNS)
      .maybeSingle();

    let row = upserted.data;
    if (upserted.error || !row) {
      const updated = await admin
        .from('profiles')
        .update({ name, email, role, status: 'active' })
        .eq('id', user.id)
        .select(PROFILE_COLUMNS)
        .maybeSingle();
      if (updated.error || !updated.data) {
        console.warn(
          '[SponsorAuction] 온보딩 프로필 저장 실패',
          upserted.error?.message || updated.error?.message,
        );
        return NextResponse.json({ error: '프로필을 저장하지 못했습니다.' }, { status: 500 });
      }
      row = updated.data;
    }

    return NextResponse.json({
      data: {
        id: row.id,
        email: row.email?.trim() || email,
        name: row.name?.trim() || name,
        role: row.role,
      },
    });
  } catch (error) {
    console.warn('[SponsorAuction] 온보딩 역할 저장 예외', error);
    return NextResponse.json({ error: '프로필을 저장하지 못했습니다.' }, { status: 500 });
  }
}
