import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { readNaverIdpTicket } from '@/lib/naver-idp';

export const preferredRegion = 'icn1';

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

async function readCode(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const payload = (await request.json().catch(() => null)) as { code?: string } | null;
    return payload?.code?.trim() ?? '';
  }
  const text = await request.text();
  return new URLSearchParams(text).get('code')?.trim() ?? '';
}

export async function POST(request: Request) {
  try {
    await connection();
    const code = await readCode(request);
    const ticket = readNaverIdpTicket(code);
    if (!ticket) {
      return json(400, { error: 'invalid_grant', error_description: '만료되었거나 잘못된 코드입니다.' });
    }
    return json(200, {
      access_token: code,
      token_type: 'bearer',
      expires_in: Math.max(1, Math.floor((ticket.exp - Date.now()) / 1000)),
    });
  } catch (error) {
    console.warn('[SponsorAuction] 네이버 IdP token 실패', error);
    return json(500, { error: 'server_error' });
  }
}
