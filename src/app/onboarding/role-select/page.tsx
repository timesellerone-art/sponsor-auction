'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { POST_AUTH_HOME } from '@/lib/auth-guard';

export default function RoleSelectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(POST_AUTH_HOME);
  }, [router]);

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <Loader2 className="size-6 animate-spin text-clink-accent" aria-hidden />
      <span className="sr-only">홈으로 이동 중</span>
    </div>
  );
}
