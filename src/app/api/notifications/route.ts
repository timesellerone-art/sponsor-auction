import { rethrowPrerenderError } from '@/lib/prerender-error';
import { cookies } from 'next/headers';
import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { listInboxNotifications } from '@/lib/inbox-notifications.server';
import { getPaymentActor, unauthorizedJson } from '@/lib/payments/guard';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' } as const;
const READ_COOKIE = 'sa-inbox-read';
const DISMISS_COOKIE = 'sa-inbox-dismissed';
const READ_MAX = 200;
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function asText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseReadMap(raw: string | undefined) {
  if (!raw) {
    return {} as Record<string, string[]>;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {} as Record<string, string[]>;
    }
    const out: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!key || !Array.isArray(value)) {
        continue;
      }
      out[key] = value
        .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
        .map((id) => id.trim())
        .slice(0, READ_MAX);
    }
    return out;
  } catch {
    return {} as Record<string, string[]>;
  }
}

async function idMapFromCookie(name: string) {
  const store = await cookies();
  return parseReadMap(store.get(name)?.value);
}

async function writeIdMap(name: string, map: Record<string, string[]>) {
  const store = await cookies();
  store.set(name, JSON.stringify(map), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });
}

function applyRead(userId: string, ids: string[], map: Record<string, string[]>) {
  const current = map[userId] ?? [];
  const next = [...new Set([...ids.map((id) => asText(id)).filter(Boolean), ...current])].slice(
    0,
    READ_MAX,
  );
  return { ...map, [userId]: next };
}

export async function GET(request: Request) {
  try {
    try {
      await connection();
    } catch {
      // 알림 조회는 동적 렌더 힌트와 무관하게 처리합니다.
    }

    const actor = await getPaymentActor(request);
    if (!actor?.userId) {
      return unauthorizedJson('알림을 보려면 로그인해 주세요.');
    }

    const [items, readMap, dismissedMap] = await Promise.all([
      listInboxNotifications(actor.userId),
      idMapFromCookie(READ_COOKIE),
      idMapFromCookie(DISMISS_COOKIE),
    ]);
    const readIds = new Set(readMap[actor.userId] ?? []);
    const dismissedIds = new Set(dismissedMap[actor.userId] ?? []);
    const data = items
      .filter((item) => !dismissedIds.has(item.id))
      .map((item) => ({
        ...item,
        read: readIds.has(item.id),
      }));
    const unreadCount = data.filter((item) => !item.read).length;

    return NextResponse.json({ data, unreadCount }, { headers: NO_STORE });
  } catch (error) {
    rethrowPrerenderError(error);
    const message = error instanceof Error ? error.message : '알림을 불러오지 못했습니다.';
    return NextResponse.json(
      { error: message, errorMessage: message, data: [], unreadCount: 0 },
      { status: 500, headers: NO_STORE },
    );
  }
}

export async function POST(request: Request) {
  try {
    try {
      await connection();
    } catch {
      // 읽음 처리는 동적 렌더 힌트와 무관하게 처리합니다.
    }

    const actor = await getPaymentActor(request);
    if (!actor?.userId) {
      return unauthorizedJson('알림을 읽음 처리하려면 로그인해 주세요.');
    }

    const body = (await request.json().catch(() => null)) as {
      ids?: unknown;
      all?: unknown;
      dismiss?: unknown;
    } | null;
    const requestedIds = Array.isArray(body?.ids)
      ? body.ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : [];

    let ids = requestedIds;
    if (body?.all === true && ids.length === 0) {
      const items = await listInboxNotifications(actor.userId);
      ids = items.map((item) => item.id);
    }

    const dismiss = body?.dismiss === true;
    const cookieName = dismiss ? DISMISS_COOKIE : READ_COOKIE;
    const nextMap = applyRead(actor.userId, ids, await idMapFromCookie(cookieName));
    await writeIdMap(cookieName, nextMap);

    return NextResponse.json(
      {
        data: dismiss
          ? { ok: true, dismissedIds: nextMap[actor.userId] ?? [] }
          : { ok: true, readIds: nextMap[actor.userId] ?? [] },
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    rethrowPrerenderError(error);
    const message = error instanceof Error ? error.message : '알림 읽음 처리를 저장하지 못했습니다.';
    return NextResponse.json(
      { error: message, errorMessage: message },
      { status: 500, headers: NO_STORE },
    );
  }
}
