import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { naverIdpUserInfo, readNaverIdpTicket } from '@/lib/naver-idp';

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function GET(request: Request) {
  try {
    await connection();
    const auth = request.headers.get('authorization') ?? '';
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    const ticket = readNaverIdpTicket(token);
    if (!ticket) {
      return json(401, { error: 'invalid_token' });
    }
    return json(200, naverIdpUserInfo(ticket));
  } catch (error) {
    console.warn('[SponsorAuction] 네이버 IdP userinfo 실패', error);
    return json(500, { error: 'server_error' });
  }
}
