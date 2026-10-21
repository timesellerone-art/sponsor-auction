import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { isMemberRole } from '@/types/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { profileNameFromUser, upsertAppProfile } from '@/lib/supabase/profile-sync';

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

    const synced = await upsertAppProfile(admin, {
      id: user.id,
      email: body?.email?.trim() || user.email,
      name: body?.name?.trim() || profileNameFromUser(user),
      role,
    });
    if (!synced) {
      return NextResponse.json({ error: '프로필을 저장하지 못했습니다.' }, { status: 500 });
    }

    return NextResponse.json({
      data: {
        id: synced.id,
        email: synced.email,
        name: synced.name,
        role: synced.role,
      },
    });
  } catch (error) {
    console.warn('[SponsorAuction] 온보딩 역할 저장 예외', error);
    return NextResponse.json({ error: '프로필을 저장하지 못했습니다.' }, { status: 500 });
  }
}
