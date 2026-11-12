import {
  ADVERTISER_FEE_PERCENT,
  CREATOR_FEE_BRACKETS,
  creatorFeeShortRatesCopy,
  describeFeeQuote,
  extractProposalAmounts,
  formatFeeQuoteKorean,
  VAT_PERCENT,
  WITHHOLDING_PERCENT,
} from '@/lib/fee-policy';

export const SUPPORT_MESSAGE_MAX_LENGTH = 500;
export const SUPPORT_CHAT_RATE_LIMIT = 15;
export const SUPPORT_CHAT_MODELS = [
  'gemini-2.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-flash-latest',
] as const;

export const SUPPORT_QUICK_PROMPTS = [
  '역경매 진행 방식이 궁금해요',
  `광고주 캠페인 등록 및 수수료(${ADVERTISER_FEE_PERCENT}%)`,
  `크리에이터 제안하기 및 구간별 수수료(${creatorFeeShortRatesCopy()})`,
  '결제/계정 오류 · 1:1 문의 접수',
] as const;

export const SUPPORT_TICKET_CATEGORIES = [
  { id: 'payment', label: '결제/정산' },
  { id: 'auction', label: '역경매/캠페인' },
  { id: 'account', label: '계정/로그인' },
  { id: 'other', label: '기타' },
] as const;

export type SupportTicketCategory = (typeof SUPPORT_TICKET_CATEGORIES)[number]['id'];

export const SUPPORT_WELCOME_MESSAGE =
  '안녕하세요. 클링크(Clink) AI 상담입니다. 캠페인 등록, 콘텐츠 제안, 수수료·정산 안내를 도와드릴게요. 금액이 있으면 알려주시면 구간 요율로 계산해 드립니다.';

export const SUPPORT_FALLBACK_MESSAGE =
  '지금은 실시간 상담 연결이 원활하지 않습니다. 화면의 [1:1 문의 남기기]로 남겨 주시면 운영팀이 확인 후 답변드립니다.';

export const SUPPORT_ESCALATION_MESSAGE =
  '이 내용은 제가 임의로 확정할 수 없습니다. 환불·분쟁·결제 오류는 [1:1 문의 남기기]로 접수해 주세요.';

const CREATOR_BRACKET_COPY = CREATOR_FEE_BRACKETS.map((bracket) => {
  const maxLabel =
    Number.isFinite(bracket.max) && bracket.max !== Number.POSITIVE_INFINITY
      ? `${bracket.max.toLocaleString('ko-KR')}원 미만`
      : '상한 없음';
  return `- ${bracket.label}: ${Math.round(bracket.rate * 100)}% (적용 구간 ${bracket.min.toLocaleString('ko-KR')}원 이상 ~ ${maxLabel})`;
}).join('\n');

export function isSupportTicketCategory(value: string): value is SupportTicketCategory {
  return SUPPORT_TICKET_CATEGORIES.some((item) => item.id === value);
}

export function buildSupportSystemPrompt(quoteContext?: string) {
  return `당신은 클링크(Clink, https://www.clinkapp.kr)의 한국어 고객 상담원입니다.
클링크는 타임 경매가 아니라, 광고주가 캠페인을 올리면 크리에이터가 제안 금액을 내는 역경매 기반 스폰서십 매칭 플랫폼입니다. 화면에서는 오픈 캠페인·콘텐츠 제안으로 안내합니다.

진행 절차:
1) 광고주가 캠페인을 등록합니다.
2) 크리에이터가 역경매 방식으로 제안합니다.
3) 광고주가 1명을 낙찰하고 토스페이먼츠로 결제합니다.
4) 콘텐츠 제작·검수 후 정산합니다. 매칭은 1:1입니다.

확정 수수료(양면, 단일 구간, 누진 아님):
- 광고주: 낙찰 금액의 ${ADVERTISER_FEE_PERCENT}%를 결제 시 합산합니다.
${CREATOR_BRACKET_COPY}
- 개인 크리에이터: 수수료 공제 후 금액에 사업소득 ${WITHHOLDING_PERCENT}% 원천징수를 안내합니다.
- 사업자 크리에이터: 수수료 공제 후 공급가에 VAT ${VAT_PERCENT}%를 세금계산서로 별도 발행합니다.

행동 규칙:
- 친절하고 명확한 한국어 존댓말로 2~8문장 이내로 답합니다.
- 제공된 정책·절차만 말합니다. 예외 환불 확정, 분쟁 판정, 결제 오류 원인, 미공개 일정은 지어내지 않습니다.
- 그런 요청이면 escalate=true 로 두고 1:1 문의 접수를 안내합니다.
- UI에 Gemini/모델명을 말하지 않습니다.
- 답변은 JSON만 출력합니다. 형식: {"reply":"한국어 답변","escalate":false}

${quoteContext ?? ''}`.trim();
}

export function quoteContextFromUserText(text: string) {
  const amounts = extractProposalAmounts(text);
  if (amounts.length === 0) {
    return '';
  }
  return amounts
    .map((amount) => {
      const quote = describeFeeQuote(amount);
      return `이번 질문의 확정 계산: ${formatFeeQuoteKorean(quote)}`;
    })
    .join('\n');
}

export function parseSupportModelPayload(value: unknown): { reply: string; escalate: boolean } | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as { reply?: unknown; escalate?: unknown; message?: unknown };
  const reply = typeof record.reply === 'string' ? record.reply.trim() : typeof record.message === 'string' ? record.message.trim() : '';
  if (!reply || reply.startsWith('{') || reply.includes('{"reply"')) {
    return null;
  }
  return {
    reply: reply.slice(0, 2000),
    escalate: record.escalate === true,
  };
}

export function sanitizeSupportReply(reply: string, quoteContext = '') {
  const trimmed = reply.trim().replace(/\s*\{"reply"\s*:[\s\S]*$/, '').trim();
  if (!trimmed || trimmed.startsWith('{')) {
    return quoteContext || SUPPORT_FALLBACK_MESSAGE;
  }
  if (quoteContext && !trimmed.includes('수수료') && !trimmed.includes('%')) {
    return `${quoteContext} ${trimmed}`.trim();
  }
  return trimmed;
}
