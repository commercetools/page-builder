import { useApplicationContext } from '@commercetools-frontend/application-shell-connectors';
import type { CommentAuthor } from './types';

/** Builds the current user's CommentAuthor identity from the app context. */
export const useCommentAuthor = (): CommentAuthor => {
  const user = useApplicationContext((ctx) => ctx.user);
  const firstName = user?.firstName ?? undefined;
  const lastName = user?.lastName ?? undefined;
  const email = user?.email ?? '';
  const name =
    [firstName, lastName].filter(Boolean).join(' ').trim() ||
    email ||
    'Unknown';
  return { id: user?.id ?? '', email, name, firstName, lastName };
};
