import { NextResponse } from 'next/server';
import {
  forbiddenJson,
  getPaymentActor,
  unauthorizedJson,
} from '@/lib/payments/guard';
import { mapPayout, PAYOUT_COLUMNS } from '@/lib/payouts';
import { createPaymentDbClient } from '@/lib/supabase/admin';
import { isSchemaMismatch } from '@/lib/supabase/errors';
import type { Database } from '@/types/database';

type PayoutRow = Database['public']['Tables']['payouts']['Row'];

export async function POST(request: Request) {
  try {
    const actor = await getPaymentActor();
    if (!actor) {
      return unauthorizedJson('정산을 처리하려면 로그인해 주세요.');
    }
    if (actor.role !== 'admin') {
      return forbiddenJson('지급 처리는 관리자만 할 수 있습니다.');
    }

    const body = (await request.json().catch(() => null)) as { id?: string } | null;
    const target = body?.id?.trim() ?? '';
    if (!target) {
      return NextResponse.json(
        { error: '정산 ID가 필요합니다.', fallbackMock: true },
        { status: 409 },
      );
    }

    const { client, usingServiceRole } = createPaymentDbClient();
    if (!client || !usingServiceRole) {
      return NextResponse.json({ fallbackMock: true }, { status: 409 });
    }

    const paidAt = new Date().toISOString();
    const auctionId = target.startsWith('auction:') ? target.slice('auction:'.length) : target;
    const attempts: Array<{ column: 'id' | 'payment_order_id' | 'auction_id'; value: string }> = [
      { column: 'id', value: target },
      { column: 'payment_order_id', value: target },
      { column: 'auction_id', value: auctionId },
    ];

    for (const attempt of attempts) {
      const payload = { status: 'paid' as const, paid_at: paidAt };
      const updated = await client
        .from('payouts')
        .update(payload)
        .eq(attempt.column, attempt.value)
        .eq('status', 'pending')
        .select(PAYOUT_COLUMNS)
        .maybeSingle();

      if (updated.error && isSchemaMismatch(updated.error)) {
        const core = await client
          .from('payouts')
          .update({ status: 'paid' })
          .eq(attempt.column, attempt.value)
          .eq('status', 'pending')
          .select('id, creator_id, creator_name, creator_email, amount, status, auction_title, requested_at')
          .maybeSingle();
        if (core.error && attempt.column !== 'id') {
          continue;
        }
        if (core.data) {
          const mapped = mapPayout(core.data as PayoutRow);
          return NextResponse.json({ data: mapped });
        }
        continue;
      }

      if (updated.error && attempt.column !== 'id') {
        continue;
      }
      if (updated.error) {
        console.error('[SponsorAuction] 관리자 정산 DB 저장 실패', updated.error);
        return NextResponse.json({ error: '지급 처리를 저장하지 못했습니다.' }, { status: 500 });
      }
      if (updated.data) {
        const mapped = mapPayout(updated.data as PayoutRow);
        return NextResponse.json({ data: mapped });
      }
    }

    return NextResponse.json({ fallbackMock: true }, { status: 409 });
  } catch (error) {
    console.error('[SponsorAuction] 관리자 정산 API 예외', error);
    return NextResponse.json({ error: '지급 처리를 저장하지 못했습니다.' }, { status: 500 });
  }
}
