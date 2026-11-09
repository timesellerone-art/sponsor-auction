import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { createBid, getAuctionById } from '@/lib/auctions';
import { isCampaignAuthor } from '@/lib/my-campaigns';
import { VALIDATION } from '@/lib/validation';
import {
  forbiddenJson,
  getPaymentActor,
  unauthorizedJson,
} from '@/lib/payments/guard';
import { createClient } from '@/lib/supabase/server';
import { hasAuthRole } from '@/types/auth';
import { recordBypassIfNeeded } from '@/lib/compliance';
import { validateBypassContent } from '@/lib/moderation/bypassFilter';
import { OffPlatformContactError } from '@/utils/filter';

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
} as const;

function asText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function asNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
}

export async function POST(request: Request) {
  try {
    try {
      await connection();
    } catch {
      // 동적 렌더 힌트가 실패해도 제안 등록은 계속합니다.
    }

    const actor = await getPaymentActor();
    if (!actor) {
      return unauthorizedJson('제안을 등록하려면 로그인해 주세요.');
    }
    if (!hasAuthRole(actor, 'creator') && !hasAuthRole(actor, 'admin')) {
      return forbiddenJson('제안 등록은 크리에이터만 할 수 있습니다.');
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const auctionId = asText(body?.auctionId);
    const proposalText = asText(body?.proposalText);
    const creatorChannelUrl = asText(body?.creatorChannelUrl);
    const creatorName = asText(body?.creatorName);
    if (!auctionId) {
      return NextResponse.json(
        { error: '경매 ID가 필요합니다.', errorMessage: '경매 ID가 필요합니다.' },
        { status: 400, headers: NO_STORE },
      );
    }

    const auctionResult = await getAuctionById(auctionId);
    const bidderId = actor.userId || asText(body?.creatorId);
    if (auctionResult.data && isCampaignAuthor(auctionResult.data, bidderId)) {
      return NextResponse.json(
        {
          error: VALIDATION.selfCampaignBid,
          errorMessage: VALIDATION.selfCampaignBid,
          errorCode: 'SELF_CAMPAIGN_BID',
        },
        { status: 400, headers: NO_STORE },
      );
    }
    await recordBypassIfNeeded({
      text: proposalText,
      source: 'bid',
      actorId: actor.userId,
      auctionId,
    });
    const proposalCheck = validateBypassContent(proposalText);
    const channelCheck = validateBypassContent(creatorChannelUrl, { allowPortfolioUrl: true });
    const nameCheck = validateBypassContent(creatorName);
    const bypassCheck = [proposalCheck, channelCheck, nameCheck].find((item) => !item.isValid);
    if (bypassCheck) {
      const message = bypassCheck.reason ?? VALIDATION.offPlatformContact;
      return NextResponse.json(
        { error: message, errorMessage: message, errorCode: 'OFF_PLATFORM_CONTACT' },
        { status: 400, headers: NO_STORE },
      );
    }

    const supabase = await createClient();
    const result = await createBid(
      {
        auctionId,
        creatorId: (actor.userId ?? asText(body?.creatorId)) || null,
        creatorName: asText(body?.creatorName) || '크리에이터',
        creatorChannelUrl,
        bidAmount: asNumber(body?.bidAmount),
        proposalText,
        creatorEmail: asText(body?.creatorEmail),
        bankAccount: asText(body?.bankAccount),
      },
      { client: supabase },
    );

    if (result.error || !result.data) {
      const message = result.error ?? '제안을 등록하지 못했습니다.';
      return NextResponse.json(
        { error: message, errorMessage: message },
        { status: 400, headers: NO_STORE },
      );
    }

    return NextResponse.json({ data: result.data }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof OffPlatformContactError) {
      return NextResponse.json(
        {
          error: error.message,
          errorMessage: error.message,
          errorCode: 'OFF_PLATFORM_CONTACT',
        },
        { status: 400, headers: NO_STORE },
      );
    }
    const message =
      error instanceof Error ? error.message : '제안을 등록하지 못했습니다.';
    return NextResponse.json(
      { error: message, errorMessage: message },
      { status: 500, headers: NO_STORE },
    );
  }
}
