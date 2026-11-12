import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import {
  buildFallbackProposal,
  clipProposal,
  extractJsonPayload,
  GEMINI_FLASH_MODELS,
  geminiGenerateUrl,
  getGeminiApiKey,
  parseProposalBody,
  parseProposalPayload,
  proposalGeminiRequestBody,
} from '@/lib/ai-proposal';
import { getPaymentActor, unauthorizedJson, forbiddenJson } from '@/lib/payments/guard';
import { parseAuthRoles } from '@/types/auth';
import type { AiProposalResponse } from '@/lib/ai-proposal';

const TIMEOUT_MS = 15_000;

function successJson(proposal: string, fallback = false) {
  return NextResponse.json({
    proposal: clipProposal(proposal),
    fallback,
  } satisfies AiProposalResponse);
}

function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => {
    clearTimeout(timer);
  });
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

function canCreateProposal(actor: Awaited<ReturnType<typeof getPaymentActor>>) {
  const roles = parseAuthRoles(actor);
  return roles.includes('creator') || roles.includes('admin');
}

async function generateWithGemini(input: ReturnType<typeof parseProposalBody>, apiKey: string) {
  let lastError: Error | null = null;

  for (const model of GEMINI_FLASH_MODELS) {
    try {
      const response = await fetchWithTimeout(geminiGenerateUrl(model), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(proposalGeminiRequestBody(input)),
      });

      if (response.status === 404) {
        lastError = new Error(`AI model unavailable: ${model}`);
        continue;
      }
      if (!response.ok) {
        lastError = new Error(`AI HTTP ${response.status}`);
        continue;
      }

      const payload = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = readCandidateText(payload);
      if (!text) {
        lastError = new Error('AI empty content');
        continue;
      }

      const parsed = parseProposalPayload(extractJsonPayload(text)) ?? parseProposalPayload(text);
      if (!parsed) {
        lastError = new Error('AI proposal schema mismatch');
        continue;
      }
      return parsed;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('AI request failed');
    }
  }

  throw lastError ?? new Error('AI request failed');
}

export async function POST(request: Request) {
  try {
    await connection();
    const actor = await getPaymentActor();
    if (!actor) {
      return unauthorizedJson('제안서 초안을 만들려면 로그인해 주세요.');
    }
    if (!canCreateProposal(actor)) {
      return forbiddenJson('크리에이터 계정으로만 AI 제안서 초안을 만들 수 있습니다.');
    }

    const input = parseProposalBody(await request.json().catch(() => ({})));
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      return successJson(buildFallbackProposal(input), true);
    }

    try {
      const proposal = await generateWithGemini(input, apiKey);
      return successJson(proposal);
    } catch {
      return successJson(buildFallbackProposal(input), true);
    }
  } catch {
    return successJson(
      buildFallbackProposal({
        campaignTitle: '',
        campaignDescription: '',
        category: '',
        platform: '',
        creatorStyle: '',
      }),
      true,
    );
  }
}
