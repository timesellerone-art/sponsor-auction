import { rethrowPrerenderError } from '@/lib/prerender-error';
import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { createAuction } from '@/lib/auctions';
import {
  businessActionBlock,
  CAMPAIGN_BUSINESS_REQUIRED_MESSAGE,
} from '@/lib/business-registration';
import { isCampaignCategoryId } from '@/lib/campaign-presentation';
import {
  forbiddenJson,
  getPaymentActor,
  unauthorizedJson,
} from '@/lib/payments/guard';
import { isPlatformType } from '@/lib/platforms';
import { clientIp, consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { hasAuthRole } from '@/types/auth';
import type { PlatformType } from '@/types/auction';

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

function verificationForbidden() {
  return NextResponse.json(
    {
      error: CAMPAIGN_BUSINESS_REQUIRED_MESSAGE,
      errorCode: 'BUSINESS_VERIFICATION_REQUIRED',
      errorMessage: CAMPAIGN_BUSINESS_REQUIRED_MESSAGE,
    },
    { status: 403, headers: NO_STORE },
  );
}

export async function POST(request: Request) {
  try {
    try {
      await connection();
    } catch {
      // 등록은 계속합니다.
    }

    const actor = await getPaymentActor(request);
    if (!actor?.userId) {
      return unauthorizedJson('캠페인을 등록하려면 로그인해 주세요.');
    }
    if (!hasAuthRole(actor, 'advertiser') && !hasAuthRole(actor, 'admin')) {
      return forbiddenJson('캠페인 등록은 광고주만 할 수 있습니다.');
    }

    const limited = consumeRateLimit(clientIp(request), '/api/auctions');
    if (!limited.allowed) {
      return rateLimitResponse(limited.retryAfter);
    }

    const writer = createAdminClient() ?? (await createServerClient());
    if (!writer) {
      return verificationForbidden();
    }

    const business = await writer
      .from('profiles')
      .select('business_verification_status')
      .eq('id', actor.userId)
      .maybeSingle();
    if (business.error) {
      return verificationForbidden();
    }
    const blocked = businessActionBlock(
      business.data?.business_verification_status,
      'campaign',
    );
    if (blocked) {
      return NextResponse.json(
        {
          error: blocked,
          errorCode: 'BUSINESS_VERIFICATION_REQUIRED',
          errorMessage: blocked,
        },
        { status: 403, headers: NO_STORE },
      );
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const platformRaw = asText(body?.platform);
    const platform: PlatformType = isPlatformType(platformRaw) ? platformRaw : 'other';
    const categoryRaw = asText(body?.category);
    const result = await createAuction(
      {
        title: asText(body?.title),
        platform,
        category: isCampaignCategoryId(categoryRaw) ? categoryRaw : undefined,
        budget: asNumber(body?.budget),
        description: asText(body?.description),
        deadline: asText(body?.deadline),
        authorId: actor.userId,
        authorName: asText(body?.authorName) || '광고주',
        imageUrl: asText(body?.imageUrl) || null,
      },
      writer,
    );
    if (result.error || !result.data) {
      const message = result.error ?? '캠페인을 등록하지 못했습니다.';
      const forbidden = message === CAMPAIGN_BUSINESS_REQUIRED_MESSAGE;
      return NextResponse.json(
        {
          error: message,
          errorCode: forbidden ? 'BUSINESS_VERIFICATION_REQUIRED' : 'AUCTION_CREATE_FAILED',
          errorMessage: message,
        },
        { status: forbidden ? 403 : 400, headers: NO_STORE },
      );
    }
    return NextResponse.json({ data: result.data }, { headers: NO_STORE });
  } catch (error) {
    rethrowPrerenderError(error);
    const message =
      error instanceof Error ? error.message : '캠페인을 등록하지 못했습니다.';
    return NextResponse.json(
      { error: message, errorMessage: message },
      { status: 500, headers: NO_STORE },
    );
  }
}
