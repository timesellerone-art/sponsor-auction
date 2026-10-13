'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Gavel, Menu, Plus, X } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { CreateAuctionModal } from '@/components/CreateAuctionModal';
import { NotificationBell } from '@/components/NotificationBell';
import { showToast } from '@/components/Toast';
import { ACCESS_REASON } from '@/lib/access';
import { signOut } from '@/lib/auth';
import { loginPath } from '@/lib/auth-guard';
import { cn } from '@/lib/utils';
import { isAdmin, memberRoleLabel } from '@/types/auth';

export function Navbar() {
  const router = useRouter();
  const { user, ready, canCreateAuction } = useAuth();
  const showAdmin = Boolean(ready && isAdmin(user?.role));
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const menuId = useId();

  const requestCreateAuction = useCallback(() => {
    setOpen(false);
    if (!ready) {
      return;
    }
    if (!user) {
      showToast(ACCESS_REASON['advertiser-auth']);
      router.push(loginPath('advertiser-auth', '/'));
      return;
    }
    if (!canCreateAuction) {
      showToast(ACCESS_REASON['advertiser-forbidden']);
      return;
    }
    setCreateOpen(true);
  }, [canCreateAuction, ready, router, user]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    const onOpenCreate = () => {
      requestCreateAuction();
    };

    window.addEventListener('create-auction:open', onOpenCreate);
    return () => {
      window.removeEventListener('create-auction:open', onOpenCreate);
    };
  }, [requestCreateAuction]);

  const handleSignOut = async () => {
    setOpen(false);
    const result = await signOut();
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast('로그아웃했습니다.', 'success');
    router.push('/');
  };

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200/80 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-6xl min-w-0 items-center justify-between gap-2 px-4 sm:h-16 sm:px-6">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2 font-semibold tracking-tight text-zinc-950"
          onClick={() => setOpen(false)}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-teal-700 text-white">
            <Gavel className="size-4" aria-hidden />
          </span>
          <span className="truncate text-[15px] sm:text-lg">SponsorAuction</span>
        </Link>

        <nav className="hidden items-center gap-5 md:flex" aria-label="주요">
          <Link
            href="/#auctions"
            className="text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-950"
          >
            역경매 둘러보기
          </Link>
          {canCreateAuction ? (
            <Link
              href="/my"
              className="text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-950"
            >
              내 역경매
            </Link>
          ) : null}
          {showAdmin ? (
            <Link
              href="/admin"
              className="text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-950"
            >
              관리자
            </Link>
          ) : null}
          {ready && user ? (
            <div className="flex items-center gap-2">
              <NotificationBell />
              <span className="max-w-[140px] truncate text-xs text-zinc-500">
                {user.name} · {memberRoleLabel(user.role)}
              </span>
              <button
                type="button"
                onClick={() => {
                  void handleSignOut();
                }}
                className="text-sm font-medium text-zinc-600 hover:text-zinc-950"
              >
                로그아웃
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-950"
            >
              로그인
            </Link>
          )}
          <button
            type="button"
            disabled={ready && Boolean(user) && !canCreateAuction}
            onClick={requestCreateAuction}
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-teal-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            <Plus className="size-4" aria-hidden />
            역경매 등록
          </button>
        </nav>

        <div className="flex shrink-0 items-center gap-1.5 md:hidden">
          <NotificationBell />
          <button
            type="button"
            disabled={ready && Boolean(user) && !canCreateAuction}
            onClick={requestCreateAuction}
            className="inline-flex h-9 max-w-[38vw] shrink-0 items-center justify-center overflow-hidden rounded-full bg-teal-700 px-3 text-xs font-semibold whitespace-nowrap text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            역경매 등록
          </button>
          <button
            type="button"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-zinc-800 hover:bg-zinc-100"
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={open ? '메뉴 닫기' : '메뉴 열기'}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <button
          type="button"
          className="fixed inset-0 top-14 z-40 bg-zinc-950/30 md:hidden"
          aria-label="메뉴 닫기"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <div
        id={menuId}
        className={cn(
          'relative z-50 border-t border-zinc-200 bg-white md:hidden',
          open ? 'block' : 'hidden',
        )}
      >
        <nav
          className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3"
          aria-label="모바일"
        >
          <Link
            href="/#auctions"
            className="rounded-lg px-3 py-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            onClick={() => setOpen(false)}
          >
            역경매 둘러보기
          </Link>
          {canCreateAuction ? (
            <Link
              href="/my"
              className="rounded-lg px-3 py-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              onClick={() => setOpen(false)}
            >
              내 역경매
            </Link>
          ) : null}
          {showAdmin ? (
            <Link
              href="/admin"
              className="rounded-lg px-3 py-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              onClick={() => setOpen(false)}
            >
              관리자
            </Link>
          ) : null}
          {ready && user ? (
            <button
              type="button"
              className="rounded-lg px-3 py-3 text-left text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              onClick={() => {
                void handleSignOut();
              }}
            >
              로그아웃 ({memberRoleLabel(user.role)})
            </button>
          ) : (
            <Link
              href="/login"
              className="rounded-lg px-3 py-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              onClick={() => setOpen(false)}
            >
              로그인
            </Link>
          )}
          <button
            type="button"
            className="rounded-lg px-3 py-3 text-left text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:text-zinc-400"
            disabled={ready && Boolean(user) && !canCreateAuction}
            onClick={requestCreateAuction}
          >
            역경매 등록
          </button>
        </nav>
      </div>

      {createOpen ? (
        <CreateAuctionModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
        />
      ) : null}
    </header>
  );
}
