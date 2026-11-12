'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Headset, Loader2, MessageCircle, Send, X } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { showToast } from '@/components/Toast';
import { isPlaceholderOAuthEmail } from '@/lib/contact';
import {
  SUPPORT_MESSAGE_MAX_LENGTH,
  SUPPORT_QUICK_PROMPTS,
  SUPPORT_TICKET_CATEGORIES,
  SUPPORT_WELCOME_MESSAGE,
  sanitizeSupportReply,
  type SupportTicketCategory,
} from '@/lib/support-knowledge';
import { cn } from '@/lib/utils';

type ChatMessage = {
  role: 'assistant' | 'user';
  content: string;
};

export function AiSupportWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [ticketMode, setTicketMode] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: SUPPORT_WELCOME_MESSAGE },
  ]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [ticket, setTicket] = useState({
    name: '',
    email: '',
    category: 'payment' as SupportTicketCategory,
    message: '',
  });
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!user) {
      return;
    }
    setTicket((current) => ({
      ...current,
      name: current.name || user.name || '',
      email:
        current.email ||
        (user.email && !isPlaceholderOAuthEmail(user.email) ? user.email : ''),
    }));
  }, [user]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, open, ticketMode]);

  const remaining = SUPPORT_MESSAGE_MAX_LENGTH - draft.length;
  const history = useMemo(
    () => messages.filter((item) => item.content !== SUPPORT_WELCOME_MESSAGE),
    [messages],
  );

  const sendMessage = async (text: string) => {
    const message = text.trim();
    if (!message || busy) {
      return;
    }
    if (message.length > SUPPORT_MESSAGE_MAX_LENGTH) {
      showToast(`메시지는 ${SUPPORT_MESSAGE_MAX_LENGTH}자까지 보낼 수 있습니다.`);
      return;
    }
    setTicketMode(false);
    setDraft('');
    setMessages((current) => [...current, { role: 'user', content: message }]);
    setBusy(true);
    try {
      const response = await fetch('/api/support-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message, history }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { reply?: string; error?: string; escalate?: boolean }
        | null;
      if (!response.ok || !payload?.reply) {
        throw new Error(payload?.error || '상담 응답을 받지 못했습니다.');
      }
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: sanitizeSupportReply(payload.reply ?? '') },
      ]);
      if (payload.escalate) {
        setTicketMode(true);
      }
    } catch (error) {
      const fallback =
        error instanceof Error ? error.message : '상담 연결이 원활하지 않습니다.';
      showToast(fallback);
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: `${fallback} 아래 [1:1 문의 남기기]로 남겨 주세요.`,
        },
      ]);
      setTicketMode(true);
    } finally {
      setBusy(false);
    }
  };

  const submitTicket = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/support-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(ticket),
      });
      const payload = (await response.json().catch(() => null)) as
        | { reply?: string; error?: string }
        | null;
      if (!response.ok) {
        throw new Error(payload?.error || '문의를 접수하지 못했습니다.');
      }
      const reply = payload?.reply || '문의가 접수되었습니다.';
      showToast(reply, 'success');
      setMessages((current) => [...current, { role: 'assistant', content: reply }]);
      setTicket((current) => ({ ...current, message: '' }));
      setTicketMode(false);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '문의를 접수하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pointer-events-none fixed right-4 bottom-20 z-[55] flex flex-col items-end gap-3 sm:bottom-6">
      {open ? (
        <section
          className="pointer-events-auto flex h-[min(34rem,calc(100dvh-7rem))] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-orange-100 bg-[#FFF7ED] shadow-[0_18px_50px_rgba(28,25,23,0.18)]"
          aria-label="클링크 AI 상담"
        >
          <header className="flex items-center justify-between gap-3 bg-[#EA580C] px-4 py-3 text-white">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Headset className="size-4" aria-hidden />
                클링크 상담
              </p>
              <p className="text-[11px] text-white/80">수수료·캠페인 안내 · 24시간</p>
            </div>
            <button
              type="button"
              className="inline-flex size-8 items-center justify-center rounded-full hover:bg-white/15"
              aria-label="상담창 닫기"
              onClick={() => setOpen(false)}
            >
              <X className="size-4" />
            </button>
          </header>

          {ticketMode ? (
            <form onSubmit={(event) => void submitTicket(event)} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
                <p className="text-xs leading-5 text-stone-600">
                  환불 확정, 분쟁, 결제 오류는 운영팀이 확인합니다. 내용을 남겨 주세요.
                </p>
                <label className="block text-xs font-medium text-stone-700">
                  이름
                  <input
                    value={ticket.name}
                    onChange={(event) => setTicket((current) => ({ ...current, name: event.target.value }))}
                    className="mt-1 h-10 w-full rounded-xl border border-orange-100 bg-white px-3 text-sm outline-none focus:border-[#EA580C]"
                    autoComplete="name"
                  />
                </label>
                <label className="block text-xs font-medium text-stone-700">
                  이메일
                  <input
                    type="email"
                    value={ticket.email}
                    onChange={(event) => setTicket((current) => ({ ...current, email: event.target.value }))}
                    className="mt-1 h-10 w-full rounded-xl border border-orange-100 bg-white px-3 text-sm outline-none focus:border-[#EA580C]"
                    autoComplete="email"
                  />
                </label>
                <label className="block text-xs font-medium text-stone-700">
                  문의 유형
                  <select
                    value={ticket.category}
                    onChange={(event) =>
                      setTicket((current) => ({
                        ...current,
                        category: event.target.value as SupportTicketCategory,
                      }))
                    }
                    className="mt-1 h-10 w-full rounded-xl border border-orange-100 bg-white px-3 text-sm outline-none focus:border-[#EA580C]"
                  >
                    {SUPPORT_TICKET_CATEGORIES.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-stone-700">
                  문의 내용
                  <textarea
                    value={ticket.message}
                    onChange={(event) =>
                      setTicket((current) => ({ ...current, message: event.target.value }))
                    }
                    rows={5}
                    className="mt-1 w-full resize-none rounded-xl border border-orange-100 bg-white px-3 py-2 text-sm outline-none focus:border-[#EA580C]"
                  />
                </label>
              </div>
              <div className="flex gap-2 border-t border-orange-100 px-4 py-3">
                <button
                  type="button"
                  className="h-10 flex-1 rounded-full border border-orange-200 bg-white text-sm font-semibold text-stone-700"
                  onClick={() => setTicketMode(false)}
                >
                  채팅으로
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex h-10 flex-1 items-center justify-center rounded-full bg-[#EA580C] text-sm font-semibold text-white disabled:opacity-60"
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : '접수하기'}
                </button>
              </div>
            </form>
          ) : (
            <>
              <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
                {messages.map((item, index) => (
                  <div
                    key={`${item.role}-${index}`}
                    className={cn(
                      'max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-6',
                      item.role === 'assistant'
                        ? 'bg-white text-stone-800 shadow-sm'
                        : 'ml-auto bg-[#EA580C] text-white',
                    )}
                  >
                    {item.content}
                  </div>
                ))}
                <div className="flex flex-wrap gap-1.5">
                  {SUPPORT_QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (prompt === SUPPORT_QUICK_PROMPTS[3]) {
                          setTicket((current) => ({
                            ...current,
                            category: 'payment',
                            message: current.message || prompt,
                          }));
                          setTicketMode(true);
                          return;
                        }
                        void sendMessage(prompt);
                      }}
                      className="rounded-full border border-orange-200 bg-white px-2.5 py-1 text-[11px] font-medium text-stone-700 hover:border-[#EA580C] hover:text-[#EA580C] disabled:opacity-60"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
              <form
                className="border-t border-orange-100 bg-[#FFF7ED] px-3 py-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendMessage(draft);
                }}
              >
                <button
                  type="button"
                  className="mb-2 text-xs font-semibold text-[#EA580C] hover:underline"
                  onClick={() => setTicketMode(true)}
                >
                  1:1 문의 남기기
                </button>
                <div className="flex items-end gap-2">
                  <textarea
                    value={draft}
                    maxLength={SUPPORT_MESSAGE_MAX_LENGTH}
                    onChange={(event) => setDraft(event.target.value)}
                    rows={2}
                    placeholder="예: 250만 원 제안하면 얼마 받나요?"
                    className="min-h-11 flex-1 resize-none rounded-2xl border border-orange-100 bg-white px-3 py-2 text-sm outline-none focus:border-[#EA580C]"
                  />
                  <button
                    type="submit"
                    disabled={busy || !draft.trim()}
                    className="inline-flex size-11 items-center justify-center rounded-full bg-[#EA580C] text-white disabled:opacity-60"
                    aria-label="메시지 보내기"
                  >
                    {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  </button>
                </div>
                <p className="mt-1 text-right text-[10px] text-stone-400">{remaining}자 남음</p>
              </form>
            </>
          )}
        </section>
      ) : null}

      <button
        type="button"
        className="pointer-events-auto inline-flex size-14 items-center justify-center rounded-full bg-[#EA580C] text-white shadow-[0_12px_30px_rgba(234,88,12,0.35)] hover:bg-orange-600"
        aria-label={open ? '상담창 닫기' : 'AI 상담 열기'}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X className="size-6" /> : <MessageCircle className="size-6" />}
      </button>
    </div>
  );
}
