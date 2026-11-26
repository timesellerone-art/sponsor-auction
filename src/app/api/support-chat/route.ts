import { rethrowPrerenderError } from '@/lib/prerender-error';
import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import {
  GEMINI_API_KEY_ENV_NAMES,
  geminiGenerateUrl,
  getGeminiApiKey,
  getGeminiApiKeyEnvName,
} from '@/lib/ai-guide';
import { clientIp, consumeKeyedRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import {
  SUPPORT_CHAT_MODELS,
  SUPPORT_CHAT_RATE_LIMIT,
  SUPPORT_ESCALATION_MESSAGE,
  SUPPORT_FALLBACK_MESSAGE,
  SUPPORT_MESSAGE_MAX_LENGTH,
  answerSupportLocally,
  buildSupportSystemPrompt,
  classifyGeminiHttpStatus,
  classifyGeminiThrown,
  isOperatorSupportCase,
  quoteContextFromUserText,
  sanitizeSupportReply,
  supportReplyFromModelText,
  type SupportAiDebug,
} from '@/lib/support-knowledge';

const TIMEOUT_MS = 20_000;
const HISTORY_MAX = 8;
const FATAL_REASONS = new Set(['invalid_api_key', 'forbidden', 'quota']);

type ChatTurn = {
  role?: unknown;
  content?: unknown;
};

function jsonOk(reply: string, escalate = false, debug?: SupportAiDebug) {
  return NextResponse.json({ reply, escalate, debug });
}

function withEscalation(reply: string, escalate: boolean, debug?: SupportAiDebug) {
  const text = reply.trim() || SUPPORT_FALLBACK_MESSAGE;
  if (!escalate) {
    return jsonOk(text, false, debug);
  }
  if (text.includes('1:1 문의')) {
    return jsonOk(text, true, debug);
  }
  return jsonOk(`${text}\n\n${SUPPORT_ESCALATION_MESSAGE}`, true, debug);
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

async function readGeminiErrorBody(response: Response) {
  const raw = await response.text().catch(() => '');
  try {
    const json = JSON.parse(raw) as { error?: { message?: string; status?: string; code?: number } };
    const message = json.error?.message || json.error?.status || '';
    return message.slice(0, 180);
  } catch {
    return raw.replace(/\s+/g, ' ').slice(0, 180);
  }
}

function logSupportFailure(debug: SupportAiDebug) {
  console.warn('[Clink] 고객 상담 Gemini 실패', {
    reason: debug.reason,
    status: debug.status,
    model: debug.model,
    hasApiKey: debug.hasApiKey,
    keyEnv: debug.keyEnv,
    triedModels: debug.triedModels,
    detail: debug.detail,
  });
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
  const quoteContext = quoteContextFromUserText(message);
  const apiKey = getGeminiApiKey();
  const keyEnv = getGeminiApiKeyEnvName();
  const local = answerSupportLocally(message);

  if (!apiKey) {
    const debug: SupportAiDebug = {
      source: local?.reply ? 'knowledge' : 'fallback',
      reason: 'missing_api_key',
      hasApiKey: false,
      keyEnv: null,
      detail: `${GEMINI_API_KEY_ENV_NAMES.join(', ')} 중 하나가 Vercel/서버 환경변수에 필요합니다.`,
    };
    logSupportFailure(debug);
    if (local?.reply) {
      return withEscalation(local.reply, operatorCase || local.escalate, debug);
    }
    if (quoteContext) {
      return withEscalation(quoteContext, operatorCase, debug);
    }
    return withEscalation(SUPPORT_FALLBACK_MESSAGE, operatorCase, debug);
  }

  const contents = [
    ...history.map((turn) => ({
      role: turn.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: turn.content }],
    })),
    { role: 'user', parts: [{ text: message }] },
  ];

  const triedModels: string[] = [];
  let lastDebug: SupportAiDebug = {
    source: 'fallback',
    reason: 'empty',
    hasApiKey: true,
    keyEnv,
    triedModels,
  };

  for (const model of SUPPORT_CHAT_MODELS) {
    triedModels.push(model);
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
            temperature: 0.4,
            maxOutputTokens: 2000,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                reply: { type: 'STRING' },
                escalate: { type: 'BOOLEAN' },
              },
              required: ['reply', 'escalate'],
            },
          },
        }),
      });
      if (!response.ok) {
        const detail = await readGeminiErrorBody(response);
        const reason = classifyGeminiHttpStatus(response.status);
        lastDebug = {
          source: 'fallback',
          reason,
          status: response.status,
          model,
          hasApiKey: true,
          keyEnv,
          triedModels: [...triedModels],
          detail: detail || undefined,
        };
        if (FATAL_REASONS.has(reason) || response.status === 401 || response.status === 403 || response.status === 429) {
          break;
        }
        continue;
      }
      const payload = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = readCandidateText(payload);
      if (!text) {
        lastDebug = {
          source: 'fallback',
          reason: 'empty',
          status: response.status,
          model,
          hasApiKey: true,
          keyEnv,
          triedModels: [...triedModels],
        };
        continue;
      }
      const result = supportReplyFromModelText(text);
      if (!result) {
        lastDebug = {
          source: 'fallback',
          reason: 'schema',
          status: response.status,
          model,
          hasApiKey: true,
          keyEnv,
          triedModels: [...triedModels],
        };
        continue;
      }
      const reply = sanitizeSupportReply(result.reply, quoteContext);
      return withEscalation(reply, operatorCase || result.escalate, {
        source: 'gemini',
        model,
        hasApiKey: true,
        keyEnv,
        triedModels: [...triedModels],
      });
    } catch (error) {
      rethrowPrerenderError(error);
      lastDebug = {
        source: 'fallback',
        reason: classifyGeminiThrown(error),
        model,
        hasApiKey: true,
        keyEnv,
        triedModels: [...triedModels],
        detail: error instanceof Error ? error.message.slice(0, 180) : 'request failed',
      };
    }
  }

  lastDebug.triedModels = [...triedModels];
  if (local?.reply) {
    lastDebug.source = 'knowledge';
    logSupportFailure(lastDebug);
    return withEscalation(local.reply, operatorCase || local.escalate, lastDebug);
  }
  if (quoteContext) {
    logSupportFailure(lastDebug);
    return withEscalation(quoteContext, operatorCase, lastDebug);
  }
  logSupportFailure(lastDebug);
  return withEscalation(SUPPORT_FALLBACK_MESSAGE, operatorCase, lastDebug);
}
