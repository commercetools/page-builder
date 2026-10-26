import { useCallback } from 'react';
import { useOrgDirectory, orgUserName } from '../../../hooks/use-org-directory';

export type MentionCandidate = {
  email: string;
  name: string;
  firstName?: string;
  lastName?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Returns a `search(query)` for @-mention autocomplete. Backed by the cached
 * org directory when available; otherwise degrades to a free-text fallback that
 * offers the typed value once it looks like an email (so `@a@b.com` still works
 * with no directory).
 */
export const useMentionSearch = (): ((query: string) => MentionCandidate[]) => {
  const dir = useOrgDirectory();
  return useCallback(
    (query: string): MentionCandidate[] => {
      if (dir.available) {
        return dir.searchUsers(query, 8).map((u) => ({
          email: u.email,
          name: orgUserName(u),
          firstName: u.firstName,
          lastName: u.lastName,
        }));
      }
      const q = query.trim();
      return EMAIL_RE.test(q) ? [{ email: q, name: q }] : [];
    },
    [dir]
  );
};
