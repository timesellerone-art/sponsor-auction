import type {
  AiGuideConcept,
  AiGuidePayload,
  AiGuideRequest,
  AiReport,
} from '@/types/ai';

export const AI_GUIDE_CACHE_PREFIX = 'sa:ai-guide:v1:';

const TITLE_MAX = 15;
const DESCRIPTION_SENTENCE_MAX = 2;

export function getGeminiApiKey(env: Record<string, string | undefined> = process.env) {
  const raw = env.GEMINI_API_KEY?.trim().replace(/^["']+|["']+$/g, '') ?? '';
  if (!raw || /YOUR_|placeholder|_HERE$/i.test(raw)) {
    return '';
  }
  return raw;
}

export function guideFingerprint(input: Pick<AiGuideRequest, 'title' | 'description' | 'platform' | 'budget'>) {
  return [
    (input.title ?? '').trim(),
    String(input.platform ?? '').trim(),
    String(Number.isFinite(input.budget) ? input.budget : 0),
    (input.description ?? '').trim(),
  ].join('\n');
}

export function isLowQualityDescription(raw: string | null | undefined) {
  const text = (raw ?? '').trim();
  if (!text) {
    return true;
  }

  const compact = text.replace(/\s+/g, '');
  if (compact.length < 10) {
    return true;
  }

  if (/^(.)\1{9,}$/u.test(compact)) {
    return true;
  }

  if (/^(.{1,4})\1{3,}$/u.test(compact)) {
    return true;
  }

  if (/^[ㄱ-ㅎㅏ-ㅣ]+$/u.test(compact)) {
    return true;
  }

  const uniqueChars = new Set(Array.from(compact)).size;
  if (uniqueChars <= 2) {
    return true;
  }

  const tokens = text.split(/[\s,./·|]+/u).filter(Boolean);
  if (tokens.length >= 4 && new Set(tokens).size === 1) {
    return true;
  }

  return false;
}

function clip(value: string, max: number) {
  const text = value.trim().replace(/\s+/g, ' ');
  return text.length <= max ? text : text.slice(0, max);
}

function clipSentences(value: string, maxSentences: number) {
  const text = value.trim().replace(/\s+/g, ' ');
  const parts = text.match(/[^.!?。！？]+[.!?。！？]?/g);
  if (!parts || parts.length <= maxSentences) {
    return text;
  }
  return parts
    .slice(0, maxSentences)
    .map((part) => part.trim())
    .join(' ');
}

function conceptFromUnknown(value: unknown): AiGuideConcept | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const raw = value as { title?: unknown; description?: unknown; summary?: unknown };
  const title = typeof raw.title === 'string' ? clip(raw.title, TITLE_MAX) : '';
  const descriptionSource =
    typeof raw.description === 'string'
      ? raw.description
      : typeof raw.summary === 'string'
        ? raw.summary
        : '';
  const description = clipSentences(descriptionSource, DESCRIPTION_SENTENCE_MAX);
  if (!title || !description) {
    return null;
  }
  return { title, description };
}

export function parseGuidePayload(value: unknown): AiGuidePayload | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const raw = value as { concepts?: unknown; expectedEffect?: unknown };
  const concepts = Array.isArray(raw.concepts)
    ? raw.concepts.map(conceptFromUnknown).filter((item): item is AiGuideConcept => item !== null).slice(0, 3)
    : [];
  const expectedEffect =
    typeof raw.expectedEffect === 'string'
      ? clipSentences(raw.expectedEffect, DESCRIPTION_SENTENCE_MAX)
      : '';
  if (concepts.length < 3 || !expectedEffect) {
    return null;
  }
  return { concepts, expectedEffect };
}

export function guideToAiReport(payload: AiGuidePayload): AiReport {
  return {
    concepts: payload.concepts.map((concept) => ({
      title: concept.title,
      summary: concept.description,
    })),
    expectedEffect: payload.expectedEffect,
  };
}

export function extractJsonPayload(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const payload = (fenced?.[1] ?? trimmed).trim();
  return JSON.parse(payload) as unknown;
}

type CachedGuide = AiGuidePayload & { fingerprint: string };

function isBrowser() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function readCachedAiGuide(campaignId: string, fingerprint: string): AiGuidePayload | null {
  if (!isBrowser() || !campaignId) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(`${AI_GUIDE_CACHE_PREFIX}${campaignId}`);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as CachedGuide;
    if (parsed.fingerprint !== fingerprint) {
      return null;
    }
    return parseGuidePayload(parsed);
  } catch {
    return null;
  }
}

export function writeCachedAiGuide(
  campaignId: string,
  fingerprint: string,
  payload: AiGuidePayload,
) {
  if (!isBrowser() || !campaignId) {
    return;
  }
  try {
    const record: CachedGuide = { fingerprint, ...payload };
    window.localStorage.setItem(`${AI_GUIDE_CACHE_PREFIX}${campaignId}`, JSON.stringify(record));
  } catch {
    // quota / private mode
  }
}

export function buildGuidePrompt(input: AiGuideRequest) {
  const budget =
    typeof input.budget === 'number' && Number.isFinite(input.budget) ? `${input.budget}원` : '미정';
  return `당신은 한국 숏폼 광고 디렉터입니다. 아래 캠페인을 분석해 크리에이터가 바로 촬영에 쓸 수 있는 구체적인 콘셉트만 JSON으로 작성하세요.
규칙:
- 반드시 한국어
- concepts는 정확히 3개
- 각 title은 15자 이내
- 각 description은 구체적인 촬영/연출 가이드 2문장 이내
- expectedEffect는 캠페인 예산과 플랫폼 특성을 반영한 예상 성과 및 운영 전략 2문장 이내
- JSON 외 텍스트 금지

캠페인 제목: ${input.title || '제목 없음'}
플랫폼: ${input.platform || 'other'}
예산: ${budget}
상세 내용: ${input.description}`;
}
