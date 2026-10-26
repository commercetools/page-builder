import { useCallback, useState } from 'react';
import { useApplicationContext } from '@commercetools-frontend/application-shell-connectors';
import type { CommentThread } from './types';

// Per-device read state (no server push exists, so unread is UX sugar, not
// durable business data — mirrors the app's other localStorage conventions).
const lsKey = (projectKey: string, userId: string, pageId: string) =>
  `pb:comments:lastSeen:${projectKey}:${userId}:${pageId}`;

const readLS = (key: string): string | null => {
  try {
    return typeof window !== 'undefined'
      ? window.localStorage.getItem(key)
      : null;
  } catch {
    return null;
  }
};

const writeLS = (key: string, value: string): void => {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
  } catch {
    /* ignore quota/availability errors */
  }
};

export const useCommentsLastSeen = (
  pageId: string
): { lastSeen: string; markSeen: () => void } => {
  const projectKey = useApplicationContext((ctx) => ctx.project?.key) ?? '';
  const userId = useApplicationContext((ctx) => ctx.user?.id) ?? '';
  const key = lsKey(projectKey, userId, pageId);
  const [lastSeen, setLastSeen] = useState<string>(() => readLS(key) ?? '');

  const markSeen = useCallback(() => {
    const now = new Date().toISOString();
    writeLS(key, now);
    setLastSeen(now);
  }, [key]);

  return { lastSeen, markSeen };
};

/**
 * Count comments that warrant a notification badge: since the user last opened
 * the drawer, authored by someone else, and @-mentioning the current user.
 */
export const computeUnread = (
  threads: CommentThread[],
  lastSeen: string,
  myEmail: string,
  myId: string
): number => {
  const email = myEmail.toLowerCase();
  let n = 0;
  for (const t of threads) {
    for (const c of t.comments) {
      if (c.deleted) continue;
      if (c.author.id === myId) continue;
      if (lastSeen && c.createdAt <= lastSeen) continue;
      if (email && c.mentions.includes(email)) n++;
    }
  }
  return n;
};
