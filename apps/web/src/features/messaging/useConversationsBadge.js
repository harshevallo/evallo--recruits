import { useCallback, useEffect, useState } from 'react';
import { fetchConversationSummary } from '@/services';

/** How often a mounted workspace re-checks the count. Cheap endpoint; a stale badge is worse. */
const REFRESH_MS = 60_000;

/**
 * The one count worth badging: unread messages across MY conversations (ADR-025).
 *
 * The same hook serves both workspace rails, because the inbox is the same one — a person's
 * conversations do not change when they switch from candidate to recruiter. Requests a stranger has
 * sent me carry unread messages, so they are counted without a second number.
 *
 * Failure is silent on purpose: a badge is an enhancement, and a rail that rendered no navigation
 * because a count did not load would be a far worse outcome than a missing number. Refreshes on an
 * interval and when the tab regains focus, so reading messages elsewhere clears it within a minute.
 */
export function useConversationsBadge() {
  const [count, setCount] = useState(0);

  const refresh = useCallback((signal) => {
    fetchConversationSummary({ signal })
      .then((summary) => {
        if (signal?.aborted) return;
        setCount(summary?.unreadTotal ?? 0);
      })
      .catch(() => {
        /* No badge. The rail still works, which is the part that matters. */
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal);

    const timer = window.setInterval(() => refresh(controller.signal), REFRESH_MS);
    const onFocus = () => refresh(controller.signal);
    window.addEventListener('focus', onFocus);

    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  return count;
}
