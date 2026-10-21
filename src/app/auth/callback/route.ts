import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { applyAuthCookies } from '@/lib/access';
import { ROLE_SELECT_PATH, postSocialAuthPath, sanitizeNextPath } from '@/lib/auth-guard';
import { getSupabaseEnv } from '@/lib/supabase/env';
import {
  isFirstAuthSignIn,
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

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const origin = callbackOrigin(request);
  const code = requestUrl.searchParams.get('code');
  const next = sanitizeNextPath(requestUrl.searchParams.get('next')) ?? ROLE_SELECT_PATH;
  const oauthError =
    requestUrl.searchParams.get('error_description') ||
    requestUrl.searchParams.get('error');

  if (oauthError) {
    const login = new URL('/login', origin);
    login.searchParams.set('reason', 'auth-required');
    return NextResponse.redirect(login);
  }

  if (code) {
    const env = getSupabaseEnv();
    if (env) {
      const successRedirect = NextResponse.redirect(new URL(next, origin));
      const supabase = createServerClient(env.url, env.anonKey, {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              request.cookies.set(name, value);
              successRedirect.cookies.set(name, value, options);
            });
          },
        },
      });

      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        const { data: userData } = await supabase.auth.getUser();
        const authUser = userData.user;
        let sessionLike: SessionUser | null = null;
        if (authUser) {
          const profile = await supabase
            .from('profiles')
            .select('role, roles')
            .eq('id', authUser.id)
            .maybeSingle();
          const roles = parseAuthRoles(profile.data?.roles, profile.data?.role);
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
          };
          if (
            needsRoleOnboarding(sessionLike) &&
            roles.length > 0 &&
            !roles.includes('admin') &&
            isFirstAuthSignIn(authUser)
          ) {
            await supabase
              .from('profiles')
              .update({ role: null, roles: [] })
              .eq('id', authUser.id);
            sessionLike = { ...sessionLike, role: null, roles: [] };
          }
        }
        const destination = postSocialAuthPath(sessionLike, next, {
          needsOnboarding: needsRoleOnboarding(sessionLike),
        });
        const redirect = NextResponse.redirect(new URL(destination, origin));
        successRedirect.cookies.getAll().forEach((cookie) => {
          redirect.cookies.set(cookie.name, cookie.value);
        });
        applyAuthCookies(redirect.cookies, {
          present: true,
          roles: destination === ROLE_SELECT_PATH ? [] : sessionLike?.roles,
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
