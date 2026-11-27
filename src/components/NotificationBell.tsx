'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, Trash2 } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { authRequestInit } from '@/lib/auth-request';
import {
  applyInboxReadState,
  dismissInboxIds,
  listNotifications,
  markInboxIdsRead,
  markNotificationRead,
  markNotificationsRead,
  onNotificationsChanged,
} from '@/lib/notifications';
import { cn, formatDateTime } from '@/lib/utils';
import type { AppNotification, NotificationType } from '@/types/notification';

const TYPE_LABEL: Record<NotificationType, string> = {
  bid_received: '지원 접수',
  award_complete: '광고주 선정 · 결제 대기',
  payment_complete: '결제 완료',
  chat_message: '새 메시지',
  timeslot_bid: '새 광고주 신청 접수',
  delivery_complete: '납품 완료',
  purchase_confirmed: '구매 확정',
  business_review: '사업자 심사',
};

function mergeInbox(userId: string, remote: AppNotification[]) {
  const seen = new Set(remote.map((item) => item.id));
  const localOnly = listNotifications(userId).filter((item) => !seen.has(item.id));
  return applyInboxReadState(
    userId,
    [...remote, ...localOnly].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
  );
}

async function persistInbox(payload: { ids: string[]; all?: boolean; dismiss?: boolean }) {
  if (payload.ids.length === 0 && !payload.all) {
    return;
  }
  try {
    await fetch(
      '/api/notifications',
      await authRequestInit({
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    );
  } catch {
    // 서버 저장 실패 시에도 로컬 상태는 유지합니다.
  }
}

export function NotificationBell() {
  const { user, ready } = useAuth();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const refreshRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    if (!user?.id) {
      setItems([]);
      setUnread(0);
      refreshRef.current = async () => undefined;
      return;
    }

    let cancelled = false;
    const userId = user.id;

    const refresh = async () => {
      let remote: AppNotification[] = [];
      try {
        const response = await fetch(
          '/api/notifications',
          await authRequestInit({
            method: 'GET',
            cache: 'no-store',
          }),
        );
        const payload = (await response.json().catch(() => null)) as {
          data?: AppNotification[];
        } | null;
        if (Array.isArray(payload?.data)) {
          remote = payload.data;
        }
      } catch {
        remote = [];
      }
      if (cancelled) {
        return;
      }
      const next = mergeInbox(userId, remote);
      setItems(next);
      setUnread(next.filter((item) => !item.read).length);
    };

    refreshRef.current = refresh;
    void refresh();
    const unsubscribe = onNotificationsChanged(() => {
      void refresh();
    });
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener('focus', onFocus);
    const timer = window.setInterval(() => {
      void refresh();
    }, 30_000);

    return () => {
      cancelled = true;
      unsubscribe();
      window.removeEventListener('focus', onFocus);
      window.clearInterval(timer);
    };
  }, [user?.id]);

  if (!ready || !user) {
    return null;
  }

  const markAllRead = () => {
    const ids = items.map((item) => item.id);
    markNotificationsRead(user.id);
    markInboxIdsRead(user.id, ids);
    setItems((current) => current.map((item) => ({ ...item, read: true })));
    setUnread(0);
    void persistInbox({ ids, all: true });
  };

  const markOneRead = (id: string) => {
    markNotificationRead(id);
    markInboxIdsRead(user.id, [id]);
    setItems((current) => current.map((item) => (item.id === id ? { ...item, read: true } : item)));
    setUnread((count) => Math.max(0, count - 1));
    void persistInbox({ ids: [id] });
  };

  const dismissOne = (id: string) => {
    const target = items.find((item) => item.id === id);
    dismissInboxIds(user.id, [id]);
    setItems((current) => current.filter((item) => item.id !== id));
    if (target && !target.read) {
      setUnread((count) => Math.max(0, count - 1));
    }
    void persistInbox({ ids: [id], dismiss: true });
  };

  const dismissAll = () => {
    const ids = items.map((item) => item.id);
    dismissInboxIds(user.id, ids);
    setItems([]);
    setUnread(0);
    void persistInbox({ ids, all: true, dismiss: true });
  };

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        className="relative inline-flex size-10 shrink-0 items-center justify-center whitespace-nowrap rounded-lg text-zinc-800 hover:bg-zinc-100"
        aria-label={unread > 0 ? `알림 ${unread}개` : '알림'}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((current) => {
            const next = !current;
            if (next) {
              void refreshRef.current();
            }
            return next;
          });
        }}
      >
        <Bell className="size-5" aria-hidden />
        {unread > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-clink px-1 text-[10px] font-bold leading-4 text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          id={panelId}
          role="region"
          aria-label="알림 목록"
          className="absolute top-full right-0 z-[70] mt-2 w-[min(22rem,calc(100vw-2rem))] max-h-[70vh] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl"
        >
          <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-3 py-2">
            <p className="text-sm font-semibold text-zinc-950">알림</p>
            <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
              {items.length > 0 ? (
                <>
                  <button
                    type="button"
                    className="text-xs font-medium text-zinc-500 hover:text-zinc-800"
                    onClick={markAllRead}
                  >
                    모두 읽음
                  </button>
                  <button
                    type="button"
                    className="text-xs font-medium text-zinc-500 hover:text-rose-700"
                    onClick={dismissAll}
                  >
                    전체 삭제
                  </button>
                </>
              ) : null}
              <button
                type="button"
                className="text-xs font-medium text-zinc-500 hover:text-zinc-800"
                onClick={() => setOpen(false)}
              >
                닫기
              </button>
            </div>
          </div>
          <ul className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 ? (
              <li className="px-3 py-8 text-center text-sm text-zinc-500">아직 알림이 없습니다</li>
            ) : (
              items.map((item) => (
                <li key={item.id} className="border-b border-zinc-100 last:border-0">
                  <div
                    className={cn(
                      'flex items-stretch',
                      item.read
                        ? 'border-l-4 border-transparent bg-zinc-50'
                        : 'border-l-4 border-emerald-600 bg-emerald-50',
                    )}
                  >
                    <Link
                      href={item.href}
                      className="min-w-0 flex-1 px-3 py-3 hover:bg-black/5"
                      onClick={() => {
                        markOneRead(item.id);
                        setOpen(false);
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        {item.read ? null : (
                          <span
                            className="size-1.5 shrink-0 rounded-full bg-emerald-600"
                            aria-hidden
                          />
                        )}
                        <p
                          className={cn(
                            'text-xs font-semibold',
                            item.read ? 'text-zinc-400' : 'text-emerald-800',
                          )}
                        >
                          {TYPE_LABEL[item.type] ?? item.title}
                        </p>
                        {item.read ? (
                          <span className="rounded-full bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium leading-none text-zinc-500">
                            읽음
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-medium leading-none text-white">
                            안 읽음
                          </span>
                        )}
                      </div>
                      <p
                        className={cn(
                          'mt-0.5 text-sm',
                          item.read ? 'font-medium text-zinc-500' : 'font-semibold text-zinc-950',
                        )}
                      >
                        {item.title}
                      </p>
                      <p
                        className={cn(
                          'mt-0.5 text-xs leading-5',
                          item.read ? 'text-zinc-400' : 'text-zinc-700',
                        )}
                      >
                        {item.body}
                      </p>
                      <p className="mt-1 text-[11px] text-zinc-400">{formatDateTime(item.createdAt)}</p>
                    </Link>
                    <button
                      type="button"
                      className="inline-flex shrink-0 items-start px-2.5 py-3 text-zinc-400 hover:text-rose-700"
                      aria-label="알림 삭제"
                      title="삭제"
                      onClick={() => {
                        dismissOne(item.id);
                      }}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
