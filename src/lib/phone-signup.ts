import { isPlaceholderOAuthEmail } from '@/lib/contact';
import { isMemberRole, parseAuthRoles, type SessionUser } from '@/types/auth';

export const PHONE_ONBOARDING_PATH = '/onboarding';
export const EXISTING_ACCOUNT_NOTICE = 'existing_account';

const METHOD_LABELS: Record<string, string> = {
  google: '구글',
  kakao: '카카오',
  naver: '네이버',
  email: '이메일',
};

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function addMethod(found: Set<string>, provider: string | null | undefined) {
  const raw = (provider ?? '').trim().toLowerCase();
  if (!raw) {
    return;
  }
  if (raw === 'custom:naver' || raw === 'naver') {
    found.add('네이버');
    return;
  }
  const label = METHOD_LABELS[raw];
  if (label) {
    found.add(label);
  }
}

export function signupMethodLabels(user: {
  email?: string | null;
  identities?: Array<{ provider?: string | null }> | null;
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
}): string[] {
  const found = new Set<string>();
  for (const identity of user.identities ?? []) {
    addMethod(found, identity.provider);
  }
  addMethod(found, typeof user.app_metadata?.provider === 'string' ? user.app_metadata.provider : '');
  for (const provider of stringList(user.app_metadata?.providers)) {
    addMethod(found, provider);
  }
  for (const provider of stringList(user.user_metadata?.linked_providers)) {
    addMethod(found, provider);
  }
  if (!isPlaceholderOAuthEmail(user.email) && user.email?.includes('@')) {
    found.add('이메일');
  }
  found.delete('Phone');
  found.delete('phone');
  return found.size > 0 ? [...found] : ['이메일'];
}

export function existingAccountLoginMessage(methods: string[]) {
  const label = (methods.length > 0 ? methods : ['이메일']).join(', ');
  return `이미 ${label}로 가입된 회원입니다. 기존 계정으로 로그인해 주세요.`;
}

export function existingAccountLoginPath(message: string) {
  const params = new URLSearchParams();
  params.set('notice', EXISTING_ACCOUNT_NOTICE);
  params.set('message', message.slice(0, 300));
  return `/login?${params.toString()}`;
}

export function isProvisionalSignupUser(user: {
  user_metadata?: Record<string, unknown> | null;
  app_metadata?: Record<string, unknown> | null;
}): boolean {
  const roles = parseAuthRoles(user.user_metadata, user.app_metadata);
  if (roles.includes('admin') || roles.some(isMemberRole)) {
    return false;
  }
  if (user.user_metadata?.onboarding_complete === true) {
    return false;
  }
  if (user.user_metadata?.phone_verified === true) {
    return false;
  }
  return true;
}

export function needsPhoneOnboarding(source: unknown): boolean {
  if (!source || typeof source !== 'object') {
    return false;
  }
  const record = source as SessionUser & {
    phone_verified?: unknown;
    user_metadata?: { phone_verified?: unknown; onboarding_complete?: unknown } | null;
  };
  if (!record.id) {
    return false;
  }
  const roles = parseAuthRoles(source);
  if (roles.includes('admin') || roles.some(isMemberRole)) {
    return false;
  }
  if (
    record.phoneVerified === true ||
    record.phone_verified === true ||
    record.user_metadata?.phone_verified === true
  ) {
    return false;
  }
  if (record.onboardingComplete === true || record.user_metadata?.onboarding_complete === true) {
    return false;
  }
  return true;
}

