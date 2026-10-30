import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { applyAuthCookies } from '@/lib/access';
import { collectAuthEmails } from '@/lib/auth-emails';
import {
  AccountMergeUnavailableError,
  findExistingAccountByContact,
  generateMagicLinkHash,
  mergeUserInto,
} from '@/lib/auth-identity';
import { LEGACY_PENDING_MERGE_COOKIE } from '@/lib/auth-paths';
import {
  isPlaceholderOAuthEmail,
  isValidContactEmail,
  isValidPhone,
  normalizeContactEmail,
  normalizePhone,
} from '@/lib/contact';
import { parseOnboardingRoles, resolveOnboardingActor, type OnboardingBody } from '@/lib/onboarding';
import { upsertAppProfile } from '@/lib/supabase/profile-sync';
import {
  MEMBER_ROLES,
  isMemberRole,
  parseAuthRoles,
  primaryAuthRole,
  type AuthProfileRole,
} from '@/types/auth';

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

    const ownEmail = isPlaceholderOAuthEmail(actor.user.email)
      ? ''
      : normalizeContactEmail(actor.user.email);
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

    let profileId = actor.user.id;
    let profileEmail = contactEmail;
    let profileName = actor.name;
    let profileRole: AuthProfileRole | null = selectedRoles[0];
    let profileRoles: AuthProfileRole[] = [...new Set([...MEMBER_ROLES, ...selectedRoles])];
    let currentMode = selectedRoles[0];
    let sessionSwitch: { tokenHash: string } | undefined;

    if (existing) {
      const merged = await mergeUserInto(actor.user, existing, {
        roles: selectedRoles,
        phone,
      });
      const tokenHash = await generateMagicLinkHash(actor.admin, merged);
      if (!tokenHash) {
        return NextResponse.json(
          {
            error:
              '계정을 통합했지만 세션을 전환하지 못했습니다. 기존 계정으로 다시 로그인해 주세요.',
          },
          { status: 500 },
        );
      }
      sessionSwitch = { tokenHash };

      const stored = await actor.admin
        .from('profiles')
        .select('id, email, name, role, roles')
        .eq('id', merged.id)
        .maybeSingle();
      profileId = stored.data?.id ?? merged.id;
      profileEmail = stored.data?.email ?? collectAuthEmails(merged)[0] ?? contactEmail;
      profileName = stored.data?.name ?? actor.name;
      profileRoles = parseAuthRoles(stored.data?.roles, stored.data?.role, merged.user_metadata);
      profileRole = stored.data?.role ?? primaryAuthRole(profileRoles);
      const storedMode = merged.user_metadata?.current_mode;
      currentMode = isMemberRole(storedMode)
        ? storedMode
        : (profileRoles.find(isMemberRole) ?? selectedRoles[0]);
    } else {
      const synced = await upsertAppProfile(actor.admin, {
        id: actor.user.id,
        email: contactEmail,
        name: actor.name,
        phone,
        role: selectedRoles[0],
        roles: profileRoles,
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
        app_metadata: {
          contact_email: contactEmail,
          contact_phone: phone,
        },
      });
      if (updated.error) {
        console.warn('[SponsorAuction] 온보딩 메타데이터 저장 실패', updated.error.message);
      }

      profileId = synced.id;
      profileEmail = synced.email;
      profileName = synced.name;
      profileRole = synced.role;
      profileRoles = synced.roles;
    }

    const response = NextResponse.json({
      data: {
        id: profileId,
        email: profileEmail,
        name: profileName,
        role: profileRole,
        roles: profileRoles,
        currentMode,
      },
      sessionSwitch,
    });
    response.cookies.delete(LEGACY_PENDING_MERGE_COOKIE);
    applyAuthCookies(response.cookies, {
      present: true,
      roles: profileRoles,
      activeRole: currentMode,
    });
    return response;
  } catch (error) {
    if (error instanceof AccountMergeUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error('[SponsorAuction] 온보딩 역할 저장 예외', error);
    return NextResponse.json({ error: '프로필을 저장하지 못했습니다.' }, { status: 500 });
  }
}
