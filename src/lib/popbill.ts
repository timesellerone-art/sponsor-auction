import 'server-only';

import { describeSettlementTax } from '@/lib/tax';
import { createAdminClient } from '@/lib/supabase/admin';

export type TaxInvoiceIssueInput = {
  payoutId?: string | null;
  paymentOrderId?: string | null;
  auctionId?: string | null;
  bidId?: string | null;
  bidAmount: number;
  buyerName?: string;
  buyerEmail?: string;
  itemName?: string;
};

export type TaxInvoiceIssueResult = {
  ok: boolean;
  fallback: boolean;
  status: 'issued' | 'fallback' | 'error';
  mgtKey: string;
  message: string;
};

type FallbackLog = TaxInvoiceIssueResult & {
  createdAt: string;
  input: TaxInvoiceIssueInput;
  supplyAmount: number;
  vatAmount: number;
  withholdingAmount: number;
  netPayout: number;
};

const fallbackLogs: FallbackLog[] = [];

function popbillSecret() {
  return (
    process.env.POPBILL_SECRECT_KEY ||
    process.env.POPBILL_SECRET_KEY ||
    process.env.POPBILL_API_SECRET ||
    ''
  ).trim();
}

function popbillLinkId() {
  return (process.env.POPBILL_LINK_ID || process.env.POPBILL_LINKID || '').trim();
}

function makeMgtKey(input: TaxInvoiceIssueInput) {
  const orderId = input.paymentOrderId?.trim() || '';
  const seed = (orderId || input.payoutId || input.auctionId || 'tax').replace(
    /[^a-zA-Z0-9_-]/g,
    '',
  );
  if (orderId) {
    return `SA-${seed}`.slice(0, 24);
  }
  return `SA-${seed.slice(0, 20)}-${Date.now().toString(36)}`.slice(0, 24);
}

async function persistFallbackLog(log: FallbackLog) {
  fallbackLogs.push(log);
  if (fallbackLogs.length > 200) {
    fallbackLogs.shift();
  }

  const client = createAdminClient();
  if (!client) {
    console.info('[SponsorAuction] 세금계산서 fallback 로그 (메모리)', {
      mgtKey: log.mgtKey,
      status: log.status,
    });
    return;
  }

  try {
    const { error } = await client.from('tax_invoice_logs').insert({
      payout_id: log.input.payoutId || null,
      payment_order_id: log.input.paymentOrderId?.trim() || null,
      auction_id: log.input.auctionId || null,
      bid_id: log.input.bidId || null,
      supply_amount: log.supplyAmount,
      vat_amount: log.vatAmount,
      withholding_amount: log.withholdingAmount,
      net_payout: log.netPayout,
      status: log.status,
      provider: 'popbill',
      mgt_key: log.mgtKey,
      payload: {
        message: log.message,
        fallback: log.fallback,
        buyerName: log.input.buyerName || '',
        itemName: log.input.itemName || '',
      },
    });
    if (error) {
      if (error.code === '23505') {
        return;
      }
      console.warn('[SponsorAuction] tax_invoice_logs 저장 실패, 메모리만 유지', error.message);
    }
  } catch (error) {
    console.warn('[SponsorAuction] tax_invoice_logs 저장 예외', error);
  }
}

export function getFallbackTaxInvoiceLogs() {
  return [...fallbackLogs];
}

export async function issueTaxInvoice(
  input: TaxInvoiceIssueInput,
): Promise<TaxInvoiceIssueResult> {
  const tax = describeSettlementTax(input.bidAmount);
  const mgtKey = makeMgtKey(input);
  const secret = popbillSecret();
  const linkId = popbillLinkId();

  const baseLog = {
    createdAt: new Date().toISOString(),
    input,
    supplyAmount: tax.advertiser.supplyAmount,
    vatAmount: tax.advertiser.vatAmount,
    withholdingAmount: tax.creator.withholdingAmount,
    netPayout: tax.creator.netPayout,
    mgtKey,
  };

  const client = createAdminClient();
  const paymentOrderId = input.paymentOrderId?.trim() || '';
  if (client && paymentOrderId) {
    try {
      const existing = await client
        .from('tax_invoice_logs')
        .select('mgt_key, status')
        .eq('payment_order_id', paymentOrderId)
        .limit(1)
        .maybeSingle();
      if (existing.data?.mgt_key) {
        return {
          ok: true,
          fallback: existing.data.status !== 'issued',
          status: existing.data.status === 'issued' ? 'issued' : 'fallback',
          mgtKey: existing.data.mgt_key,
          message: '이미 신청된 세금계산서 기록을 재사용합니다.',
        };
      }
    } catch {
      // 중복 조회 실패 시 신규 발행을 진행합니다.
    }
  }

  if (!secret) {
    const result: TaxInvoiceIssueResult = {
      ok: true,
      fallback: true,
      status: 'fallback',
      mgtKey,
      message: 'POPBILL_SECRECT_KEY가 없어 세금계산서를 임시 기록으로 우회했습니다.',
    };
    console.info('[SponsorAuction] 팝빌 키 없음, 세금계산서 fallback', {
      mgtKey,
      supplyAmount: tax.advertiser.supplyAmount,
      vatAmount: tax.advertiser.vatAmount,
      withholdingAmount: tax.creator.withholdingAmount,
      netPayout: tax.creator.netPayout,
    });
    await persistFallbackLog({ ...baseLog, ...result });
    return result;
  }

  try {
    const endpoint =
      process.env.POPBILL_TAXINVOICE_URL ||
      'https://popbill.linkhub.co.kr';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
        'x-pb-linkid': linkId,
      },
      body: JSON.stringify({
        mgtKey,
        invoicerCorpName: 'SponsorAuction',
        invoiceeCorpName: input.buyerName || '광고주',
        invoiceeEmail: input.buyerEmail || '',
        supplyCostTotal: String(tax.advertiser.supplyAmount),
        taxTotal: String(tax.advertiser.vatAmount),
        totalAmount: String(tax.advertiser.totalAmount),
        itemName: input.itemName || '스폰서십 캠페인',
        remark1: `withholding=${tax.creator.withholdingAmount}`,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`팝빌 응답 ${response.status} ${text.slice(0, 180)}`);
    }

    const result: TaxInvoiceIssueResult = {
      ok: true,
      fallback: false,
      status: 'issued',
      mgtKey,
      message: '팝빌 세금계산서 발행 요청을 완료했습니다.',
    };
    await persistFallbackLog({ ...baseLog, ...result });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    console.warn('[SponsorAuction] 팝빌 발행 실패, fallback 기록', message);
    const result: TaxInvoiceIssueResult = {
      ok: true,
      fallback: true,
      status: 'fallback',
      mgtKey,
      message: `팝빌 발행 실패로 임시 기록: ${message}`,
    };
    await persistFallbackLog({ ...baseLog, ...result });
    return result;
  }
}
