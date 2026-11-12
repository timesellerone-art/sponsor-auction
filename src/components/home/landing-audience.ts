export type LandingAudience = 'advertiser' | 'creator';

export const LANDING_ROLE_TABS = [
  { id: 'advertiser' as const, label: '광고주 (브랜드)' },
  { id: 'creator' as const, label: '크리에이터' },
] as const;

export const LANDING_INTRO = {
  advertiser: {
    eyebrow: '브랜드를 위한 1:1 크리에이터 매칭',
    headline: '예산과 제품만 올리면, 핏이 맞는 크리에이터가 기획안을 제안합니다',
    sub: '제품 정보와 예산을 등록하면 AI가 촬영 가이드를 정리하고, 가장 적합한 크리에이터 1명이 맞춤 기획안을 제안합니다.',
    cta: '캠페인 등록하기',
  },
  creator: {
    eyebrow: '크리에이터를 위한 AI 제안서',
    headline: '내 채널에 어울리는 캠페인을 찾고, AI 제안서로 빠르게 스폰서십을 수주하세요',
    sub: '분야별 오픈 캠페인을 고르고 채널 스타일만 입력하면 AI 제안서 초안이 완성됩니다. 광고주가 채택하면 1:1로 제작이 시작됩니다.',
    cta: '진행 중인 캠페인 보기',
  },
} as const;

export const LANDING_GUIDE = {
  advertiser: {
    title: '등록, 1:1 매칭, 결제가 한 화면에서 이어집니다',
    steps: [
      {
        step: 'STEP 01',
        title: '캠페인 등록 & AI 가이드',
        body: '제품 정보와 예산을 입력하면 AI가 크리에이터용 핵심 촬영 가이드를 정리합니다.',
      },
      {
        step: 'STEP 02',
        title: '제안서 비교 & 1:1 단독 매칭',
        body: '접수된 크리에이터들의 기획 제안서를 비교하고 가장 적합한 1명을 선정합니다.',
      },
      {
        step: 'STEP 03',
        title: '토스페이먼츠 결제 & 콘텐츠 발행',
        body: '매칭 확정 후 토스페이먼츠로 간편 결제하고 콘텐츠 제작 결과를 확인합니다.',
      },
    ],
    cta: '캠페인 등록하기',
  },
  creator: {
    title: '탐색, AI 제안, 정산이 한 화면에서 이어집니다',
    steps: [
      {
        step: 'STEP 01',
        title: '캠페인 탐색 & AI 제안서 초안 생성',
        body: '분야별 오픈 캠페인을 둘러보고, 내 채널 스타일만 입력해 AI로 맞춤 기획 제안서를 즉시 완성합니다.',
      },
      {
        step: 'STEP 02',
        title: '1:1 매칭 확정 & 콘텐츠 제작',
        body: '광고주가 제안서를 채택하면 1:1 매칭이 확정되며, 협의된 콘셉트대로 콘텐츠를 제작합니다.',
      },
      {
        step: 'STEP 03',
        title: '콘텐츠 업로드 & 수익 정산',
        body: '콘텐츠 업로드 및 검수 완료 후 확정된 캠페인 보상금을 정산받습니다.',
      },
    ],
    cta: '진행 중인 캠페인 보기',
  },
} as const;
