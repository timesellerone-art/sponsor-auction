export const LIFECYCLE_EVENTS = [
  'bid_received',
  'award_paid',
  'payout_paid',
  'auction_deadline',
] as const;

export type LifecycleEvent = (typeof LIFECYCLE_EVENTS)[number];

export type LifecycleNotifyInput = {
  event: LifecycleEvent;
  to?: string | null;
  toName?: string | null;
  toEmail?: string | null;
  toUserId?: string | null;
  auctionId?: string | null;
  auctionTitle?: string | null;
  extra?: string | null;
};

export type LifecycleNotifyResult = {
  ok: boolean;
  mocked: boolean;
  event: LifecycleEvent;
  text: string;
};

export function isLifecycleEvent(value: string): value is LifecycleEvent {
  return (LIFECYCLE_EVENTS as readonly string[]).includes(value);
}

export function buildNotificationText(input: LifecycleNotifyInput) {
  const title = (input.auctionTitle || '캠페인').trim();
  const name = (input.toName || '회원').trim();
  switch (input.event) {
    case 'bid_received':
      return `새로운 크리에이터 제안이 도착했습니다. 캠페인: ${title}`;
    case 'award_paid':
      return `${name}님, 제안이 낙찰되어 결제 완료되었습니다. 캠페인: ${title}`;
    case 'payout_paid':
      return `${name}님, 정산금 입금이 완료되었습니다. 캠페인: ${title}${input.extra ? ` (${input.extra})` : ''}`;
    case 'auction_deadline':
      return `${name}님, 경매 마감이 임박했습니다. 캠페인: ${title}`;
    default:
      return `${title} 관련 안내입니다.`;
  }
}

function solapiKey() {
  return (process.env.SOLAPI_API_KEY || process.env.SOLAPI_KEY || '').trim();
}

function digitsPhone(value: string | null | undefined) {
  return (value || '').replace(/\D/g, '');
}

async function sendViaSolapi(to: string, text: string, event: LifecycleEvent) {
  const apiKey = solapiKey();
  const apiSecret = (process.env.SOLAPI_API_SECRET || process.env.SOLAPI_SECRET || '').trim();
  const from = (process.env.SOLAPI_SENDER || '').replace(/\D/g, '');
  const pfId = (process.env.SOLAPI_PFID || process.env.SOLAPI_KAKAO_PFID || '').trim();
  const templateId = (
    process.env[`SOLAPI_TEMPLATE_${event.toUpperCase()}`] ||
    process.env.SOLAPI_KAKAO_TEMPLATE_ID ||
    ''
  ).trim();

  if (!apiKey) {
    return { mocked: true as const };
  }

  if (!apiSecret || !to) {
    console.info('[Notification Mock]', {
      reason: !apiSecret ? 'SOLAPI_API_SECRET 없음' : '수신번호 없음',
      event,
      to,
      text,
    });
    return { mocked: true as const };
  }

  const { createHmac, randomBytes } = await import('crypto');
  const date = new Date().toISOString();
  const salt = randomBytes(16).toString('hex');
  const signature = createHmac('sha256', apiSecret).update(date + salt).digest('hex');
  const authorization = `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;

  const message: Record<string, unknown> = {
    to,
    from: from || to,
    text,
  };
  if (pfId && templateId) {
    message.kakaoOptions = {
      pfId,
      templateId,
      disableSms: false,
      variables: {
        '#{이름}': '회원',
        '#{캠페인}': text,
      },
    };
  }

  const response = await fetch('https://api.solapi.com/messages/v4/send', {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.warn('[SponsorAuction] 솔라피 발송 실패, Mock으로 수용', {
      status: response.status,
      body: body.slice(0, 200),
      event,
      to,
    });
    return { mocked: true as const };
  }

  console.info('[SponsorAuction] 솔라피 발송 성공', { event, to });
  return { mocked: false as const };
}

async function deliverOnServer(input: LifecycleNotifyInput): Promise<LifecycleNotifyResult> {
  const text = buildNotificationText(input);
  const to =
    digitsPhone(input.to) ||
    digitsPhone(process.env.SOLAPI_DEFAULT_TO) ||
    '';

  try {
    if (!solapiKey()) {
      console.info('[Notification Mock]', {
        event: input.event,
        to: to || input.toEmail || input.toName || 'unknown',
        auctionId: input.auctionId,
        text,
      });
      return { ok: true, mocked: true, event: input.event, text };
    }

    const sent = await sendViaSolapi(to, text, input.event);
    if (sent.mocked) {
      console.info('[Notification Mock]', {
        event: input.event,
        to: to || input.toEmail || input.toName || 'unknown',
        text,
      });
    }
    return { ok: true, mocked: sent.mocked, event: input.event, text };
  } catch (error) {
    console.warn('[Notification Mock] 발송 예외를 무시하고 수용합니다.', error);
    console.info('[Notification Mock]', {
      event: input.event,
      to: to || input.toEmail || input.toName || 'unknown',
      text,
    });
    return { ok: true, mocked: true, event: input.event, text };
  }
}

export async function notifyLifecycleEvent(
  input: LifecycleNotifyInput,
): Promise<LifecycleNotifyResult> {
  const text = buildNotificationText(input);
  try {
    if (typeof window !== 'undefined') {
      const response = await fetch('/api/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        console.info('[Notification Mock]', { event: input.event, text, http: response.status });
        return { ok: true, mocked: true, event: input.event, text };
      }
      const payload = (await response.json().catch(() => null)) as LifecycleNotifyResult | null;
      return payload ?? { ok: true, mocked: true, event: input.event, text };
    }
    return await deliverOnServer(input);
  } catch (error) {
    console.info('[Notification Mock]', { event: input.event, text, error });
    return { ok: true, mocked: true, event: input.event, text };
  }
}

export async function deliverLifecycleNotification(input: LifecycleNotifyInput) {
  return deliverOnServer(input);
}

const deadlineSent = new Set<string>();

export function deadlineNotifyKey(auctionId: string, now = new Date()) {
  return `${auctionId}:${now.toISOString().slice(0, 10)}`;
}

export function shouldNotifyDeadline(deadlineIso: string, now = Date.now()) {
  const end = Date.parse(deadlineIso);
  if (Number.isNaN(end)) {
    return false;
  }
  const remain = end - now;
  return remain > 0 && remain <= 24 * 60 * 60 * 1000;
}

export function markDeadlineNotified(key: string) {
  deadlineSent.add(key);
}

export function wasDeadlineNotified(key: string) {
  return deadlineSent.has(key);
}
