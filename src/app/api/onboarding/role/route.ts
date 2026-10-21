import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { applyAuthCookies } from '@/lib/access';
import { parseOnboardingRoles, resolveOnboardingActor, type OnboardingBody } from '@/lib/onboarding';
import { upsertAppProfile } from '@/lib/supabase/profile-sync';

export async function POST(request: Request) {
  try {
    try {
      await connection();
    } catch {
      // 동적 렌더 힌트가 실패해도 역할 저장은 계속합니다.
    }

    const body = (await request.json().catch(() => null)) as OnboardingBody | null;
    const selectedRoles = parseOnboardingRoles(body);
    if (selectedRoles.length === 0) {
      return NextResponse.json(
        { error: '광고주 또는 크리에이터 역할을 선택해 주세요.' },
        { status: 400 },
      );
    }

    const actor = await resolveOnboardingActor(request, body);
    if (!actor.ok) {
      return NextResponse.json({ error: actor.error }, { status: actor.status });
    }

    const synced = await upsertAppProfile(actor.admin, {
      id: actor.user.id,
      email: actor.email,
      name: actor.name,
      role: selectedRoles[0],
      roles: selectedRoles,
    });
    await actor.admin.auth.admin
      .updateUserById(actor.user.id, {
        user_metadata: {
          onboarding_complete: true,
          role: synced?.role ?? selectedRoles[0],
          roles: synced?.roles ?? selectedRoles,
          name: actor.name || undefined,
        },
      })
      .catch(() => null);
    if (!synced) {
      return NextResponse.json({ error: '프로필을 저장하지 못했습니다.' }, { status: 500 });
    }

    const response = NextResponse.json({
      data: {
        id: synced.id,
        email: synced.email,
        name: synced.name,
        role: synced.role,
        roles: synced.roles,
      },
    });
    applyAuthCookies(response.cookies, {
      present: true,
      roles: synced.roles,
      activeRole: selectedRoles[0],
    });
    return response;
  } catch (error) {
    console.warn('[SponsorAuction] 온보딩 역할 저장 예외', error);
    return NextResponse.json({ error: '프로필을 저장하지 못했습니다.' }, { status: 500 });
  }
}
