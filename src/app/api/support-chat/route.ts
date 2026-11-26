import { rethrowPrerenderError } from '@/lib/prerender-error';
import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { extractJsonPayload, geminiGenerateUrl, getGeminiApiKey } from '@/lib/ai-guide';
import { clientIp, consumeKeyedRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import {
  SUPPORT_CHAT_MODELS,
  SUPPORT_CHAT_RATE_LIMIT,
  SUPPORT_ESCALATION_MESSAGE,
  SUPPORT_FALLBACK_MESSAGE,
  SUPPORT_MESSAGE_MAX_LENGTH,
  answerSupportLocally,
  buildSupportSystemPrompt,
  isOperatorSupportCase,
  parseSupportModelPayload,
  quoteContextFromUserText,
  sanitizeSupportReply,
} from '@/lib/support-knowledge';

const TIMEOUT_MS = 12_000;
const HISTORY_MAX = 8;

type ChatTurn = {
  role?: unknown;
  content?: unknown;
};

function jsonOk(reply: string, escalate = false) {
  return NextResponse.json({ reply, escalate });
}

function withEscalation(reply: string, escalate: boolean) {
  const text = reply.trim() || SUPPORT_FALLBACK_MESSAGE;
  if (!escalate) {
    return jsonOk(text, false);
  }
  if (text.includes('1:1 문의')) {
    return jsonOk(text, true);
  }
  return jsonOk(`${text}\n\n${SUPPORT_ESCALATION_MESSAGE}`, true);
}

function readTurns(value: unknown): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (!Array.isArray(value)) {
    return [];
  }
  const turns: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const item of value as ChatTurn[]) {
    const role = item?.role === 'assistant' ? 'assistant' : item?.role === 'user' ? 'user' : null;
    const content = typeof item?.content === 'string' ? item.content.trim() : '';
    if (!role || !content) {
      continue;
    }
    turns.push({ role, content: content.slice(0, SUPPORT_MESSAGE_MAX_LENGTH) });
    if (turns.length >= HISTORY_MAX) {
      break;
    }
  }
  return turns;
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timer);
  }
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

export async function POST(request: Request) {
  try {
    await connection();
  } catch {
    // 동적 렌더 힌트가 실패해도 상담 응답은 계속합니다.
  }

  const ip = clientIp(request);
  const limited = consumeKeyedRateLimit(`support-chat:${ip}`, SUPPORT_CHAT_RATE_LIMIT);
  if (!limited.allowed) {
    return rateLimitResponse(limited.retryAfter);
  }

  const body = (await request.json().catch(() => null)) as {
    message?: unknown;
    history?: unknown;
  } | null;
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message) {
    return NextResponse.json({ error: '메시지를 입력해 주세요.' }, { status: 400 });
  }
  if (message.length > SUPPORT_MESSAGE_MAX_LENGTH) {
    return NextResponse.json(
      { error: `메시지는 ${SUPPORT_MESSAGE_MAX_LENGTH}자까지 보낼 수 있습니다.` },
      { status: 400 },
    );
  }

  const history = readTurns(body?.history);
  const operatorCase = isOperatorSupportCase(message);
  const local = answerSupportLocally(message);
  if (local?.reply) {
    return withEscalation(local.reply, operatorCase);
  }

  const quoteContext = quoteContextFromUserText(message);
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    if (quoteContext) {
      return withEscalation(quoteContext, operatorCase);
    }
    return withEscalation(SUPPORT_FALLBACK_MESSAGE, operatorCase);
  }

  const contents = [
    ...history.map((turn) => ({
      role: turn.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: turn.content }],
    })),
    { role: 'user', parts: [{ text: message }] },
  ];

  let lastError: Error | null = null;
  for (const model of SUPPORT_CHAT_MODELS) {
    try {
      const response = await fetchWithTimeout(geminiGenerateUrl(model), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: buildSupportSystemPrompt(quoteContext) }] },
          contents,
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2000,
            responseMimeType: 'application/json',
          },
        }),
      });
      if (response.status === 404) {
        lastError = new Error(`model unavailable: ${model}`);
        continue;
      }
      if (!response.ok) {
        lastError = new Error(`HTTP ${response.status}`);
        continue;
      }
      const payload = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = readCandidateText(payload);
      if (!text) {
        lastError = new Error('empty content');
        continue;
      }
      let parsed: unknown = text;
      try {
        parsed = extractJsonPayload(text);
      } catch {
        parsed = quoteContext ? { reply: quoteContext, escalate: false } : null;
      }
      const result = parseSupportModelPayload(parsed);
      if (!result) {
        lastError = new Error('schema mismatch');
        if (quoteContext) {
          return withEscalation(quoteContext, operatorCase);
        }
        continue;
      }
      const reply = sanitizeSupportReply(result.reply, quoteContext);
      return withEscalation(reply, operatorCase);
    } catch (error) {
      rethrowPrerenderError(error);
      lastError = error instanceof Error ? error : new Error('request failed');
    }
  }

  console.warn('[Clink] 고객 상담 모델 응답 실패', lastError?.message);
  if (quoteContext) {
    return withEscalation(quoteContext, operatorCase);
  }
  return withEscalation(SUPPORT_FALLBACK_MESSAGE, operatorCase);
}
