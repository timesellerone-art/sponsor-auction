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
/** 신규 Gemini 키에서 막히는 gemini-2.5-flash 는 쓰지 않는다. 캠페인 가이드와 같은 Flash 계열. */
export const SUPPORT_CHAT_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-flash-latest',
] as const;

export type SupportAiDebug = {
  source: 'gemini' | 'knowledge' | 'fallback';
  reason?: string;
  status?: number;
  model?: string;
  hasApiKey?: boolean;
  keyEnv?: string | null;
  triedModels?: string[];
  detail?: string;
};

export const SUPPORT_QUICK_PROMPTS = [
  '광고 등록 방법은?',
  '캠페인 지원하는 방법',
  `수수료·원천징수(${ADVERTISER_FEE_PERCENT}% / ${creatorFeeShortRatesCopy()} / ${WITHHOLDING_PERCENT}%)`,
  '사업자등록·정산 계좌 안내',
] as const;

export const SUPPORT_TICKET_QUICK_LABEL = '상담원 연결 (1:1 문의)';

export const SUPPORT_TICKET_CATEGORIES = [
  { id: 'payment', label: '결제/정산' },
  { id: 'auction', label: '캠페인 모집' },
  { id: 'account', label: '계정/로그인' },
  { id: 'other', label: '기타' },
] as const;

export type SupportTicketCategory = (typeof SUPPORT_TICKET_CATEGORIES)[number]['id'];

export const SUPPORT_WELCOME_MESSAGE =
  '안녕하세요. 클링크(Clink) AI 상담입니다. 캠페인 등록, 캠페인 지원, 수수료·정산, 사업자등록까지 화면 경로와 함께 안내해 드릴게요. 운영팀 확인이 필요한 결제 오류·정산 누락·분쟁만 1:1 문의로 연결됩니다.';

export const SUPPORT_FALLBACK_MESSAGE =
  '지금은 실시간 AI 응답이 지연됩니다. 상단 [+ 캠페인 등록], 오픈 캠페인의 [캠페인 지원], 마이페이지 > 계정 설정에서 대부분의 이용 방법을 바로 진행할 수 있습니다. 필요하면 아래 [1:1 문의 남기기]를 이용해 주세요.';

export const SUPPORT_ESCALATION_MESSAGE =
  '이 건은 운영팀이 원장·결제·정산 기록을 확인해야 합니다. 아래 [1:1 문의 남기기]로 접수해 주세요.';

const CREATOR_BRACKET_COPY = CREATOR_FEE_BRACKETS.map((bracket) => {
  const maxLabel =
    Number.isFinite(bracket.max) && bracket.max !== Number.POSITIVE_INFINITY
      ? `${bracket.max.toLocaleString('ko-KR')}원 미만`
      : '상한 없음';
  return `- ${bracket.label}: ${Math.round(bracket.rate * 100)}% (적용 구간 ${bracket.min.toLocaleString('ko-KR')}원 이상 ~ ${maxLabel})`;
}).join('\n');

const HOW_TO_HINT =
  /방법|어떻게|안내|궁금|절차|규정|무엇|무슨|뭔가요|이란|인가요|알려|설명|어디|경로/;

type KnowledgeArticle = {
  id: string;
  keywords: string[];
  answer: string;
};

export const SUPPORT_KNOWLEDGE_ARTICLES: KnowledgeArticle[] = [
  {
    id: 'campaign-register',
    keywords: [
      '광고등록',
      '캠페인등록',
      '캠페인올리',
      '광고올리',
      '등록방법',
      '캠페인만드는',
      '광고하는법',
      '캠페인어떻게',
      '광고올리는',
      '캠페인생성',
    ],
    answer: `광고(캠페인) 등록은 광고주 모드에서 합니다.

1) 화면 상단 오른쪽의 [+ 캠페인 등록]을 누릅니다. 로그인이 없으면 /login 에서 Google·카카오·네이버로 로그인한 뒤, 상단 역할 전환에서 광고주를 선택합니다.
2) 모달에 캠페인 제목, 플랫폼, 카테고리, 확정 지급액(캠페인 모집 단가), 설명, 마감일, 표지 이미지를 입력하고 등록합니다. 가격 제안·입찰은 받지 않습니다.
3) 등록 후 홈의 [오픈 캠페인](/#auctions)에 공개되고, 마이페이지(/my)의 [진행 중 캠페인]에서 확인할 수 있습니다.

광고주 캠페인 등록 전에 마이페이지 > 계정 설정(/my/settings)에서 사업자등록번호를 넣는 것을 권장합니다. 휴폐업·반려 상태면 등록이 막힙니다. 캠페인 1건은 크리에이터(개인 또는 팀) 1곳과 1:1로 매칭되며, 계약·정산 주체는 대표 계정입니다.`,
  },
  {
    id: 'how-it-works',
    keywords: ['역경매', '진행방식', '이용방법', '클링크란', '플랫폼이용', '매칭방식', '타임경매'],
    answer: `클링크는 캠페인 모집 플랫폼입니다. 광고주가 확정 지급액을 고지하고 모집하면, 크리에이터(개인 또는 팀)가 그 금액 조건에 동의한 뒤 콘셉트·포트폴리오로 지원합니다.

1) 사업자 인증을 완료한 광고주: 상단 [+ 캠페인 등록]에서 확정 캠페인 금액을 고지하고 모집 등록
2) 크리에이터: [오픈 캠페인]에서 [캠페인 지원]
3) 광고주: 마이페이지 > 내 캠페인 > [캠페인별 지원 현황]에서 크리에이터(개인 또는 팀) 1곳을 [크리에이터 선정]
4) 광고주가 사전에 확정된 단건 용역 대금(공급가액 + 수수료 + 부가세)을 토스페이먼츠 에스크로로 결제·예치
5) 콘텐츠 납품 및 광고주 구매 확정 후 크리에이터 정산 지급. 매칭은 캠페인당 1:1이며 계약·정산 주체는 대표 계정입니다.

상단 메뉴는 오픈 캠페인, 크리에이터 상품(/timeslots), 이용안내(/#guide), 마이페이지입니다.`,
  },
  {
    id: 'creator-bid',
    keywords: [
      '콘텐츠제안',
      '제안하기',
      '제안방법',
      '입찰방법',
      '크리에이터제안',
      '지원방법',
      '제안하는법',
      '캠페인지원',
      '제작신청',
    ],
    answer: `캠페인 지원은 크리에이터 모드에서 합니다.

1) 상단 [오픈 캠페인] 또는 홈 /#auctions 에서 원하는 캠페인을 엽니다.
2) [캠페인 지원]을 누릅니다. 로그인이 없으면 /login 후 역할을 크리에이터로 바꿉니다.
3) 확정 지급액은 광고주가 책정한 금액으로 고정 표시됩니다. 채널 URL, 제작 콘셉트·방향, 스타일, 정산 계좌(은행·계좌번호·예금주, 개인/사업자)를 입력하고 약관에 동의한 뒤 제출합니다.
4) 제출한 지원은 마이페이지(/my)의 [내 제안]에서 확인합니다.

캠페인당 선정은 크리에이터(개인 또는 팀) 1곳이며, 계약·정산은 대표 계정 기준입니다. 연락처·카카오톡·직거래 유도 문구는 차단됩니다.`,
  },
  {
    id: 'award-pay',
    keywords: ['낙찰', '선정방법', '크레딧결제', '낙찰하기', '제안현황', '선정하는'],
    answer: `크리에이터 선정·결제는 광고주가 마이페이지에서 진행합니다.

1) 마이페이지(/my) > [캠페인별 지원 현황]에서 캠페인을 고릅니다.
2) 지원 목록의 [크리에이터 선정]을 누른 뒤 확정 용역비·수수료 15%·부가세 10%가 표시된 토스페이먼츠 단건 에스크로 결제를 진행합니다.
3) 선정은 캠페인당 크리에이터(개인 또는 팀) 1곳입니다. 결제 승인 후 모집이 마감되고 상태가 종료(closed)로 바뀝니다.
4) 캠페인 목록은 [결제 완료 목록]·[종료된 캠페인] 탭에서 봅니다.`,
  },
  {
    id: 'fees',
    keywords: ['수수료', '요율', '몇퍼', '몇%', '플랫폼수수료', '수수료율'],
    answer: `수수료는 양면·단일 구간이며 누진이 아닙니다.

- 광고주: 확정 지급액의 ${ADVERTISER_FEE_PERCENT}%를 더한 공급가액에 부가세 ${VAT_PERCENT}%를 별도 가산해 토스페이먼츠 단건 에스크로로 결제합니다.
${CREATOR_BRACKET_COPY}
- 개인 크리에이터: 수수료 공제 후 금액에 사업소득 ${WITHHOLDING_PERCENT}% 원천징수를 안내합니다.
- 사업자등록이 검증된 크리에이터: 수수료 공제 후 공급가에 VAT ${VAT_PERCENT}% 세금계산서를 발행하고 원천징수는 0원입니다.

금액이 있으면 알려 주시면 같은 공식으로 계산해 드립니다. 마이페이지 제안/결제 화면의 수수료 카드와 동일합니다.`,
  },
  {
    id: 'withholding',
    keywords: ['원천징수', '3.3', '사업소득', '세금떼'],
    answer: `개인 크리에이터는 수수료를 뺀 금액에 사업소득 ${WITHHOLDING_PERCENT}% 원천징수를 안내합니다. 사업자등록번호가 국세청 진위확인·상태조회를 통과하고 관리자 검증이 끝난 크리에이터는 원천징수 0원이며, 공급가에 VAT ${VAT_PERCENT}% 세금계산서를 발행합니다.

정산 유형(개인/사업자)과 계좌는 마이페이지 > 계정 설정(/my/settings)의 정산 계좌, 또는 제안 모달에서 등록합니다.`,
  },
  {
    id: 'business',
    keywords: [
      '사업자등록',
      '사업자번호',
      '국세청',
      '진위확인',
      '상태조회',
      '휴폐업',
      '검수필요',
    ],
    answer: `사업자등록은 마이페이지 > 계정 설정(/my/settings)에서 합니다.

1) 사업자등록번호(10자리), 국세청 대표자 성명, 개업일자를 입력합니다.
2) [상태 조회]로 국세청 휴폐업 상태와 진위확인(valid=01만 일치)을 동시에 확인합니다. 상호명이 아니라 대표자 성명입니다.
3) 저장하면 상태가 미등록·검증완료·휴폐업·검수필요·반려 중 하나로 표시됩니다. 불일치는 미등록이며 검수필요로 남겨 두지 않습니다.
4) 관리자가 추가로 검수할 수 있습니다. 휴폐업·반려면 캠페인 등록이 막힙니다.

광고주·크리에이터 모두 같은 화면에서 등록합니다.`,
  },
  {
    id: 'settlement-account',
    keywords: [
      '정산계좌',
      '정산은',
      '정산방법',
      '정산절차',
      '정산하나요',
      '계좌등록',
      '입금계좌',
      '은행계좌',
      '예금주',
    ],
    answer: `크리에이터 정산 계좌는 마이페이지 > 계정 설정(/my/settings)의 정산 계좌 폼에서 등록합니다. 은행, 계좌번호, 예금주, 정산 유형(개인/사업자)을 저장하세요.

캠페인 지원 모달에서도 같은 계좌를 입력할 수 있습니다. 사업자등록번호는 계정 설정의 사업자 폼에 따로 저장하고, 관리자 검증이 끝나면 세금계산서로 정산됩니다.`,
  },
  {
    id: 'credits',
    keywords: ['크레딧충전', '크레딧', '토스페이', '충전방법', '잔액'],
    answer: `캠페인 결제는 선불 충전 없이 토스페이먼츠 단건 에스크로로 진행합니다.

1) 광고주가 크리에이터를 선정한 뒤 확정 용역비 + 광고주 ${ADVERTISER_FEE_PERCENT}% + 부가세 ${VAT_PERCENT}%를 한 번에 결제·예치합니다.
2) 분할·후불·가격 변동 결제는 없습니다.
3) 작업 착수 전(에스크로 예치 상태) 취소 시 전액 환불됩니다. 환불 규정은 /refund 입니다.`,
  },
  {
    id: 'refund-policy',
    keywords: ['환불규정', '환불방법', '취소규정', '환불은어떻게', '환불안내'],
    answer: `환불·취소 기준은 /refund 페이지에 있습니다. 크리에이터 작업 착수 전(결제 후 에스크로 예치 상태) 취소는 전액 환불, 개시 후는 진행률·합의에 따른 부분 환불 또는 환불 불가일 수 있습니다. 최종 검수 승인 건은 원칙적으로 환불 대상이 아닙니다. 광고 미이행이 확인되면 광고주 100% 환불을 요청할 수 있습니다.

실제 환불 처리·이중결제·승인만 되고 잔액이 안 보이는 문제는 운영팀이 원장을 확인해야 하므로 [1:1 문의 남기기]를 이용해 주세요.`,
  },
  {
    id: 'tax-invoice',
    keywords: ['세금계산서', '세금계산', '계산서발행', '팝빌'],
    answer: `검증된 사업자 크리에이터는 수수료 공제 후 공급가에 VAT ${VAT_PERCENT}% 세금계산서를 발행하고 원천징수는 없습니다. 광고주 결제의 부가세는 확정 지급액+${ADVERTISER_FEE_PERCENT}% 공급가액에 ${VAT_PERCENT}%입니다.

세금계산서 상태는 해당 캠페인 당사자가 캠페인 상세에서 확인할 수 있습니다. 미발행·오기 정정은 운영 확인이 필요하면 1:1 문의를 이용해 주세요.`,
  },
  {
    id: 'bypass',
    keywords: ['우회거래', '직거래', '외부거래', '카카오톡번호', '연락처금지'],
    answer: `클링크는 플랫폼 밖 직거래·우회 거래를 금지합니다. 캠페인 설명·제안 문구에 전화번호, 계좌번호, 카카오톡, 외부거래 유도 표현을 넣으면 입력이 거절되거나 우회 모니터링에 기록됩니다.

연락·결제·정산은 클링크와 토스페이먼츠 단건 에스크로로만 진행하세요. 우회 시도가 확인되면 이용 제한이 있을 수 있습니다.`,
  },
  {
    id: 'login-role',
    keywords: [
      '로그인',
      '회원가입',
      '가입절차',
      '가입방법',
      '가입은',
      '어떻게가입',
      '역할전환',
      '광고주모드',
      '크리에이터모드',
      '마이페이지',
    ],
    answer: `로그인은 /login 에서 Google, 카카오, 네이버로 합니다. 로그인 후 상단 [마이페이지](/my)로 이동합니다.

역할은 상단 역할 전환에서 광고주/크리에이터를 바꿉니다. 광고주면 마이페이지 탭이 내 캠페인·계정 설정, 크리에이터면 내 제안·계정 설정입니다. 소셜 계정·휴대전화 연결은 마이페이지 > 계정 설정입니다.`,
  },
  {
    id: 'inventory',
    keywords: ['크리에이터목록', '인벤토리', '타임슬롯', '크리에이터상품', '크리에이터찾기'],
    answer: `상단 [크리에이터 상품](/timeslots)에서 광고 상품을 둘러볼 수 있습니다.

1) 광고주가 상품 상세에서 확정 단가에 동의하고 메시지를 넣은 뒤 [제작 신청]합니다. 이 단계에서는 결제가 발생하지 않습니다.
2) 크리에이터가 상세 페이지 또는 마이페이지에서 [크리에이터 선정]으로 광고주 1곳을 선정합니다. 선정 직후는 결제 대기입니다.
3) 선정된 광고주가 상세 페이지 또는 마이페이지에서 토스페이먼츠 단건 에스크로 결제를 완료하면 진행 중(에스크로 예치)이 됩니다.
4) 이후 크리에이터 [제작 완료(납품)] → 광고주 [구매 확정] → 정산은 오픈 캠페인과 같습니다.

일반 캠페인 매칭은 [오픈 캠페인]에서 확정 금액 모집으로 진행하는 것이 기본입니다.`,
  },
  {
    id: 'contact',
    keywords: ['고객센터', '문의처', '운영팀', '1:1문의어떻게'],
    answer: `이용 방법·수수료·화면 경로는 이 AI 상담에서 안내합니다. 결제 오류, 정산 누락, 분쟁 신고처럼 운영자가 원장을 확인해야 하는 건만 상담창 하단 [1:1 문의 남기기] 또는 [상담원 연결]로 접수해 주세요.`,
  },
];

const PLATFORM_GUIDE = `화면·경로(실제 UI):
- 상단: 로고(홈), 오픈 캠페인(/#auctions), 크리에이터 상품(/timeslots), 이용안내(/#guide), 로그인(/login) 또는 마이페이지(/my), [+ 캠페인 등록]
- 마이페이지 탭: 광고주=내 캠페인·계정 설정(/my/settings). 크리에이터=내 제안·계정 설정
- 광고주 캠페인 탭: 진행 중 캠페인, 결제 완료 목록, 캠페인별 지원 현황, 종료된 캠페인
- 계정 설정: 소셜/휴대전화, 크리에이터 정산 계좌, 광고주·크리에이터 사업자등록(번호·대표자 성명·개업일자, [상태 조회]·저장)
- 환불 규정: /refund
- 로그인은 Google·카카오·네이버
- 매칭: 캠페인 1건 = 크리에이터(개인 또는 팀) 1곳과 1:1. 계약·정산 주체는 대표 계정

등록·지원·선정:
- 광고 등록 = 상단 [+ 캠페인 등록] (광고주). 제목/플랫폼/카테고리/확정 지급액/설명/마감/표지
- 지원 = 오픈 캠페인 카드 [캠페인 지원]. 채널 URL, 확정 지급액(읽기 전용), 제작 콘셉트, 정산 계좌
- 선정 = 마이페이지 > 캠페인별 지원 현황 > [크리에이터 선정] > 토스페이먼츠 단건 에스크로 결제. 캠페인당 크리에이터(개인 또는 팀) 1곳(대표 계정), 상태 closed + winner_bid_id
- 크리에이터 상품: 제작 신청 시 결제 없음 → 크리에이터 [크리에이터 선정](결제 대기) → 선정된 광고주가 토스페이먼츠 단건 에스크로 결제 → 납품 → 구매 확정 → 정산
- 휴폐업·반려 사업자는 캠페인 등록 불가. 미등록은 설정에서 번호 등록 권장

수수료(확정, 누진 아님):
- 광고주 ${ADVERTISER_FEE_PERCENT}% + 공급가 부가세 ${VAT_PERCENT}%
${CREATOR_BRACKET_COPY}
- 개인 크리에이터 원천징수 ${WITHHOLDING_PERCENT}%
- 검증 사업자 크리에이터는 원천징수 0, 공급가 VAT ${VAT_PERCENT}% 세금계산서

사업자: 국세청 진위확인은 valid=01만 일치. 상태조회와 함께 대표자명·개업일자 필요. 불일치는 미등록. 관리자 검수 가능.
우회거래 금지: 연락처·카카오톡·직거래·외부거래 문구 차단, 우회 모니터링.
결제는 토스페이먼츠 단건 에스크로. 환불 규정은 /refund. 작업 착수 전 에스크로 예치 상태 취소는 전액 환불. 실제 환불 실행·결제오류·정산누락·분쟁은 운영자 확인.`;

export function isSupportTicketCategory(value: string): value is SupportTicketCategory {
  return SUPPORT_TICKET_CATEGORIES.some((item) => item.id === value);
}

export function compactSupportText(text: string) {
  return text.toLowerCase().replace(/[\s?!.,·~'"“”‘’\-_/()[\]{}]+/g, '');
}

export function isOperatorSupportCase(text: string) {
  const compact = compactSupportText(text);
  if (!compact) {
    return false;
  }
  if (
    /상담원연결|상담원불러|상담원요청|상담원해줘|사람상담|직원연결|운영자연결|운영팀연결/.test(
      compact,
    )
  ) {
    return true;
  }
  if (/(?:1:1|일대일)문의(?:남기|접수|연결|원해|부탁)/.test(compact)) {
    return true;
  }
  if (/(?:1:1|일대일)(?:상담|연결)/.test(compact) && !HOW_TO_HINT.test(text)) {
    return true;
  }
  if (/결제오류|결제가안|결제안됨|이중결제|중복결제|중복출금|돈이빠|출금오류/.test(compact)) {
    return true;
  }
  if (/정산(?:이)?누락|입금(?:이)?누락|입금이안|정산이안|미입금됐|미정산|누락됐/.test(compact)) {
    return true;
  }
  if (/분쟁신고|사기신고|해킹당|계정탈취|계정도와|도용당/.test(compact)) {
    return true;
  }
  if (/환불(?:해줘|해주세요|요청|신청|부탁)/.test(compact) && !HOW_TO_HINT.test(text)) {
    return true;
  }
  return false;
}

export function matchSupportKnowledge(text: string) {
  const compact = compactSupportText(text);
  if (!compact) {
    return '';
  }
  let bestScore = 0;
  let bestHits = 0;
  let bestAnswer = '';
  for (const article of SUPPORT_KNOWLEDGE_ARTICLES) {
    let score = 0;
    let hits = 0;
    for (const keyword of article.keywords) {
      const needle = compactSupportText(keyword);
      if (needle && compact.includes(needle)) {
        score += needle.length;
        hits += 1;
      }
    }
    if (score > bestScore || (score === bestScore && hits > bestHits)) {
      bestScore = score;
      bestHits = hits;
      bestAnswer = article.answer;
    }
  }
  return bestScore >= 3 ? bestAnswer : '';
}

export function composeSupportReply(knowledge: string, quoteContext = '') {
  if (knowledge && quoteContext) {
    return `${knowledge}\n\n${quoteContext}`;
  }
  return knowledge || quoteContext;
}

export function answerSupportLocally(message: string): { reply: string; escalate: boolean } | null {
  const escalate = isOperatorSupportCase(message);
  const reply = composeSupportReply(matchSupportKnowledge(message), quoteContextFromUserText(message));
  if (!reply) {
    return escalate ? { reply: '', escalate: true } : null;
  }
  return { reply, escalate };
}

export function buildSupportSystemPrompt(quoteContext?: string) {
  return `당신은 클링크(Clink, https://www.clinkapp.kr)의 한국어 고객 상담원입니다.
클링크는 캠페인 모집 플랫폼입니다. 광고주가 확정 지급액을 고지하고 모집하면 크리에이터(개인 또는 팀)가 그 금액 조건에 동의한 뒤 콘셉트·포트폴리오로 지원합니다. 캠페인 1건은 크리에이터 1곳과 1:1로 매칭되며 계약·정산 주체는 대표 계정입니다. 화면에서는 오픈 캠페인·캠페인 지원으로 안내합니다.

${PLATFORM_GUIDE}

행동 규칙:
- 어떤 이용방법·정책 질문이든 먼저 위 지식으로 구체적으로 답합니다. 추상적으로 말하지 말고 실제 메뉴명과 경로, 단계 순서를 친절한 존댓말로 4~12문장 이내로 안내합니다.
- 제공된 정책·절차만 말합니다. 예외 환불 확정 금액, 분쟁 판정, 결제 오류 원인, 미공개 일정은 지어내지 않습니다.
- escalate=true 는 사용자가 상담원/1:1 연결을 요청했거나, 실제 결제오류·이중결제·정산누락·분쟁신고처럼 운영자가 DB를 봐야 하는 경우에만 사용합니다. 등록 방법, 수수료, 사업자등록, 계좌, 환불 규정 안내에는 escalate=false 입니다.
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
    reply: reply.slice(0, 2500),
    escalate: record.escalate === true,
  };
}

export function supportReplyFromModelText(text: string): { reply: string; escalate: boolean } | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const jsonPayload = (() => {
    try {
      const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
      return JSON.parse((fenced?.[1] ?? trimmed).trim()) as unknown;
    } catch {
      return null;
    }
  })();
  const fromJson = parseSupportModelPayload(jsonPayload);
  if (fromJson) {
    return fromJson;
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('```')) {
    return null;
  }
  return { reply: trimmed.slice(0, 2500), escalate: false };
}

export function classifyGeminiHttpStatus(status: number) {
  if (status === 401) {
    return 'invalid_api_key';
  }
  if (status === 403) {
    return 'forbidden';
  }
  if (status === 404) {
    return 'model_not_found';
  }
  if (status === 429) {
    return 'quota';
  }
  if (status === 400) {
    return 'bad_request';
  }
  return `http_${status}`;
}

export function classifyGeminiThrown(error: unknown) {
  if (
    error instanceof Error &&
    (error.name === 'AbortError' || /aborted|timeout|The operation was aborted/i.test(error.message))
  ) {
    return 'timeout';
  }
  return 'network';
}

export function sanitizeSupportReply(reply: string, quoteContext = '') {
  const extracted = supportReplyFromModelText(reply);
  const trimmed = (extracted?.reply || reply).trim().replace(/\s*\{"reply"\s*:[\s\S]*$/, '').trim();
  if (!trimmed || trimmed.startsWith('{')) {
    return quoteContext || SUPPORT_FALLBACK_MESSAGE;
  }
  if (quoteContext && !trimmed.includes('수수료') && !trimmed.includes('%')) {
    return `${quoteContext} ${trimmed}`.trim();
  }
  return trimmed;
}
