import {
  extractJsonPayload,
  GEMINI_FLASH_MODELS,
  geminiGenerateUrl,
  getGeminiApiKey,
} from '@/lib/ai-guide';
import {
  campaignCategoryLabel,
  isCampaignCategoryId,
  resolveCampaignCategory,
} from '@/lib/campaign-presentation';
import { platformLabel } from '@/lib/platforms';
import { isSupportedPlatform } from '@/lib/ai-report';

export type AiProposalRequest = {
  campaignTitle: string;
  campaignDescription: string;
  category: string;
  platform: string;
  creatorStyle: string;
};

export type AiProposalResponse = {
  proposal: string;
  fallback: boolean;
};

const PROPOSAL_MAX = 700;

export function parseProposalBody(value: unknown): AiProposalRequest {
  const body = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const platformRaw = typeof body.platform === 'string' ? body.platform.trim() : '';
  const categoryRaw = typeof body.category === 'string' ? body.category.trim() : '';
  return {
    campaignTitle: typeof body.campaignTitle === 'string' ? body.campaignTitle.trim() : '',
    campaignDescription:
      typeof body.campaignDescription === 'string' ? body.campaignDescription.trim() : '',
    category: categoryRaw,
    platform: platformRaw,
    creatorStyle: typeof body.creatorStyle === 'string' ? body.creatorStyle.trim() : '',
  };
}

export function proposalPlatformLabel(value: string) {
  if (isSupportedPlatform(value)) {
    return platformLabel(value);
  }
  return value || '숏폼';
}

export function proposalCategoryLabel(value: string) {
  if (isCampaignCategoryId(value)) {
    return campaignCategoryLabel(value);
  }
  const fromStored = resolveCampaignCategory({
    title: '',
    description: value,
    category: value,
  });
  if (fromStored) {
    return campaignCategoryLabel(fromStored);
  }
  return value || '콘텐츠';
}

export function clipProposal(text: string) {
  const value = text.trim().replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  if (value.length <= PROPOSAL_MAX) {
    return value;
  }
  return value.slice(0, PROPOSAL_MAX).trim();
}

export function parseProposalPayload(value: unknown): string | null {
  if (typeof value === 'string') {
    const clipped = clipProposal(value);
    return clipped.length >= 40 ? clipped : null;
  }
  if (!value || typeof value !== 'object') {
    return null;
  }
  const raw = value as { proposal?: unknown; text?: unknown };
  const source =
    typeof raw.proposal === 'string'
      ? raw.proposal
      : typeof raw.text === 'string'
        ? raw.text
        : '';
  const clipped = clipProposal(source);
  return clipped.length >= 40 ? clipped : null;
}

export function buildProposalPrompt(input: AiProposalRequest) {
  const style = input.creatorStyle || '채널 톤은 솔직하고 구체적인 사용 후기 중심';
  const category = proposalCategoryLabel(input.category);
  const platform = proposalPlatformLabel(input.platform);
  return `당신은 숏폼/브랜디드 콘텐츠 전문 크리에이터 매니저입니다. 아래 캠페인 정보와 크리에이터 채널 스타일을 반영해 광고주가 바로 채택하고 싶을 만큼 매력적인 크리에이터 지원 제안서 초안을 한국어로 작성하세요.

[필수 구성]
1) 한 줄 기획 콘셉트 (후킹 포인트)
2) 촬영 및 편집 구성안 (도입부 0~3초 / 본론 / 엔딩 CTA)
3) 이 캠페인에 딱 맞는 이유 (어필 포인트)

[규칙]
- 과장된 수치(예상 조회수 몇 만 뷰 보장 등)는 쓰지 마세요.
- 구체적인 영상 연출과 크리에이터만의 진정성 있는 스토리텔링 중심으로 350~500자 내외로 작성하세요.
- 캠페인 1건당 크리에이터 1명이 고밀도 콘텐츠 1편을 만드는 1:1 매칭 기준으로만 쓰세요.
- "여러 명과 협업", "예산을 나눠", "3~5명" 같은 표현은 금지입니다.
- Gemini라는 단어는 쓰지 마세요.
- JSON만 반환하세요. 필드: proposal(문자열)

캠페인 제목: ${input.campaignTitle || '제목 없음'}
캠페인 설명: ${input.campaignDescription || '설명 없음'}
콘텐츠 분야: ${category}
모집 플랫폼: ${platform}
크리에이터 채널 스타일: ${style}`;
}

export function buildFallbackProposal(input: AiProposalRequest) {
  const title = input.campaignTitle || '이번 캠페인';
  const category = proposalCategoryLabel(input.category);
  const platform = proposalPlatformLabel(input.platform);
  const style = input.creatorStyle || '솔직한 사용 후기와 일상 연출';
  const focus = input.campaignDescription.slice(0, 48) || '제품의 핵심 사용 장면';
  return clipProposal(`한 줄 기획 콘셉트
${style}로 ${title}의 차별점을 첫 3초에 보여주는 1:1 맞춤 ${platform}입니다.

촬영 및 편집 구성안
도입부 0~3초: 화면을 가득 채운 클로즈업과 한 문장 훅으로 바로 관심을 끕니다.
본론: ${category} 톤으로 ${focus}를 실제 사용 루틴 속에 자연스럽게 녹입니다.
엔딩 CTA: 마지막 2초에 프로필 링크와 저장을 차분히 안내합니다.

이 캠페인에 딱 맞는 이유
과장된 조회수 약속 대신, 선정된 1편의 고밀도 콘텐츠로 제품 설득과 채널 톤을 맞춰 광고주가 바로 채택할 수 있는 기획을 제안합니다.`);
}

export function proposalGeminiRequestBody(input: AiProposalRequest) {
  return {
    contents: [
      {
        role: 'user',
        parts: [{ text: buildProposalPrompt(input) }],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.7,
      responseSchema: {
        type: 'OBJECT',
        properties: {
          proposal: { type: 'STRING' },
        },
        required: ['proposal'],
      },
    },
  };
}

export { GEMINI_FLASH_MODELS, geminiGenerateUrl, getGeminiApiKey, extractJsonPayload };
