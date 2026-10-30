import type { SupabaseClient, User } from '@supabase/supabase-js';
import { collectAuthEmails } from './auth-emails';
import { lookupUsersByContact } from './auth-lookup';
import { normalizeContactEmail, normalizePhone } from './contact';
import type { NaverProfile } from './naver-oauth';

type AdminClient = SupabaseClient;

export type NaverLinkResult = {
  user: User;
  merged: boolean;
  tokenHash: string | null;
};

let linkIdentityRpcAvailable = true;

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function naverIdsOf(user: User): string[] {
  return stringList(user.app_metadata?.naver_ids);
}

function uniqueUsers(users: User[]) {
  const seen = new Set<string>();
  return users.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

function pickCanonicalUser(users: User[]): User | null {
  const sorted = [...users].sort((left, right) => {
    const diff = Date.parse(left.created_at) - Date.parse(right.created_at);
    return Number.isFinite(diff) && diff !== 0 ? diff : left.id.localeCompare(right.id);
  });
  return sorted[0] ?? null;
}

function phonesOf(user: User): string[] {
  return [
    user.phone,
    typeof user.app_metadata?.contact_phone === 'string' ? user.app_metadata.contact_phone : '',
    typeof user.user_metadata?.phone === 'string' ? user.user_metadata.phone : '',
  ]
    .map((value) => normalizePhone(value))
    .filter(Boolean);
}

function identitySub(identity: {
  id?: string;
  identity_data?: Record<string, unknown> | null;
}) {
  const sub = identity.identity_data?.sub;
  return typeof sub === 'string' && sub.trim() ? sub.trim() : (identity.id?.trim() ?? '');
}

export function userHasNaverIdentity(user: User | null | undefined, naverId?: string | null) {
  if (!user) {
    return false;
  }
  const wanted = naverId?.trim() ?? '';
  return (user.identities ?? []).some((identity) => {
    if (identity.provider !== 'naver') {
      return false;
    }
    return (
      !wanted ||
      identitySub({
        id: identity.id,
        identity_data: (identity.identity_data ?? null) as Record<string, unknown> | null,
      }) === wanted
    );
  });
}

export function toE164Kr(phone: string | null | undefined) {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return '';
  }
  if (normalized.startsWith('0')) {
    return `+82${normalized.slice(1)}`;
  }
  return `+${normalized}`;
}

function adminRestEnv() {
  const url = (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ''
  )
    .trim()
    .replace(/\/$/, '');
  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    ''
  ).trim();
  return url && key.length >= 20 ? { url, key } : null;
}

async function attachNaverIdentity(admin: AdminClient, userId: string, profile: NaverProfile) {
  const email = normalizeContactEmail(profile.email) || null;
  if (linkIdentityRpcAvailable) {
    const linked = await admin.rpc('link_naver_identity', {
      p_user_id: userId,
      p_naver_id: profile.id,
      p_email: email,
      p_name: profile.name,
    });
    if (!linked.error) {
      return;
    }
    if (linked.error.code === 'PGRST202') {
      linkIdentityRpcAvailable = false;
    }
  }

  const env = adminRestEnv();
  if (!env) {
    return;
  }
  await fetch(`${env.url}/auth/v1/admin/users/${userId}/identities`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.key}`,
      apikey: env.key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      provider: 'naver',
      identity_data: {
        sub: profile.id,
        email: email ?? undefined,
        name: profile.name,
        email_verified: Boolean(email),
        iss: 'https://nid.naver.com',
        provider: 'naver',
      },
    }),
    cache: 'no-store',
  }).catch(() => undefined);
}

export async function findAccountForNaverProfile(
  admin: AdminClient,
  profile: Pick<NaverProfile, 'id' | 'email' | 'phone'>,
  excludeUserId?: string,
): Promise<User | null> {
  const { byNaver, byContact } = await collectNaverMatches(admin, profile);
  return pickCanonicalUser(
    uniqueUsers([...byNaver, ...byContact]).filter((item) => item.id !== excludeUserId),
  );
}

async function collectNaverMatches(
  admin: AdminClient,
  profile: Pick<NaverProfile, 'id' | 'email' | 'phone'>,
) {
  const email = normalizeContactEmail(profile.email);
  const phone = normalizePhone(profile.phone);
  const all = await lookupUsersByContact(admin, {
    emails: [email, profile.email, `naver.${profile.id}@oauth.sponsor-auction.local`],
    phone,
    naverId: profile.id,
  });
  const byNaver = all.filter(
    (item) => naverIdsOf(item).includes(profile.id) || userHasNaverIdentity(item, profile.id),
  );
  const byContact = all.filter((item) => {
    const contactEmail = normalizeContactEmail(
      typeof item.app_metadata?.contact_email === 'string' ? item.app_metadata.contact_email : '',
    );
    if (email && (collectAuthEmails(item).includes(email) || contactEmail === email)) {
      return true;
    }
    return Boolean(phone) && phonesOf(item).includes(phone);
  });

  return { byNaver, byContact };
}

async function stampNaverOnUser(admin: AdminClient, user: User, profile: NaverProfile) {
  const email = normalizeContactEmail(profile.email);
  const phone = normalizePhone(profile.phone) || null;
  const providers = [
    ...new Set([
      ...stringList(user.app_metadata?.providers),
      typeof user.app_metadata?.provider === 'string' ? user.app_metadata.provider : '',
      'naver',
    ]),
  ].filter(Boolean);
  const naverIds = [...new Set([...naverIdsOf(user), profile.id])];
  const e164 = toE164Kr(phone);
  const metadata = {
    user_metadata: {
      ...(user.user_metadata ?? {}),
      name: user.user_metadata?.name || profile.name,
      full_name: user.user_metadata?.full_name || profile.name,
      avatar_url: user.user_metadata?.avatar_url || profile.avatarUrl,
      naver_id: profile.id,
      phone: phone || user.user_metadata?.phone,
    },
    app_metadata: {
      providers,
      naver_ids: naverIds,
      contact_email:
        email ||
        (typeof user.app_metadata?.contact_email === 'string' ? user.app_metadata.contact_email : null),
      contact_phone: phone || user.app_metadata?.contact_phone || null,
    },
  };

  const patch: Record<string, string> = {};
  if (email) {
    patch.email = email;
  }
  if (phone) {
    patch.phone = phone;
  }
  if (profile.name && !user.user_metadata?.name) {
    patch.name = profile.name;
  }

  const metadataUpdate = (async () => {
    const withPhone = await admin.auth.admin.updateUserById(user.id, {
      ...metadata,
      ...(e164 ? { phone: e164 } : {}),
    });
    if (withPhone.error && e164) {
      return admin.auth.admin.updateUserById(user.id, metadata);
    }
    return withPhone;
  })();

  const profileUpdate = (async () => {
    if (Object.keys(patch).length === 0) {
      return;
    }
    const updated = await admin.from('profiles').update(patch).eq('id', user.id);
    if (updated.error && phone) {
      delete patch.phone;
      if (Object.keys(patch).length > 0) {
        await admin.from('profiles').update(patch).eq('id', user.id);
      }
    }
  })();

  const [stamped] = await Promise.all([
    metadataUpdate,
    attachNaverIdentity(admin, user.id, profile),
    profileUpdate,
  ]);

  return stamped.data.user ?? user;
}

async function defaultMerge(admin: AdminClient, incoming: User, canonical: User) {
  if (incoming.id === canonical.id) {
    return canonical;
  }
  const moved = await admin.rpc('merge_auth_identities', {
    p_from: incoming.id,
    p_to: canonical.id,
  });
  if (moved.error && moved.error.code !== 'PGRST202') {
    throw new Error(`identity 이전 실패: ${moved.error.message}`);
  }
  await Promise.all([
    admin.from('profiles').delete().eq('id', incoming.id),
    admin.auth.admin.deleteUser(incoming.id),
  ]);
  return canonical;
}

/**
 * 네이버 프로필의 이메일·전화번호가 기존 계정과 하나라도 같으면 새 auth.users를 만들지 않고
 * auth.identities에 naver를 붙인다. 중복 행이 있으면 merge_auth_identities로 합친다.
 */
export async function linkNaverProfile(
  admin: AdminClient,
  profile: NaverProfile,
  mergeUsers?: (incoming: User, canonical: User) => Promise<User>,
  prepareSession?: (email: string) => Promise<string | null>,
): Promise<NaverLinkResult> {
  const { byNaver, byContact } = await collectNaverMatches(admin, profile);
  const matches = uniqueUsers([...byNaver, ...byContact]);
  const canonical = pickCanonicalUser(matches);

  const mergeExtras = async (target: User) => {
    const extras = matches.filter((item) => item.id !== target.id);
    if (extras.length > 0) {
      await Promise.all(
        extras.map((extra) =>
          mergeUsers ? mergeUsers(extra, target) : defaultMerge(admin, extra, target),
        ),
      );
    }
    return stampNaverOnUser(admin, target, profile);
  };

  if (canonical) {
    const sessionEmail = collectAuthEmails(canonical)[0] ?? canonical.email ?? profile.email;
    const [user, tokenHash] = await Promise.all([
      mergeExtras(canonical),
      sessionEmail && prepareSession ? prepareSession(sessionEmail) : Promise.resolve(null),
    ]);
    return { user, merged: byContact.length > 0 || matches.length > 1, tokenHash };
  }

  const email = normalizeContactEmail(profile.email) || profile.email;
  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    phone: toE164Kr(profile.phone) || undefined,
    phone_confirm: Boolean(toE164Kr(profile.phone)),
    user_metadata: {
      name: profile.name,
      full_name: profile.name,
      avatar_url: profile.avatarUrl,
      provider: 'naver',
      naver_id: profile.id,
      phone: profile.phone,
    },
    app_metadata: {
      provider: 'naver',
      providers: ['naver'],
      naver_ids: [profile.id],
      contact_email: normalizeContactEmail(profile.email) || null,
      contact_phone: profile.phone,
    },
  });

  const incoming = created.data.user;
  if (!incoming) {
    const fallback = await findAccountForNaverProfile(admin, profile);
    if (!fallback) {
      throw new Error(created.error?.message || '네이버 계정으로 가입하지 못했습니다.');
    }
    const sessionEmail = collectAuthEmails(fallback)[0] ?? fallback.email ?? email;
    const [user, tokenHash] = await Promise.all([
      stampNaverOnUser(admin, fallback, profile),
      sessionEmail && prepareSession ? prepareSession(sessionEmail) : Promise.resolve(null),
    ]);
    return { user, merged: true, tokenHash };
  }

  const duplicate = await findAccountForNaverProfile(admin, profile, incoming.id);
  if (duplicate) {
    const merged = mergeUsers
      ? await mergeUsers(incoming, duplicate)
      : await defaultMerge(admin, incoming, duplicate);
    const sessionEmail = collectAuthEmails(merged)[0] ?? merged.email ?? email;
    const [user, tokenHash] = await Promise.all([
      stampNaverOnUser(admin, merged, profile),
      sessionEmail && prepareSession ? prepareSession(sessionEmail) : Promise.resolve(null),
    ]);
    return { user, merged: true, tokenHash };
  }

  const sessionEmail = collectAuthEmails(incoming)[0] ?? incoming.email ?? email;
  const [user, tokenHash] = await Promise.all([
    stampNaverOnUser(admin, incoming, profile),
    sessionEmail && prepareSession ? prepareSession(sessionEmail) : Promise.resolve(null),
  ]);
  return { user, merged: false, tokenHash };
}
