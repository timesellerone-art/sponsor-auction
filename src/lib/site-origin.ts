export const PRODUCTION_SITE_HOST = 'www.clinkapp.kr';
export const PRODUCTION_SITE_ORIGIN = `https://${PRODUCTION_SITE_HOST}`;
export const PRODUCTION_COOKIE_DOMAIN = '.clinkapp.kr';

export function hostnameOf(value: string) {
  return value.split(',')[0].trim().split(':')[0].toLowerCase();
}

export function isProductionClinkHost(hostname: string) {
  const host = hostnameOf(hostname);
  return host === 'clinkapp.kr' || host === 'www.clinkapp.kr';
}

export function canonicalAppOrigin(originOrUrl: string) {
  try {
    const url = new URL(originOrUrl.includes('://') ? originOrUrl : `https://${originOrUrl}`);
    if (isProductionClinkHost(url.hostname)) {
      return PRODUCTION_SITE_ORIGIN;
    }
    return url.origin;
  } catch {
    return originOrUrl.replace(/\/$/, '');
  }
}

export function requestAppOrigin(request: Pick<Request, 'url' | 'headers'>) {
  const url = new URL(request.url);
  const forwardedHost =
    request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host;
  const host = forwardedHost.split(',')[0].trim();
  const forwardedProto = request.headers.get('x-forwarded-proto') || url.protocol.replace(':', '');
  const protocol = forwardedProto === 'http' ? 'http' : 'https';
  return canonicalAppOrigin(`${protocol}://${host}`);
}

export function authCookieDomain(hostname?: string | null) {
  const host =
    hostname ?? (typeof window !== 'undefined' ? window.location.hostname : '');
  if (isProductionClinkHost(host)) {
    return PRODUCTION_COOKIE_DOMAIN;
  }
  return undefined;
}

export function publicAppOrigin() {
  if (typeof window !== 'undefined') {
    return canonicalAppOrigin(window.location.origin);
  }
  const fromEnv = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    ''
  ).trim();
  if (fromEnv) {
    return canonicalAppOrigin(fromEnv);
  }
  return PRODUCTION_SITE_ORIGIN;
}

export function clientCookieSuffix() {
  const domain = authCookieDomain();
  const secure =
    typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
  const domainPart = domain ? `; Domain=${domain}` : '';
  return `; Path=/; SameSite=Lax${secure}${domainPart}`;
}
