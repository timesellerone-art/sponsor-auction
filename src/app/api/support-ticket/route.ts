import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { getApiAuthUser } from '@/lib/auth-api-user';
import { isValidContactEmail } from '@/lib/contact';
import { clientIp, consumeKeyedRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSupportTicketCategory } from '@/lib/support-knowledge';

const TICKET_BODY_MAX = 2000;
const TICKET_RATE_LIMIT = 8;

export async function POST(request: Request) {
  try {
    await connection();
  } catch {
    // 동적 렌더 힌트가 실패해도 접수는 계속합니다.
  }

  const limited = consumeKeyedRateLimit(`support-ticket:${clientIp(request)}`, TICKET_RATE_LIMIT);
  if (!limited.allowed) {
    return rateLimitResponse(limited.retryAfter);
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const category = typeof body?.category === 'string' ? body.category.trim() : '';
  const message = typeof body?.message === 'string' ? body.message.trim() : '';

  if (!name || name.length > 80) {
    return NextResponse.json({ error: '이름을 확인해 주세요.' }, { status: 400 });
  }
  if (!isValidContactEmail(email)) {
    return NextResponse.json({ error: '이메일을 확인해 주세요.' }, { status: 400 });
  }
  if (!isSupportTicketCategory(category)) {
    return NextResponse.json({ error: '문의 유형을 선택해 주세요.' }, { status: 400 });
  }
  if (!message || message.length < 8) {
    return NextResponse.json({ error: '문의 내용을 조금 더 구체적으로 적어 주세요.' }, { status: 400 });
  }
  if (message.length > TICKET_BODY_MAX) {
    return NextResponse.json(
      { error: `문의 내용은 ${TICKET_BODY_MAX}자까지 보낼 수 있습니다.` },
      { status: 400 },
    );
  }

  const actor = await getApiAuthUser(request);
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: '지금은 접수를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 503 },
    );
  }

  const inserted = await admin
    .from('support_tickets')
    .insert({
      name,
      email,
      category,
      message: message.slice(0, TICKET_BODY_MAX),
      user_id: actor.user?.id ?? null,
    })
    .select('id')
    .maybeSingle();

  if (inserted.error || !inserted.data?.id) {
    console.warn('[Clink] 1:1 문의 저장 실패', inserted.error?.message);
    return NextResponse.json(
      { error: '문의를 저장하지 못했습니다. 잠시 후 다시 시도하거나 고객센터 이메일로 보내 주세요.' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    id: inserted.data.id,
    reply: `문의가 접수되었습니다. 접수번호는 ${inserted.data.id.slice(0, 8)}입니다.`,
  });
}
