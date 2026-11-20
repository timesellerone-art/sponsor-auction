'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { authRequestInit } from '@/lib/auth-request';
import {
  CREDIT_CHARGE_AMOUNTS,
  CREDIT_CHARGE_ORDER_NAME,
  demoCreditPaymentKey,
  type CreditChargeAmount,
} from '@/lib/credit-charge-shared';
import { describeTossKeyKind } from '@/lib/payments/env';
import { REFUND_REQUIRED } from '@/lib/legal';
import { isProductionClinkHost } from '@/lib/site-origin';
import { cn, formatDateTime, formatWon } from '@/lib/utils';
import type { TossPaymentsWidgets } from '@tosspayments/tosspayments-sdk';

type CreditTx = {
  id: string;
  type: 'CHARGE' | 'HOLD' | 'RELEASE' | 'REFUND';
  amount: number;
  balance_after: number;
  reference_id: string | null;
  description: string | null;
  created_at: string;
};

type Checkout = {
  orderId: string;
  amount: number;
  orderName: string;
  customerKey: string;
  clientKey: string | null;
  demo: boolean;
};

const TYPE_LABEL: Record<CreditTx['type'], string> = {
  CHARGE: '충전',
  HOLD: '이용',
  RELEASE: '예치 해제',
  REFUND: '환불',
};

export function CreditWallet({ canCharge }: { canCharge: boolean }) {
  const router = useRouter();
  const titleId = useId();
  const widgetsRef = useRef<TossPaymentsWidgets | null>(null);
  const loadRef = useRef<() => Promise<void>>(async () => {});
  const [balance, setBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<CreditTx[]>([]);
  const [amounts, setAmounts] = useState<number[]>([...CREDIT_CHARGE_AMOUNTS]);
  const [selected, setSelected] = useState<CreditChargeAmount>(CREDIT_CHARGE_AMOUNTS[0]);
  const { user, activeRole } = useAuth();
  const [serverCanCharge, setServerCanCharge] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [ready, setReady] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);

  const load = async () => {
    const response = await fetch(
      '/api/credits/wallet',
      await authRequestInit({
        cache: 'no-store',
        headers: activeRole ? { 'x-clink-active-role': activeRole } : undefined,
      }),
    );
    const body = (await response.json().catch(() => null)) as {
      balance?: number;
      transactions?: CreditTx[];
      amounts?: number[];
      error?: string;
      errorMessage?: string;
      canCharge?: boolean;
    } | null;
    if (!response.ok || !body) {
      throw new Error(body?.errorMessage || body?.error || '크레딧을 불러오지 못했습니다.');
    }
    setBalance(typeof body.balance === 'number' ? body.balance : 0);
    setTransactions(Array.isArray(body.transactions) ? body.transactions : []);
    setServerCanCharge(body.canCharge === true);
    if (Array.isArray(body.amounts) && body.amounts.length > 0) {
      const nextAmounts = body.amounts;
      setAmounts(nextAmounts);
      setSelected((current) =>
        nextAmounts.includes(current) ? current : (nextAmounts[0] as CreditChargeAmount),
      );
    }
  };

  const showCharge = serverCanCharge ?? canCharge;
  loadRef.current = load;

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadRef.current()
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : '크레딧을 불러오지 못했습니다.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeRole, user?.id]);

  useEffect(() => {
    if (!checkout) {
      widgetsRef.current = null;
      return;
    }
    let cancelled = false;
    const boot = async () => {
      setReady(false);
      setPayError(null);
      const clientKey = checkout.clientKey?.trim() || '';
      const liveHost = isProductionClinkHost(window.location.hostname);
      if (liveHost && (!clientKey || describeTossKeyKind(clientKey).kind === 'test')) {
        setPayError('운영 환경에서는 토스페이먼츠 라이브 키가 필요합니다.');
        setReady(true);
        return;
      }
      if (!clientKey) {
        setReady(true);
        return;
      }
      try {
        const { loadTossPayments } = await import('@tosspayments/tosspayments-sdk');
        const tossPayments = await loadTossPayments(clientKey);
        const widgets = tossPayments.widgets({ customerKey: checkout.customerKey });
        await widgets.setAmount({ currency: 'KRW', value: checkout.amount });
        await Promise.all([
          widgets.renderPaymentMethods({ selector: '#credit-toss-method', variantKey: 'DEFAULT' }),
          widgets.renderAgreement({ selector: '#credit-toss-agreement', variantKey: 'AGREEMENT' }),
        ]);
        if (!cancelled) {
          widgetsRef.current = widgets;
          setReady(true);
        }
      } catch (reason) {
        if (!cancelled) {
          setPayError(reason instanceof Error ? reason.message : '결제창을 불러오지 못했습니다.');
          setReady(true);
        }
      }
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, [checkout]);

  const startCharge = async () => {
    setPreparing(true);
    setError(null);
    try {
      const response = await fetch(
        '/api/credits/charge/prepare',
        await authRequestInit({
          method: 'POST',
          headers: activeRole ? { 'x-clink-active-role': activeRole } : undefined,
          body: JSON.stringify({ amount: selected }),
        }),
      );
      const body = (await response.json().catch(() => null)) as Checkout & { error?: string };
      if (!response.ok || !body?.orderId) {
        throw new Error(body?.error || '충전 주문을 만들지 못했습니다.');
      }
      setCheckout({
        orderId: body.orderId,
        amount: body.amount,
        orderName: body.orderName || CREDIT_CHARGE_ORDER_NAME,
        customerKey: body.customerKey,
        clientKey: body.clientKey,
        demo: Boolean(body.demo),
      });
      setAgreed(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '충전 주문을 만들지 못했습니다.');
    } finally {
      setPreparing(false);
    }
  };

  const pay = async () => {
    if (!checkout || paying) {
      return;
    }
    if (!agreed) {
      setPayError(REFUND_REQUIRED);
      return;
    }
    setPaying(true);
    setPayError(null);
    const successUrl = `${window.location.origin}/my/credits/success`;
    const failUrl = `${window.location.origin}/my/credits/fail?orderId=${encodeURIComponent(checkout.orderId)}`;
    try {
      if (widgetsRef.current) {
        await widgetsRef.current.requestPayment({
          orderId: checkout.orderId,
          orderName: checkout.orderName,
          successUrl,
          failUrl,
        });
        return;
      }
      if (isProductionClinkHost(window.location.hostname) || !checkout.demo) {
        setPayError('토스페이먼츠 결제창을 열 수 없습니다.');
        setPaying(false);
        return;
      }
      const params = new URLSearchParams({
        paymentKey: demoCreditPaymentKey(checkout.orderId),
        orderId: checkout.orderId,
        amount: String(checkout.amount),
      });
      router.push(`/my/credits/success?${params.toString()}`);
    } catch (reason) {
      setPayError(reason instanceof Error ? reason.message : '결제를 시작하지 못했습니다.');
      setPaying(false);
    }
  };

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
        <p className="text-sm font-semibold text-clink-accent">보유 크레딧</p>
        <p className="mt-2 text-3xl font-bold text-zinc-950">
          {loading ? '불러오는 중' : error && balance === null ? '—' : formatWon(balance ?? 0)}
        </p>
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          {showCharge
            ? '충전한 금액은 캠페인 이용 시 차감됩니다. 결제 금액은 서버에 저장한 주문과 같을 때만 잔액에 반영됩니다.'
            : '이용·환불 내역이 이 계정 잔액에 반영됩니다.'}
        </p>
        {showCharge ? (
          <>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {amounts.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  className={cn(
                    'h-11 rounded-xl border text-sm font-semibold',
                    selected === amount
                      ? 'border-zinc-950 bg-zinc-950 text-white'
                      : 'border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50',
                  )}
                  onClick={() => setSelected(amount as CreditChargeAmount)}
                >
                  {formatWon(amount)}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-full bg-clink text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-60"
              disabled={preparing || loading}
              onClick={() => void startCharge()}
            >
              {preparing ? '주문 생성 중' : `${formatWon(selected)} 충전하기`}
            </button>
          </>
        ) : (
          <p className="mt-5 text-sm leading-6 text-zinc-500">
            1만·5만·10만·50만·100만·500만 원 선불 충전은 광고주 모드에서 할 수 있습니다.
          </p>
        )}
        {error ? (
          <p role="alert" className="mt-3 text-sm text-rose-600">
            {error}
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
        <h2 className="text-lg font-bold text-zinc-950">충전·이용 내역</h2>
        {loading ? (
          <p className="mt-4 text-sm text-zinc-500">내역을 불러오는 중입니다.</p>
        ) : transactions.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">아직 크레딧 내역이 없습니다.</p>
        ) : (
          <ul className="mt-4 divide-y divide-zinc-100">
            {transactions.map((row) => (
              <li key={row.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-950">{TYPE_LABEL[row.type]}</p>
                  <p className="mt-1 truncate text-xs text-zinc-500">
                    {formatDateTime(row.created_at)}
                    {row.reference_id ? ` · ${row.reference_id}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-zinc-950">
                    {row.type === 'HOLD' ? '-' : '+'}
                    {formatWon(row.amount)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">잔액 {formatWon(row.balance_after)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {checkout ? (
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="fixed inset-0 z-[75] flex items-center justify-center bg-zinc-950/50 p-4"
        >
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <h2 id={titleId} className="text-base font-semibold text-zinc-950">
              크레딧 충전
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              {checkout.orderName} · {formatWon(checkout.amount)}
            </p>
            <p className="mt-1 text-xs text-zinc-400">주문 {checkout.orderId}</p>
            <div id="credit-toss-method" className="mt-4 min-h-16" />
            <div id="credit-toss-agreement" />
            <label className="mt-4 flex items-start gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                className="mt-1"
                checked={agreed}
                onChange={(event) => setAgreed(event.target.checked)}
              />
              <span>
                <Link href="/refund" className="underline">
                  환불 규정
                </Link>
                과 구매 조건을 확인했습니다.
              </span>
            </label>
            {payError ? (
              <p role="alert" className="mt-3 text-sm text-rose-600">
                {payError}
              </p>
            ) : null}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-zinc-200 text-sm font-semibold"
                disabled={paying}
                onClick={() => setCheckout(null)}
              >
                닫기
              </button>
              <button
                type="button"
                className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-clink text-sm font-semibold text-white disabled:opacity-60"
                disabled={!ready || paying}
                onClick={() => void pay()}
              >
                {paying ? <Loader2 className="size-4 animate-spin" /> : ready ? '결제하기' : '결제창 준비 중'}
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
