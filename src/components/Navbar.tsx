'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Menu, Plus, X } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { CreateAuctionModal } from '@/components/CreateAuctionModal';
import { NotificationBell } from '@/components/NotificationBell';
import { showToast } from '@/components/Toast';
import { ACCESS_REASON } from '@/lib/access';
import { signOut } from '@/lib/auth';
import { loginPath } from '@/lib/auth-guard';
import { cn } from '@/lib/utils';
import { RoleSwitcher } from '@/components/RoleSwitcher';
import { hasAuthRole, isAdmin, memberRolesLabel } from '@/types/auth';

export function Navbar() {
  const router = useRouter();
  const { user, ready, canCreateAuction, canPlaceBid, switchableRoles } = useAuth();
  const showAdmin = Boolean(ready && isAdmin(user));
  const showDashboard = Boolean(ready && switchableRoles.length > 0);
  const dashboardLabel = canPlaceBid ? '내 제안' : '내 캠페인';
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
      showToast(
        hasAuthRole(user, 'advertiser')
          ? '광고주 모드로 전환하면 캠페인을 등록할 수 있습니다.'
          : ACCESS_REASON['advertiser-forbidden'],
      );
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
    <header className="sticky top-0 z-50 w-full min-w-0 border-b border-stone-200/70 bg-[#FAF8F5]/80 backdrop-blur-md">
      <div className="flex h-14 w-full min-w-0 items-center justify-between gap-2 px-4 sm:h-16 sm:px-6">
        <Link
          href="/"
          aria-label="Clink"
          className="flex min-w-0 items-center gap-2 font-semibold tracking-tight text-stone-900"
          onClick={() => setOpen(false)}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-900 text-sm font-bold text-white">
            C
          </span>
          <span className="truncate text-[15px] sm:text-lg">Clink</span>
        </Link>

        <nav className="hidden items-center gap-3 md:flex" aria-label="주요">
          <Link
            href="/#auctions"
            className="text-sm font-medium text-stone-600 transition-colors hover:text-stone-950"
          >
            오픈 캠페인 둘러보기
          </Link>
          <Link
            href="/inventory"
            className="text-sm font-medium text-stone-600 transition-colors hover:text-stone-950"
          >
            인벤토리
          </Link>
          {showAdmin ? (
            <Link
              href="/admin"
              className="text-sm font-medium text-stone-600 transition-colors hover:text-stone-950"
            >
              관리자
            </Link>
          ) : null}
          {ready && user ? (
            <div className="flex min-w-0 items-center gap-2">
              <RoleSwitcher />
              <NotificationBell />
              <span className="max-w-[120px] truncate text-xs text-stone-500">{user.name}</span>
              <button
                type="button"
                onClick={() => {
                  void handleSignOut();
                }}
                className="text-sm font-medium text-stone-600 hover:text-stone-950"
              >
                로그아웃
              </button>
              {showDashboard ? (
                <Link
                  href="/my"
                  className="inline-flex h-10 items-center rounded-full border border-stone-200 bg-white px-4 text-sm font-semibold text-stone-800 shadow-sm hover:shadow-md"
                >
                  {dashboardLabel}
                </Link>
              ) : null}
            </div>
          ) : (
            <Link
              href="/login"
              className="inline-flex h-10 items-center rounded-full border border-stone-200 bg-white px-4 text-sm font-semibold text-stone-800 shadow-sm hover:shadow-md"
            >
              로그인
            </Link>
          )}
          <button
            type="button"
            disabled={!ready || Boolean(user && !canCreateAuction)}
            onClick={requestCreateAuction}
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-emerald-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-stone-300"
          >
            <Plus className="size-4" aria-hidden />
            캠페인 등록
          </button>
        </nav>

        <div className="flex min-w-0 shrink-0 items-center gap-1.5 md:hidden">
          <RoleSwitcher />
          <NotificationBell />
          <button
            type="button"
            disabled={!ready || Boolean(user && !canCreateAuction)}
            onClick={requestCreateAuction}
            className="inline-flex h-9 max-w-[38vw] shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-900 px-3 text-xs font-semibold whitespace-nowrap text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-stone-300"
          >
            캠페인 등록
          </button>
          <button
            type="button"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-stone-800 hover:bg-white/80"
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
          className="fixed inset-0 top-14 z-40 bg-stone-950/30 sm:top-16 md:hidden"
          aria-label="메뉴 닫기"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <div
        id={menuId}
        className={cn(
          'relative z-50 border-t border-stone-200 bg-[#FAF8F5] md:hidden',
          open ? 'block' : 'hidden',
        )}
      >
        <nav className="flex w-full flex-col gap-1 px-4 py-3" aria-label="모바일">
          <Link
            href="/#auctions"
            className="rounded-lg px-3 py-3 text-sm font-medium text-stone-800 hover:bg-white"
            onClick={() => setOpen(false)}
          >
            오픈 캠페인 둘러보기
          </Link>
          <Link
            href="/inventory"
            className="rounded-lg px-3 py-3 text-sm font-medium text-stone-800 hover:bg-white"
            onClick={() => setOpen(false)}
          >
            인벤토리
          </Link>
          {showDashboard ? (
            <Link
              href="/my"
              className="rounded-lg px-3 py-3 text-sm font-medium text-stone-800 hover:bg-white"
              onClick={() => setOpen(false)}
            >
              {dashboardLabel}
            </Link>
          ) : null}
          {showAdmin ? (
            <Link
              href="/admin"
              className="rounded-lg px-3 py-3 text-sm font-medium text-stone-800 hover:bg-white"
              onClick={() => setOpen(false)}
            >
              관리자
            </Link>
          ) : null}
          {ready && user ? (
            <>
              <div className="px-3 py-2">
                <RoleSwitcher />
              </div>
              <button
                type="button"
                className="rounded-lg px-3 py-3 text-left text-sm font-medium text-stone-800 hover:bg-white"
                onClick={() => {
                  void handleSignOut();
                }}
              >
                로그아웃 ({memberRolesLabel(user)})
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-lg px-3 py-3 text-sm font-medium text-stone-800 hover:bg-white"
              onClick={() => setOpen(false)}
            >
              로그인
            </Link>
          )}
          <button
            type="button"
            className="rounded-lg px-3 py-3 text-left text-sm font-medium text-stone-800 hover:bg-white disabled:text-stone-400"
            disabled={!ready || Boolean(user && !canCreateAuction)}
            onClick={requestCreateAuction}
          >
            캠페인 등록
          </button>
        </nav>
      </div>

      {createOpen ? (
        <CreateAuctionModal open={createOpen} onClose={() => setCreateOpen(false)} />
      ) : null}
    </header>
  );
}
