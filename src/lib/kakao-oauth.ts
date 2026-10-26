const KAKAO_BLOCKED_SCOPE_RE =
  /email|account_ci|phone_number|gender|age_range|birthday|birthyear|talk_message|^friends$/i;

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
  return value === 'account_email' || KAKAO_BLOCKED_SCOPE_RE.test(value);
}

export function sanitizeKakaoScopes(scopes: string[]) {
  return scopes.filter((scope) => !isKakaoBlockedScope(scope));
}

/** KOE205 방지: account_email 등 미승인 스코프만 제거하고 새 스코프는 넣지 않습니다. */
export function sanitizeKakaoAuthorizeUrl(
  url: string,
  supabaseCallbackUrl?: string | null,
): string {
  try {
    const parsed = new URL(url);
    if (supabaseCallbackUrl && parsed.hostname.includes('kakao.com')) {
      parsed.searchParams.set('redirect_uri', supabaseCallbackUrl);
    }

    const allowed = sanitizeKakaoScopes(parseOAuthScopes(parsed.searchParams.get('scope')));
    if (allowed.length > 0) {
      parsed.searchParams.set('scope', allowed.join(' '));
    } else {
      parsed.searchParams.delete('scope');
    }

    return parsed.toString();
  } catch {
    return url;
  }
}
