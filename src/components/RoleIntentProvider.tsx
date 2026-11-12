'use client';

import {
  createContext,
  useCallback,
  useContext,
  useId,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { RoleOnboarding } from '@/components/RoleOnboarding';
import { showToast } from '@/components/Toast';
import { ACCESS_REASON, syncActiveRoleCookie } from '@/lib/access';
import { loginPath } from '@/lib/auth-guard';
import { hasAuthRole, type MemberRole } from '@/types/auth';

type RoleIntentContextValue = {
  requestAdvertiser: (then?: () => void) => void;
  requestCreator: (then?: () => void) => void;
};

const RoleIntentContext = createContext<RoleIntentContextValue>({
  requestAdvertiser: () => undefined,
  requestCreator: () => undefined,
});

export function useRoleIntent() {
  return useContext(RoleIntentContext);
}

export function RoleIntentProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const titleId = useId();
  const { user, ready, setActiveRole, refresh } = useAuth();
  const [pending, setPending] = useState<{
    intent: MemberRole;
    then?: () => void;
  } | null>(null);

  const requestRole = useCallback(
    (intent: MemberRole, then?: () => void) => {
      if (!ready) {
        return;
      }
      if (!user) {
        const reason = intent === 'advertiser' ? 'advertiser-auth' : 'creator-auth';
        showToast(ACCESS_REASON[reason]);
        router.push(loginPath(reason, `${window.location.pathname}${window.location.search}`));
        return;
      }
      if (hasAuthRole(user, intent)) {
        setActiveRole(intent);
        then?.();
        return;
      }
      setPending({ intent, then });
    },
    [ready, router, setActiveRole, user],
  );

  const close = useCallback(() => {
    setPending(null);
  }, []);

  return (
    <RoleIntentContext.Provider
      value={{
        requestAdvertiser: (then) => requestRole('advertiser', then),
        requestCreator: (then) => requestRole('creator', then),
      }}
    >
      {children}
      {pending && user && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-zinc-950/50 p-4"
              onClick={close}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="relative my-auto w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl max-h-[85vh] sm:p-6"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="absolute top-4 right-4 inline-flex size-9 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-100"
                  aria-label="닫기"
                  onClick={close}
                >
                  <X className="size-5" />
                </button>
                <span id={titleId} className="sr-only">
                  {pending.intent === 'advertiser'
                    ? '광고주 정보 입력'
                    : '크리에이터 채널 정보 입력'}
                </span>
                <RoleOnboarding
                  name={user.name || '회원'}
                  email={user.email}
                  intent={pending.intent}
                  headingLevel="h2"
                  onCompleted={() => {
                    const next = pending.then;
                    const intent = pending.intent;
                    syncActiveRoleCookie(intent);
                    setPending(null);
                    window.setTimeout(() => {
                      void refresh().then(() => {
                        setActiveRole(intent);
                        next?.();
                      });
                    }, 0);
                  }}
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </RoleIntentContext.Provider>
  );
}
