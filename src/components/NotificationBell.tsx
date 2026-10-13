'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import {
  listNotifications,
  markNotificationRead,
  markNotificationsRead,
  onNotificationsChanged,
  unreadCount,
} from '@/lib/notifications';
import { cn, formatDateTime } from '@/lib/utils';
import type { AppNotification } from '@/types/notification';

const TYPE_LABEL: Record<AppNotification['type'], string> = {
  bid_received: '제안서 접수',
  award_complete: '낙찰 완료',
  payment_complete: '결제 완료',
};

export function NotificationBell() {
  const { user, ready } = useAuth();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const refresh = () => {
      setItems(listNotifications(user?.id));
      setUnread(unreadCount(user?.id));
    };
    refresh();
    return onNotificationsChanged(refresh);
  }, [user?.id]);

  if (!ready || !user) {
    return null;
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        className="relative inline-flex size-10 items-center justify-center rounded-lg text-zinc-800 hover:bg-zinc-100"
        aria-label={unread > 0 ? `알림 ${unread}개` : '알림'}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((value) => {
            const next = !value;
            if (next && user.id) {
              markNotificationsRead(user.id);
            }
            return next;
          });
        }}
      >
        <Bell className="size-5" aria-hidden />
        {unread > 0 ? (
          <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-teal-600" />
        ) : null}
      </button>

      {open ? (
        <div
          id={panelId}
          role="region"
          aria-label="알림 목록"
          className="absolute top-full right-0 z-[70] mt-2 w-[min(20rem,calc(100vw-2rem))] max-h-[70vh] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2">
            <p className="text-sm font-semibold text-zinc-950">알림</p>
            <button
              type="button"
              className="text-xs font-medium text-zinc-500 hover:text-zinc-800"
              onClick={() => setOpen(false)}
            >
              닫기
            </button>
          </div>
          <ul className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 ? (
              <li className="px-3 py-8 text-center text-sm text-zinc-500">아직 알림이 없습니다</li>
            ) : (
              items.map((item) => (
                <li key={item.id} className="border-b border-zinc-100 last:border-0">
                  <Link
                    href={item.href}
                    className={cn(
                      'block px-3 py-3 hover:bg-zinc-50',
                      item.read ? 'opacity-70' : 'bg-teal-50/60',
                    )}
                    onClick={() => {
                      markNotificationRead(item.id);
                      setOpen(false);
                    }}
                  >
                    <p className="text-xs font-semibold text-teal-800">{TYPE_LABEL[item.type]}</p>
                    <p className="mt-0.5 text-sm font-medium text-zinc-950">{item.title}</p>
                    <p className="mt-0.5 text-xs leading-5 text-zinc-600">{item.body}</p>
                    <p className="mt-1 text-[11px] text-zinc-400">{formatDateTime(item.createdAt)}</p>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
