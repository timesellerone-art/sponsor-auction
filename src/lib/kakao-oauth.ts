const KAKAO_BLOCKED_SCOPE_RE =
  /account_ci|account_email|^email$|phone_number|gender|age_range|birthday|birthyear|talk_message|^friends$/i;

export const KAKAO_EMAIL_SCOPE = 'account_email';
export const KAKAO_PROFILE_SCOPES = ['profile_nickname', 'profile_image'] as const;

export function normalizeKakaoScope(scope: string) {
  const value = scope.trim();
  if (value === 'email') {
    return KAKAO_EMAIL_SCOPE;
  }
  return value;
}

export function kakaoOAuthScopesOption() {
  return KAKAO_PROFILE_SCOPES.join(',');
}

export function kakaoOAuthScopeQuery() {
  return KAKAO_PROFILE_SCOPES.join(' ');
}

export function parseOAuthScopes(raw: string | null | undefined): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(/[+\s,]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function isKakaoBlockedScope(scope: string) {
  const value = scope.trim();
  if (!value) {
    return true;
  }
  return KAKAO_BLOCKED_SCOPE_RE.test(value);
}

export function sanitizeKakaoScopes(scopes: string[]) {
  const allowed = new Set<string>(KAKAO_PROFILE_SCOPES);
  const kept: string[] = [];
  for (const scope of scopes) {
    const normalized = normalizeKakaoScope(scope);
    if (!normalized || !allowed.has(normalized) || isKakaoBlockedScope(normalized)) {
      continue;
    }
    if (!kept.includes(normalized)) {
      kept.push(normalized);
    }
  }
  return kept;
}

/** 카카오 인가에는 닉네임·프로필만 보냅니다. account_email은 미동의 앱에서 invalid_scope가 됩니다. */
export function sanitizeKakaoAuthorizeUrl(
  url: string,
  supabaseCallbackUrl?: string | null,
): string {
  try {
    const parsed = new URL(url);
    if (supabaseCallbackUrl && parsed.hostname.includes('kakao.com')) {
      parsed.searchParams.set('redirect_uri', supabaseCallbackUrl);
    }

    const kept = sanitizeKakaoScopes(parseOAuthScopes(parsed.searchParams.get('scope')));
    parsed.searchParams.set('scope', (kept.length > 0 ? kept : [...KAKAO_PROFILE_SCOPES]).join(' '));
    return parsed.toString();
  } catch {
    return url;
  }
}
