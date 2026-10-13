import { NextResponse } from 'next/server';
import {
  buildFallbackReport,
  isSupportedPlatform,
  normalizeReport,
} from '@/lib/ai-report';
import type { AiAnalyzeInput, AiAnalyzeResponse, AiReport } from '@/types/ai';

const TIMEOUT_MS = 8_000;

function fallbackResponse(input: AiAnalyzeInput): NextResponse<AiAnalyzeResponse> {
  return NextResponse.json({
    source: 'fallback',
    report: buildFallbackReport(input),
  });
}

function parseBody(value: unknown): AiAnalyzeInput {
  const body = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const platformRaw = typeof body.platform === 'string' ? body.platform : 'other';

  return {
    title: typeof body.title === 'string' ? body.title : '',
    platform: isSupportedPlatform(platformRaw) ? platformRaw : 'other',
    budget: typeof body.budget === 'number' && Number.isFinite(body.budget) ? body.budget : 0,
    description: typeof body.description === 'string' ? body.description : '',
  };
}

function getOpenAiKey() {
  return process.env.OPENAI_API_KEY?.trim() || '';
}

function getAnthropicKey() {
  return (
    process.env.ANTHROPIC_API_KEY?.trim() ||
    process.env.CLAUDE_API_KEY?.trim() ||
    ''
  );
}

function buildPrompt(input: AiAnalyzeInput) {
  return `당신은 마이크로 스폰서십 캠페인 컨설턴트입니다. 아래 광고 요청을 보고 JSON만 반환하세요.
필드: concepts(배열 3개, 각 항목은 title과 summary), expectedEffect(문자열).
추천 영상 콘셉트 3가지와 예상 효과를 구체적으로, 한국어로 작성하세요.

제목: ${input.title || '제목 없음'}
플랫폼: ${input.platform}
예산: ${input.budget}
설명: ${input.description || '설명 없음'}`;
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const payload = fenced?.[1] ?? trimmed;
  return JSON.parse(payload) as unknown;
}

async function analyzeWithOpenAi(input: AiAnalyzeInput, apiKey: string): Promise<AiReport> {
  const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.6,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'Return only valid JSON for a sponsorship video consulting report.',
        },
        { role: 'user', content: buildPrompt(input) },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI HTTP ${response.status}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI empty content');
  }

  return normalizeReport(extractJson(content), buildFallbackReport(input));
}

async function analyzeWithClaude(input: AiAnalyzeInput, apiKey: string): Promise<AiReport> {
  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-latest',
      max_tokens: 800,
      temperature: 0.6,
      messages: [{ role: 'user', content: buildPrompt(input) }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude HTTP ${response.status}`);
  }

  const payload = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const content = payload.content?.find((item) => item.type === 'text')?.text;
  if (!content) {
    throw new Error('Claude empty content');
  }

  return normalizeReport(extractJson(content), buildFallbackReport(input));
}

export async function POST(request: Request) {
  let input: AiAnalyzeInput = {
    title: '',
    platform: 'other',
    budget: 0,
    description: '',
  };

  try {
    const body = await request.json().catch(() => ({}));
    input = parseBody(body);

    const openAiKey = getOpenAiKey();
    const anthropicKey = getAnthropicKey();

    if (!openAiKey && !anthropicKey) {
      return fallbackResponse(input);
    }

    const report = openAiKey
      ? await analyzeWithOpenAi(input, openAiKey)
      : await analyzeWithClaude(input, anthropicKey);

    return NextResponse.json({
      source: 'ai',
      report,
    } satisfies AiAnalyzeResponse);
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === 'AbortError' || error.message.toLowerCase().includes('abort'));

    if (timedOut) {
      console.warn('[SponsorAuction] AI 분석이 8초를 초과해 기본 리포트로 전환합니다.');
    } else {
      console.warn('[SponsorAuction] AI 분석에 실패해 기본 리포트로 전환합니다.', error);
    }

    return fallbackResponse(input);
  }
}
