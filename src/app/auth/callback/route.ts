import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { applyAuthCookies } from '@/lib/access';
import { ROLE_SELECT_PATH, postSocialAuthPath, sanitizeNextPath } from '@/lib/auth-guard';
import { createCookieBag, writeCookies } from '@/lib/auth-paths';
import { getSupabaseEnv } from '@/lib/supabase/env';
import { reconcileSocialIdentities } from '@/lib/auth-identity';
import {
  isMemberRole,
  needsRoleOnboarding,
  parseAuthRoles,
  primaryAuthRole,
  type SessionUser,
} from '@/types/auth';

function callbackOrigin(request: Request) {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto');
  if (forwardedHost) {
    return `${forwardedProto === 'http' ? 'http' : 'https'}://${forwardedHost}`;
  }
  return url.origin;
}

function loginRedirect(origin: string, oauthError?: string | null) {
  const login = new URL('/login', origin);
  if (oauthError && !/KOE205|invalid_scope/i.test(oauthError)) {
    login.searchParams.set('oauth_error', oauthError);
  }
  return NextResponse.redirect(login);
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const origin = callbackOrigin(request);
  const code = requestUrl.searchParams.get('code');
  const next = sanitizeNextPath(requestUrl.searchParams.get('next')) ?? ROLE_SELECT_PATH;
  const oauthError =
    requestUrl.searchParams.get('error_description') ||
    requestUrl.searchParams.get('error');

  if (oauthError) {
    return loginRedirect(origin, oauthError);
  }

  if (code) {
    const env = getSupabaseEnv();
    if (env) {
      const cookieBag = createCookieBag();
      const supabase = createServerClient(env.url, env.anonKey, {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => {
              request.cookies.set(name, value);
            });
            cookieBag.remember(cookiesToSet);
          },
        },
      });

      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        const { data: userData } = await supabase.auth.getUser();
        let authUser = userData.user;
        if (authUser) {
          const linked = await reconcileSocialIdentities(authUser);
          if (linked.switched && linked.tokenHash) {
            const verified = await supabase.auth.verifyOtp({
              token_hash: linked.tokenHash,
              type: 'magiclink',
            });
            if (verified.error) {
              console.warn(
                '[SponsorAuction] 통합 계정 세션 전환에 실패했습니다.',
                verified.error.message,
              );
            } else {
              authUser = verified.data.user ?? linked.user;
            }
          } else {
            authUser = linked.user;
          }
        }
        let sessionLike: SessionUser | null = null;
        if (authUser) {
          const profile = await supabase
            .from('profiles')
            .select('role, roles')
            .eq('id', authUser.id)
            .maybeSingle();
          const roles = parseAuthRoles(
            profile.data?.roles,
            profile.data?.role,
            authUser.user_metadata?.roles,
            authUser.user_metadata?.role,
          );
          sessionLike = {
            id: authUser.id,
            email: authUser.email?.includes('@')
              ? authUser.email
              : `user.${authUser.id.replace(/-/g, '').slice(0, 12)}@oauth.sponsor-auction.local`,
            name: '',
            role: primaryAuthRole(roles),
            roles,
            createdAt: authUser.created_at,
            lastSignInAt: authUser.last_sign_in_at,
            onboardingComplete: authUser.user_metadata?.onboarding_complete === true,
            currentMode: isMemberRole(authUser.user_metadata?.current_mode)
              ? authUser.user_metadata.current_mode
              : null,
          };
        }
        const destination = postSocialAuthPath(sessionLike, next, {
          needsOnboarding: needsRoleOnboarding(sessionLike),
        });
        const redirect = NextResponse.redirect(new URL(destination, origin));
        writeCookies(redirect.cookies, cookieBag.getAll());
        applyAuthCookies(redirect.cookies, {
          present: true,
          roles: destination === ROLE_SELECT_PATH ? [] : sessionLike?.roles,
          activeRole:
            destination === ROLE_SELECT_PATH
              ? null
              : sessionLike?.currentMode ?? sessionLike?.roles,
        });
        return redirect;
      }
      console.warn('[SponsorAuction] OAuth 코드 교환에 실패했습니다.', error.message);
    }

    const clientFallback = new URL('/auth/oauth', origin);
    requestUrl.searchParams.forEach((value, key) => {
      clientFallback.searchParams.set(key, value);
    });
    return NextResponse.redirect(clientFallback);
  }

  const clientFallback = new URL('/auth/oauth', origin);
  const nextParam = requestUrl.searchParams.get('next');
  if (nextParam) {
    clientFallback.searchParams.set('next', nextParam);
  }
  return NextResponse.redirect(clientFallback);
}
