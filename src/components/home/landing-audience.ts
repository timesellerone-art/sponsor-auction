import { ADVERTISER_FEE_PERCENT, creatorFeePolicyCopy } from '@/lib/fee-policy';

export type LandingAudience = 'advertiser' | 'creator';

export const LANDING_AUDIENCE_STORAGE_KEY = 'clink-landing-audience';
export const LANDING_AUDIENCE_CHANGED_EVENT = 'landing-audience:changed';

export function readLandingAudience(): LandingAudience {
  if (typeof window === 'undefined') {
    return 'advertiser';
  }
  try {
    const raw = window.sessionStorage.getItem(LANDING_AUDIENCE_STORAGE_KEY);
    if (raw === 'creator' || raw === 'advertiser') {
      return raw;
    }
  } catch {
    // 저장소를 쓸 수 없으면 기본 광고주 소개를 사용합니다.
  }
  return 'advertiser';
}

export function writeLandingAudience(next: LandingAudience) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.sessionStorage.setItem(LANDING_AUDIENCE_STORAGE_KEY, next);
  } catch {
    // 저장 실패해도 이번 화면 선택은 유지합니다.
  }
  window.dispatchEvent(new Event(LANDING_AUDIENCE_CHANGED_EVENT));
}

export const LANDING_ROLE_TABS = [
  { id: 'advertiser' as const, label: '광고주 (브랜드)' },
  { id: 'creator' as const, label: '크리에이터 (개인·팀)' },
] as const;

export const LANDING_INTRO = {
  advertiser: {
    eyebrow: '브랜드를 위한 1:1 크리에이터(개인 또는 팀) 매칭',
    headline: '확정 지급액과 제품만 올리면, 핏이 맞는 크리에이터가 기획안을 지원합니다',
    sub: '제품 정보와 캠페인 단가를 등록하면 AI가 촬영 가이드를 정리하고, 여러 크리에이터가 콘셉트·포트폴리오로 지원합니다.',
    cta: '캠페인 등록하기',
    secondaryCta: '크리에이터 상품 보기',
  },
  creator: {
    eyebrow: '크리에이터를 위한 AI 제안서',
    headline: '내 채널에 어울리는 캠페인을 찾고, AI 제안서로 빠르게 스폰서십을 수주하세요',
    sub: '분야별 오픈 캠페인을 고르고 채널 스타일만 입력하면 AI 제안서 초안이 완성됩니다. 개인이든 팀이든 광고주가 채택하면 1:1로 제작이 시작됩니다.',
    cta: '진행 중인 캠페인 보기',
    secondaryCta: '크리에이터 상품 등록하기',
  },
} as const;

export const LANDING_GUIDE = {
  advertiser: {
    title: '등록, 1:1 매칭, 결제가 한 화면에서 이어집니다',
    steps: [
      {
        step: 'STEP 01',
        title: '캠페인 등록 & AI 가이드',
        body: '제품 정보와 확정 지급액(캠페인 모집 단가)을 입력하면 AI가 크리에이터용 핵심 촬영 가이드를 정리합니다.',
      },
      {
        step: 'STEP 02',
        title: '제안서 비교 & 1:1 매칭',
        body: '접수된 크리에이터(개인 또는 팀)의 기획 제안서를 비교하고 가장 적합한 1곳을 선정합니다. 계약·정산 주체는 대표 계정입니다.',
      },
      {
        step: 'STEP 03',
        title: '단건 에스크로 결제 & 구매 확정',
        body: `크리에이터 선정 후 확정 용역비에 광고주 수수료 ${ADVERTISER_FEE_PERCENT}%와 부가세 10%를 더한 금액을 토스페이먼츠 단건 에스크로로 결제합니다. 납품을 확인한 뒤 구매 확정하면 정산이 진행됩니다.`,
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
        body: '광고주가 제안서를 채택하면 크리에이터(개인 또는 팀)와 1:1 매칭이 확정되며, 계약·정산은 대표 계정 기준으로 진행됩니다.',
      },
      {
        step: 'STEP 03',
        title: '납품 & 구매 확정 후 정산',
        body: `콘텐츠 납품 및 광고주 구매 확정 후, 확정 지급액에서 구간별 수수료(${creatorFeePolicyCopy(' / ')})를 공제한 금액을 정산받습니다.`,
      },
    ],
    cta: '진행 중인 캠페인 보기',
  },
} as const;
