'use client';

import { useEffect } from 'react';
import { showToast } from '@/components/Toast';
import { accessReasonMessage } from '@/lib/access';

export function AccessReasonToast() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reason = params.get('reason');
    const next = params.get('next') ?? '';
    if (reason === 'auth-required' && next.startsWith('/onboarding')) {
      params.delete('reason');
      const search = params.toString();
      window.history.replaceState(
        {},
        '',
        `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`,
      );
      return;
    }
    const message = accessReasonMessage(reason);
    if (!message) {
      return;
    }

    window.setTimeout(() => {
      showToast(message);
    }, 0);
    params.delete('reason');
    const search = params.toString();
    const cleaned = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', cleaned);
  }, []);

  return null;
}
