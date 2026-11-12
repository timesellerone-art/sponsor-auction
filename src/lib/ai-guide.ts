import type {
  AiGuideConcept,
  AiGuidePayload,
  AiGuideRequest,
  AiReport,
} from '@/types/ai';

export const AI_GUIDE_CACHE_PREFIX = 'sa:ai-guide:v2:';
export const AI_GUIDE_PROMPT_VERSION = 'v2-1to1';

export const AI_GUIDE_MATCHING_RULES = `[절대 금지]: "3~5명과 협업", "여러 크리에이터와 나누어", "다수의 인플루언서 분산 집행" 등 예산을 쪼개어 여러 명과 동시에 매칭한다는 표현은 절대 사용하지 마세요.
[필수 기준]: 본 플랫폼은 캠페인 1건당 가장 기획력이 뛰어난 단 1명의 크리에이터를 선정하여 1:1로 집중 제작하는 방식입니다. 모든 전략과 기대 포인트는 '선정된 1명의 크리에이터가 해당 예산을 바탕으로 고밀도 콘텐츠 1편을 제작하는 기준'으로만 작성하세요.`;

export const GEMINI_FLASH_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-flash-latest',
] as const;

export const GEMINI_GENERATE_PATH = 'https://generativelanguage.googleapis.com/v1beta/models';

const TITLE_MAX = 15;
const DESCRIPTION_SENTENCE_MAX = 2;

function cleanEnvValue(value: string | undefined) {
  const raw = value?.trim().replace(/^["']+|["']+$/g, '') ?? '';
  if (!raw || /YOUR_|placeholder|_HERE$/i.test(raw)) {
    return '';
  }
  return raw;
}

export function getGeminiApiKey(env: Record<string, string | undefined> = process.env) {
  return (
    cleanEnvValue(env.GEMINI_API_KEY) ||
    cleanEnvValue(env.GOOGLE_GENERATIVE_AI_API_KEY) ||
    cleanEnvValue(env.GOOGLE_API_KEY)
  );
}

export function geminiGenerateUrl(model: string) {
  return `${GEMINI_GENERATE_PATH}/${model}:generateContent`;
}

export function guideFingerprint(input: Pick<AiGuideRequest, 'title' | 'description' | 'platform' | 'budget'>) {
  return [
    AI_GUIDE_PROMPT_VERSION,
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
  const raw = value as {
    concepts?: unknown;
    expectedEffect?: unknown;
    expected_effect?: unknown;
  };
  const concepts = Array.isArray(raw.concepts)
    ? raw.concepts.map(conceptFromUnknown).filter((item): item is AiGuideConcept => item !== null).slice(0, 3)
    : [];
  const effectSource =
    typeof raw.expectedEffect === 'string'
      ? raw.expectedEffect
      : typeof raw.expected_effect === 'string'
        ? raw.expected_effect
        : '';
  const expectedEffect = clipSentences(effectSource, DESCRIPTION_SENTENCE_MAX);
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
${AI_GUIDE_MATCHING_RULES}
규칙:
- 반드시 한국어
- concepts는 정확히 3개
- 각 title은 15자 이내
- 각 description은 구체적인 촬영/연출 가이드 2문장 이내
- expectedEffect는 수치 예측이 아닌 캠페인 핵심 전략(선정된 1명의 크리에이터가 해당 예산으로 고밀도 콘텐츠 1편을 만들 때의 연출·전환 포인트) 2문장 이내
- JSON 외 텍스트 금지

캠페인 제목: ${input.title || '제목 없음'}
플랫폼: ${input.platform || 'other'}
예산: ${budget}
상세 내용: ${input.description}`;
}
