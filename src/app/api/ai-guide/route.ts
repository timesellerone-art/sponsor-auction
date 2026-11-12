import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import {
  AI_GUIDE_MATCHING_RULES,
  GEMINI_FLASH_MODELS,
  buildGuidePrompt,
  extractJsonPayload,
  geminiGenerateUrl,
  getGeminiApiKey,
  guideFingerprint,
  isLowQualityDescription,
  parseGuidePayload,
} from '@/lib/ai-guide';
import { isSupportedPlatform } from '@/lib/ai-report';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSchemaMismatch } from '@/lib/supabase/errors';
import { isUuid } from '@/lib/uuid';
import type { AiGuidePayload, AiGuideRequest, AiGuideResponse } from '@/types/ai';

const TIMEOUT_MS = 15_000;
const memoryCache = new Map<string, { fingerprint: string; payload: AiGuidePayload }>();

function fallbackJson() {
  return NextResponse.json({ fallback: true } satisfies AiGuideResponse);
}

function successJson(payload: AiGuidePayload, cached = false) {
  return NextResponse.json({
    fallback: false,
    cached,
    concepts: payload.concepts,
    expectedEffect: payload.expectedEffect,
  } satisfies AiGuideResponse);
}

function parseBody(value: unknown): AiGuideRequest {
  const body = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const platformRaw = typeof body.platform === 'string' ? body.platform : 'other';
  return {
    campaignId: typeof body.campaignId === 'string' ? body.campaignId.trim() : '',
    title: typeof body.title === 'string' ? body.title : '',
    description: typeof body.description === 'string' ? body.description : '',
    platform: isSupportedPlatform(platformRaw) ? platformRaw : 'other',
    budget: typeof body.budget === 'number' && Number.isFinite(body.budget) ? body.budget : 0,
  };
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

function cacheKey(campaignId: string, fingerprint: string) {
  return campaignId || fingerprint;
}

function readMemory(campaignId: string, fingerprint: string) {
  const hit = memoryCache.get(cacheKey(campaignId, fingerprint));
  if (hit && hit.fingerprint === fingerprint) {
    return hit.payload;
  }
  return null;
}

function writeMemory(campaignId: string, fingerprint: string, payload: AiGuidePayload) {
  memoryCache.set(cacheKey(campaignId, fingerprint), { fingerprint, payload });
}

function canUseGuideDb() {
  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    ''
  ).trim();
  return key.length >= 20;
}

async function readDbGuide(campaignId: string, fingerprint: string) {
  if (!isUuid(campaignId) || !canUseGuideDb()) {
    return null;
  }
  const client = createAdminClient();
  if (!client) {
    return null;
  }
  try {
    const { data, error } = await client
      .from('auctions')
      .select('ai_guide')
      .eq('id', campaignId)
      .maybeSingle();
    if (error) {
      if (!isSchemaMismatch(error)) {
        console.warn('[SponsorAuction] AI 가이드 DB 조회 실패', error.message);
      }
      return null;
    }
    const stored = data?.ai_guide;
    if (!stored || stored.fingerprint !== fingerprint) {
      return null;
    }
    return parseGuidePayload(stored);
  } catch {
    return null;
  }
}

async function writeDbGuide(campaignId: string, fingerprint: string, payload: AiGuidePayload) {
  if (!isUuid(campaignId) || !canUseGuideDb()) {
    return;
  }
  const client = createAdminClient();
  if (!client) {
    return;
  }
  try {
    const { error } = await client
      .from('auctions')
      .update({
        ai_guide: {
          fingerprint,
          concepts: payload.concepts,
          expectedEffect: payload.expectedEffect,
        },
      })
      .eq('id', campaignId);
    if (error && !isSchemaMismatch(error)) {
      console.warn('[SponsorAuction] AI 가이드 DB 저장 실패', error.message);
    }
  } catch {
    // 컬럼 미적용 환경에서는 로컬/메모리 캐시만 사용합니다.
  }
}

function geminiRequestBody(input: AiGuideRequest) {
  return {
    systemInstruction: {
      parts: [{ text: AI_GUIDE_MATCHING_RULES }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: buildGuidePrompt(input) }],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.7,
      responseSchema: {
        type: 'OBJECT',
        properties: {
          concepts: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                title: { type: 'STRING' },
                description: { type: 'STRING' },
              },
              required: ['title', 'description'],
            },
          },
          expectedEffect: { type: 'STRING' },
        },
        required: ['concepts', 'expectedEffect'],
      },
    },
  };
}

function readCandidateText(payload: {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}) {
  return (
    payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
      .trim() ?? ''
  );
}

async function generateWithGemini(input: AiGuideRequest, apiKey: string) {
  let lastError: Error | null = null;

  for (const model of GEMINI_FLASH_MODELS) {
    try {
      const response = await fetchWithTimeout(geminiGenerateUrl(model), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(geminiRequestBody(input)),
      });

      if (response.status === 404) {
        lastError = new Error(`Gemini model unavailable: ${model}`);
        continue;
      }
      if (!response.ok) {
        lastError = new Error(`Gemini HTTP ${response.status}`);
        continue;
      }

      const payload = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = readCandidateText(payload);
      if (!text) {
        lastError = new Error('Gemini empty content');
        continue;
      }

      const parsed = parseGuidePayload(extractJsonPayload(text));
      if (!parsed) {
        lastError = new Error('Gemini JSON schema mismatch');
        continue;
      }
      return parsed;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Gemini request failed');
    }
  }

  throw lastError ?? new Error('Gemini request failed');
}

export async function POST(request: Request) {
  try {
    await connection();
    const input = parseBody(await request.json().catch(() => ({})));
    if (isLowQualityDescription(input.description) || !getGeminiApiKey()) {
      return fallbackJson();
    }

    const fingerprint = guideFingerprint(input);
    const campaignId = input.campaignId ?? '';

    const fromMemory = readMemory(campaignId, fingerprint);
    if (fromMemory) {
      return successJson(fromMemory, true);
    }

    const fromDb = await readDbGuide(campaignId, fingerprint);
    if (fromDb) {
      writeMemory(campaignId, fingerprint, fromDb);
      return successJson(fromDb, true);
    }

    const report = await generateWithGemini(input, getGeminiApiKey());
    writeMemory(campaignId, fingerprint, report);
    void writeDbGuide(campaignId, fingerprint, report);
    return successJson(report);
  } catch {
    return fallbackJson();
  }
}
