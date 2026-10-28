import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { applyAuthCookies } from '@/lib/access';
import {
  PENDING_MERGE_COOKIE,
  PENDING_MERGE_TTL_SECONDS,
  findExistingAccountByContact,
  maskEmail,
  proofProvidersOf,
  requestPendingMerge,
} from '@/lib/auth-identity';
import {
  isPlaceholderOAuthEmail,
  isValidContactEmail,
  isValidPhone,
  normalizeContactEmail,
  normalizePhone,
} from '@/lib/contact';
import { parseOnboardingRoles, resolveOnboardingActor, type OnboardingBody } from '@/lib/onboarding';
import { upsertAppProfile } from '@/lib/supabase/profile-sync';
import { MEMBER_ROLES, type AccountMergeChallenge } from '@/types/auth';

export async function POST(request: Request) {
  try {
    await connection();

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

    const ownEmail = isPlaceholderOAuthEmail(actor.user.email) ? '' : normalizeContactEmail(actor.user.email);
    const typedEmail = body?.email?.trim() ?? '';
    if (typedEmail && !isValidContactEmail(typedEmail)) {
      return NextResponse.json({ error: '대표 이메일 형식을 확인해 주세요.' }, { status: 400 });
    }
    const contactEmail = normalizeContactEmail(typedEmail) || ownEmail;
    if (!contactEmail) {
      return NextResponse.json({ error: '대표 이메일을 입력해 주세요.' }, { status: 400 });
    }
    if (body?.phone?.trim() && !isValidPhone(body.phone)) {
      return NextResponse.json({ error: '전화번호 형식을 확인해 주세요.' }, { status: 400 });
    }
    const phone = normalizePhone(body?.phone) || null;

    const existing = await findExistingAccountByContact({
      email: contactEmail,
      phone,
      excludeUserId: actor.user.id,
    });

    if (existing) {
      const providers = proofProvidersOf(existing, contactEmail);
      if (providers.length === 0) {
        return NextResponse.json(
          { error: '기존 계정의 로그인 수단을 확인할 수 없어 통합할 수 없습니다. 고객센터로 문의해 주세요.' },
          { status: 409 },
        );
      }
      await requestPendingMerge(actor.user, existing, { roles: selectedRoles, phone });
      const challenge: AccountMergeChallenge = {
        maskedEmail: maskEmail(existing.email),
        providers,
      };
      const response = NextResponse.json({ mergeRequired: challenge }, { status: 409 });
      response.cookies.set(PENDING_MERGE_COOKIE, actor.user.id, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: PENDING_MERGE_TTL_SECONDS,
      });
      return response;
    }

    const memberRoles = [...new Set([...MEMBER_ROLES, ...selectedRoles])];
    const synced = await upsertAppProfile(actor.admin, {
      id: actor.user.id,
      email: contactEmail,
      name: actor.name,
      phone,
      role: selectedRoles[0],
      roles: memberRoles,
    });
    if (!synced) {
      return NextResponse.json({ error: '프로필을 저장하지 못했습니다.' }, { status: 500 });
    }

    const updated = await actor.admin.auth.admin.updateUserById(actor.user.id, {
      user_metadata: {
        onboarding_complete: true,
        role: synced.role ?? selectedRoles[0],
        roles: synced.roles,
        name: actor.name || undefined,
        contact_email: contactEmail,
        phone,
        current_mode: selectedRoles[0],
      },
    });
    if (updated.error) {
      console.warn('[SponsorAuction] 온보딩 메타데이터 저장 실패', updated.error.message);
    }

    const response = NextResponse.json({
      data: {
        id: synced.id,
        email: synced.email,
        name: synced.name,
        role: synced.role,
        roles: synced.roles,
        currentMode: selectedRoles[0],
      },
    });
    response.cookies.delete(PENDING_MERGE_COOKIE);
    applyAuthCookies(response.cookies, {
      present: true,
      roles: synced.roles,
      activeRole: selectedRoles[0],
    });
    return response;
  } catch (error) {
    console.error('[SponsorAuction] 온보딩 역할 저장 예외', error);
    return NextResponse.json({ error: '프로필을 저장하지 못했습니다.' }, { status: 500 });
  }
}
