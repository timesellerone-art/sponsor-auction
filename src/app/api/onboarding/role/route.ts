import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { applyAuthCookies } from '@/lib/access';
import {
  findExistingAccountByContact,
  isKakaoProviderUser,
  linkIncomingSocialUser,
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
import { MEMBER_ROLES, isMemberRole, parseAuthRoles, primaryAuthRole } from '@/types/auth';

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

    const contactEmail =
      normalizeContactEmail(body?.email) ||
      (isPlaceholderOAuthEmail(actor.email) ? '' : normalizeContactEmail(actor.email));
    const phone = normalizePhone(body?.phone);
    const needsContact =
      isKakaoProviderUser(actor.user) && isPlaceholderOAuthEmail(actor.email);

    if (needsContact) {
      if (!isValidContactEmail(contactEmail)) {
        return NextResponse.json(
          { error: '계정 통합을 위해 이메일을 입력해 주세요.' },
          { status: 400 },
        );
      }
      if (body?.phone?.trim() && !isValidPhone(body.phone)) {
        return NextResponse.json(
          { error: '전화번호 형식을 확인해 주세요.' },
          { status: 400 },
        );
      }

      const existing = await findExistingAccountByContact({
        email: contactEmail,
        phone,
        excludeUserId: actor.user.id,
      });
      if (existing) {
        const existingProfile = await actor.admin
          .from('profiles')
          .select('role, roles')
          .eq('id', existing.id)
          .maybeSingle();
        const mergedRoles = parseAuthRoles(
          existingProfile.data?.roles,
          existingProfile.data?.role,
          existing.user_metadata?.roles,
          selectedRoles,
          MEMBER_ROLES,
        );
        const linked = await linkIncomingSocialUser(actor.user, existing, {
          phone: phone || null,
          roles: mergedRoles,
        });
        const synced = await upsertAppProfile(actor.admin, {
          id: linked.user.id,
          email: contactEmail || linked.user.email,
          name: actor.name,
          phone: phone || null,
          roles: mergedRoles,
          role: primaryAuthRole(mergedRoles),
        });
        if (!synced) {
          return NextResponse.json({ error: '계정 연결에 실패했습니다.' }, { status: 500 });
        }
        const storedMode = existing.user_metadata?.current_mode;
        const activeRole =
          (isMemberRole(storedMode) && mergedRoles.includes(storedMode)
            ? storedMode
            : primaryAuthRole(mergedRoles)) ?? selectedRoles[0];
        const response = NextResponse.json({
          data: {
            id: synced.id,
            email: synced.email,
            name: synced.name,
            role: synced.role,
            roles: synced.roles,
            currentMode: activeRole,
          },
          tokenHash: linked.tokenHash,
          linked: true,
        });
        applyAuthCookies(response.cookies, {
          present: true,
          roles: synced.roles,
          activeRole,
        });
        return response;
      }
    }

    const email = contactEmail || actor.email;
    const memberRoles = [...new Set([...MEMBER_ROLES, ...selectedRoles])];
    const synced = await upsertAppProfile(actor.admin, {
      id: actor.user.id,
      email,
      name: actor.name,
      phone: phone || null,
      role: selectedRoles[0],
      roles: memberRoles,
    });
    await actor.admin.auth.admin
      .updateUserById(actor.user.id, {
        email: contactEmail || undefined,
        email_confirm: Boolean(contactEmail),
        phone: phone || undefined,
        user_metadata: {
          onboarding_complete: true,
          role: synced?.role ?? selectedRoles[0],
          roles: synced?.roles ?? memberRoles,
          name: actor.name || undefined,
          phone: phone || null,
          current_mode: selectedRoles[0],
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
        currentMode: selectedRoles[0],
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
