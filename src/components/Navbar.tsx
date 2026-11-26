'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { CreateAuctionModal } from '@/components/CreateAuctionModal';
import { useRoleIntent } from '@/components/RoleIntentProvider';
import { signOut } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { isAdmin } from '@/types/auth';

export function Navbar() {
  const { user, ready } = useAuth();
  const { requestAdvertiser } = useRoleIntent();
  const showAdmin = Boolean(ready && user && isAdmin(user));
  const signedIn = Boolean(ready && user);
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const menuId = useId();

  const requestCreateAuction = useCallback(() => {
    setOpen(false);
    if (!ready) {
      return;
    }
    requestAdvertiser(() => setCreateOpen(true));
  }, [ready, requestAdvertiser]);

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
    await signOut();
    window.location.replace('/');
  };

  const navLinkClass =
    'shrink-0 whitespace-nowrap text-sm font-medium text-stone-600 transition-colors hover:text-stone-950';
  const accountButtonClass =
    'inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-full border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-800 shadow-sm hover:shadow-md lg:h-10 lg:px-4 lg:text-sm';

  return (
    <header className="sticky top-0 z-50 w-full overflow-x-clip border-b border-clink-border bg-[#FAF8F5]/80 backdrop-blur-md">
      <div className="flex h-14 w-full items-center justify-between gap-3 px-4 sm:h-16 sm:px-6">
        {signedIn ? <span className="sr-only">{user?.name}</span> : null}
        <Link
          href="/"
          aria-label="Clink"
          className="flex shrink-0 items-center whitespace-nowrap"
          onClick={() => setOpen(false)}
        >
          <img
            src="/logo.svg"
            alt="Clink"
            className="h-8 w-auto sm:h-9"
          />
        </Link>

        <nav className="hidden min-w-0 flex-1 items-center gap-3 md:flex lg:gap-5" aria-label="주요">
          <Link href="/#auctions" className={navLinkClass}>
            오픈 캠페인
          </Link>
          <Link href="/inventory" className={navLinkClass}>
            크리에이터 상품
          </Link>
          <Link href="/#guide" className={navLinkClass}>
            이용안내
          </Link>
          {showAdmin ? (
            <Link href="/admin" className={navLinkClass}>
              관리자
            </Link>
          ) : null}

          <div className="ml-auto flex shrink-0 items-center gap-1.5 lg:gap-2">
            {signedIn ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    void handleSignOut();
                  }}
                  className={navLinkClass}
                >
                  로그아웃
                </button>
                <Link href="/my" className={accountButtonClass}>
                  마이페이지
                </Link>
              </>
            ) : (
              <Link href="/login" className={accountButtonClass}>
                로그인
              </Link>
            )}
          </div>
        </nav>

        <div className="flex shrink-0 items-center gap-1.5 md:hidden">
          {signedIn ? (
            <>
              <button
                type="button"
                onClick={() => {
                  void handleSignOut();
                }}
                className={navLinkClass}
              >
                로그아웃
              </button>
              <Link href="/my" className={accountButtonClass}>
                마이페이지
              </Link>
            </>
          ) : (
            <Link href="/login" className={accountButtonClass}>
              로그인
            </Link>
          )}
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
            className="rounded-lg px-3 py-3 text-sm font-medium whitespace-nowrap text-stone-800 hover:bg-white"
            onClick={() => setOpen(false)}
          >
            오픈 캠페인 둘러보기
          </Link>
          <Link
            href="/inventory"
            className="rounded-lg px-3 py-3 text-sm font-medium whitespace-nowrap text-stone-800 hover:bg-white"
            onClick={() => setOpen(false)}
          >
            크리에이터 상품
          </Link>
          <Link
            href="/#guide"
            className="rounded-lg px-3 py-3 text-sm font-medium whitespace-nowrap text-stone-800 hover:bg-white"
            onClick={() => setOpen(false)}
          >
            이용안내
          </Link>
          {signedIn ? (
            <Link
              href="/my"
              className="rounded-lg px-3 py-3 text-sm font-medium whitespace-nowrap text-stone-800 hover:bg-white"
              onClick={() => setOpen(false)}
            >
              마이페이지
            </Link>
          ) : null}
          {showAdmin ? (
            <Link
              href="/admin"
              className="rounded-lg px-3 py-3 text-sm font-medium whitespace-nowrap text-stone-800 hover:bg-white"
              onClick={() => setOpen(false)}
            >
              관리자
            </Link>
          ) : null}
          {signedIn ? (
            <button
              type="button"
              className="rounded-lg px-3 py-3 text-left text-sm font-medium whitespace-nowrap text-stone-800 hover:bg-white"
              onClick={() => {
                void handleSignOut();
              }}
            >
              로그아웃
            </button>
          ) : (
            <Link
              href="/login"
              className="rounded-lg px-3 py-3 text-sm font-medium whitespace-nowrap text-stone-800 hover:bg-white"
              onClick={() => setOpen(false)}
            >
              로그인
            </Link>
          )}
        </nav>
      </div>

      {createOpen ? (
        <CreateAuctionModal open={createOpen} onClose={() => setCreateOpen(false)} />
      ) : null}
    </header>
  );
}
