import type {
  AiAnalyzeInput,
  AiConcept,
  AiReport,
} from '@/types/ai';
import type { PlatformType } from '@/types/auction';
import { formatWon } from '@/lib/utils';

const PLATFORM_LABEL: Record<string, string> = {
  youtube_shorts: 'YouTube Shorts',
  instagram_reels: 'Instagram Reels',
  tiktok: 'TikTok',
  x_twitter: 'X (Twitter)',
  other: '숏폼/브이로그',
};

function platformLabel(platform: string) {
  return PLATFORM_LABEL[platform] ?? PLATFORM_LABEL.other;
}

function safeTitle(title: string) {
  const value = title.trim();
  return value || '이번 캠페인';
}

export function buildFallbackReport(input: AiAnalyzeInput): AiReport {
  const title = safeTitle(input.title);
  const platform = platformLabel(input.platform);
  const budget =
    typeof input.budget === 'number' && Number.isFinite(input.budget)
      ? formatWon(input.budget)
      : '설정 예산';
  const focus = input.description.trim().slice(0, 40) || '제품의 핵심 메시지';

  const concepts: AiConcept[] = [
    {
      title: '3초 훅 비교 컷',
      summary: `${platform} 초반 3초에 문제-해결 대비를 넣고, "${title}"의 차별점을 한 문장으로 보여 주세요.`,
    },
    {
      title: '실제 사용 루틴',
      summary: `일상 루틴 속에 제품을 자연스럽게 배치하고 "${focus}"를 자막으로 반복해 신뢰도를 높이세요.`,
    },
    {
      title: 'CTA 챌린지',
      summary: `${budget} 규모에 맞춰 저장·공유를 유도하는 짧은 챌린지 또는 댓글 미션을 마지막 2초에 넣으세요.`,
    },
  ];

  return {
    concepts,
    expectedEffect: `${platform} 기준으로 첫 3초 이탈을 줄이고, 저장·프로필 방문 같은 전환 지표를 중심으로 성과를 보는 것이 좋습니다. 예산 ${budget}에서는 1~2명의 핵심 크리에이터로 콘셉트를 테스트한 뒤 반응이 좋은 훅을 확장하세요.`,
  };
}

export function normalizeReport(value: unknown, fallback: AiReport): AiReport {
  if (!value || typeof value !== 'object') {
    return fallback;
  }

  const raw = value as Partial<AiReport>;
  const concepts = Array.isArray(raw.concepts)
    ? raw.concepts
        .map((item) => {
          if (!item || typeof item !== 'object') {
            return null;
          }
          const concept = item as Partial<AiConcept>;
          const title = typeof concept.title === 'string' ? concept.title.trim() : '';
          const summary =
            typeof concept.summary === 'string' ? concept.summary.trim() : '';
          if (!title || !summary) {
            return null;
          }
          return { title, summary };
        })
        .filter((item): item is AiConcept => item !== null)
        .slice(0, 3)
    : [];

  const expectedEffect =
    typeof raw.expectedEffect === 'string' ? raw.expectedEffect.trim() : '';

  if (concepts.length < 3 || !expectedEffect) {
    return fallback;
  }

  return { concepts, expectedEffect };
}

export function isSupportedPlatform(value: string): value is PlatformType {
  return value in PLATFORM_LABEL;
}
