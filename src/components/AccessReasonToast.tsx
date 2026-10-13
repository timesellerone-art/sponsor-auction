'use client';

import { useEffect } from 'react';
import { showToast } from '@/components/Toast';
import { accessReasonMessage } from '@/lib/access';

export function AccessReasonToast() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const message = accessReasonMessage(params.get('reason'));
    if (!message) {
      return;
    }

    window.setTimeout(() => {
      showToast(message);
    }, 0);
    params.delete('reason');
    const search = params.toString();
    const next = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', next);
  }, []);

  return null;
}
