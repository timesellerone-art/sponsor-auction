'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Loader2, Send } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { showToast } from '@/components/Toast';
import { useActionLock } from '@/hooks/useActionLock';
import { maskOffPlatformContact, hasOffPlatformContact } from '@/utils/filter';
import { CHAT_INSERTED_EVENT, type ChatInsertedDetail } from '@/types/realtime';
import type { ChatMessage } from '@/types/chat';

function asMessage(value: unknown): ChatMessage | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const item = value as Partial<ChatMessage>;
  if (typeof item.id !== 'string' || typeof item.body !== 'string') {
    return null;
  }
  return {
    id: item.id,
    auctionId: typeof item.auctionId === 'string' ? item.auctionId : '',
    senderId: typeof item.senderId === 'string' ? item.senderId : null,
    senderName: typeof item.senderName === 'string' && item.senderName.trim() ? item.senderName : '참여자',
    body: maskOffPlatformContact(item.body),
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : '',
  };
}

export function AuctionChat({ auctionId }: { auctionId: string }) {
  const { user, ready } = useAuth();
  const titleId = useId();
  const listRef = useRef<HTMLUListElement | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { run, isBusy } = useActionLock();

  useEffect(() => {
    if (!ready || !user || !auctionId) {
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`/api/chat/messages?auctionId=${encodeURIComponent(auctionId)}`);
        const json = (await response.json().catch(() => null)) as { data?: unknown; error?: string } | null;
        if (cancelled) {
          return;
        }
        if (!response.ok) {
          setError(json?.error ?? '채팅을 불러오지 못했습니다.');
          return;
        }
        const list = Array.isArray(json?.data)
          ? json.data.map(asMessage).filter((item): item is ChatMessage => item !== null)
          : [];
        setMessages(list);
        setError(null);
      } catch {
        if (!cancelled) {
          setError('채팅을 불러오지 못했습니다.');
        }
      }
    };

    const timer = window.setTimeout(() => {
      void load();
    }, 0);

    const onInserted = (event: Event) => {
      const detail = (event as CustomEvent<ChatInsertedDetail>).detail;
      if (!detail || detail.auctionId !== auctionId) {
        return;
      }
      setMessages((current) => {
        if (current.some((item) => item.id === detail.id)) {
          return current;
        }
        return [
          ...current,
          {
            id: detail.id,
            auctionId: detail.auctionId,
            senderId: detail.senderId,
            senderName: detail.senderName,
            body: maskOffPlatformContact(detail.body),
            createdAt: detail.createdAt,
          },
        ];
      });
    };

    window.addEventListener(CHAT_INSERTED_EVENT, onInserted);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener(CHAT_INSERTED_EVENT, onInserted);
    };
  }, [auctionId, ready, user]);

  useEffect(() => {
    const node = listRef.current;
    if (!node) {
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, [messages.length]);

  if (!ready || !user) {
    return null;
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body) {
      setError('메시지 내용을 입력해 주세요.');
      return;
    }
    if (hasOffPlatformContact(body)) {
      const message = '플랫폼 우회 연락처는 사용할 수 없습니다.';
      setError(message);
      showToast(message);
      return;
    }

    void run('chat-send', async () => {
      try {
        const response = await fetch('/api/chat/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            auctionId,
            senderId: user.id,
            senderName: user.name,
            body,
          }),
        });
        const json = (await response.json().catch(() => null)) as
          | { data?: unknown; error?: string; errorMessage?: string }
          | null;
        if (!response.ok) {
          const message = json?.errorMessage ?? json?.error ?? '메시지를 저장하지 못했습니다.';
          setError(message);
          showToast(message);
          return;
        }
        const created = asMessage(json?.data);
        if (created) {
          setMessages((current) =>
            current.some((item) => item.id === created.id) ? current : [...current, created],
          );
        }
        setDraft('');
        setError(null);
      } catch {
        setError('메시지를 저장하지 못했습니다.');
        showToast('메시지를 저장하지 못했습니다.');
      }
    });
  };

  return (
    <section
      className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5"
      aria-labelledby={titleId}
    >
      <h2 id={titleId} className="text-base font-bold text-zinc-950">
        실시간 채팅
      </h2>
      <p className="mt-1 text-xs text-zinc-500">새 메시지는 알림과 함께 바로 반영됩니다.</p>
      <ul
        ref={listRef}
        className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2"
      >
        {messages.length === 0 ? (
          <li className="py-8 text-center text-sm text-zinc-500">아직 메시지가 없습니다</li>
        ) : (
          messages.map((item) => {
            const mine = Boolean(item.senderId && item.senderId === user.id);
            return (
              <li key={item.id} className={`mt-2 first:mt-0 ${mine ? 'text-right' : 'text-left'}`}>
                <p className="text-[11px] font-medium text-zinc-500">{item.senderName}</p>
                <p
                  className={
                    mine
                      ? 'mt-0.5 inline-block max-w-[90%] rounded-2xl bg-teal-700 px-3 py-2 text-left text-sm text-white'
                      : 'mt-0.5 inline-block max-w-[90%] rounded-2xl bg-white px-3 py-2 text-sm text-zinc-800'
                  }
                >
                  {item.body}
                </p>
              </li>
            );
          })
        )}
      </ul>
      <form onSubmit={handleSubmit} className="mt-3 flex items-end gap-2">
        <label className="sr-only" htmlFor="auction-chat-draft">
          메시지
        </label>
        <textarea
          id="auction-chat-draft"
          rows={2}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="min-h-[44px] w-full resize-y rounded-xl border border-zinc-200 px-3 py-2 text-sm"
          placeholder="메시지를 입력하세요"
        />
        <button
          type="submit"
          disabled={isBusy}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-1 rounded-full bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
        >
          {isBusy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          보내기
        </button>
      </form>
      {error ? (
        <p className="mt-2 text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
