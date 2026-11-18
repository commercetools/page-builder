import { useMemo, useState } from 'react';
import {
  useCommentsFetcher,
  useCommentsUpdater,
} from '../../hooks/use-comments-connector';
import { useCommentAuthor } from './comments/use-comment-author';
import { useCommentsLastSeen, computeUnread } from './comments/use-unread';
import type { CommentTarget } from './comments/types';
import { findElementLocation } from './element-location';
import { useLocalizedDisplay } from './shared/locales';
import type { Page } from './types';
import type { ElementSelection } from './use-element-selection';

type UsePageCommentsArgs = {
  pageId: string;
  /** The page being edited, for resolving element ids to labels. */
  page: Page;
  selection: ElementSelection;
  /** Reveal an element in the preview iframe when navigating to its thread. */
  highlightInPreview: (elementId: string) => void;
};

/**
 * Comment threads for the page: the roster, the unread badge, the per-element
 * counts drawn on the canvas, and the two surfaces that show them (the
 * per-element dialog and the page-wide messages drawer).
 *
 * Polls faster while a comment surface is open — 10s versus 60s — because that
 * is the only time a reader is watching for someone else's reply.
 */
export const usePageComments = ({
  pageId,
  page,
  selection,
  highlightInPreview,
}: UsePageCommentsArgs) => {
  const displayString = useLocalizedDisplay();

  const [target, setTarget] = useState<CommentTarget | null>(null);
  const [messagesOpen, setMessagesOpen] = useState(false);

  const author = useCommentAuthor();
  const fetcher = useCommentsFetcher(pageId, {
    pollInterval: messagesOpen || target ? 10000 : 60000,
  });
  const updater = useCommentsUpdater(pageId);
  const { lastSeen, markSeen } = useCommentsLastSeen(pageId);

  const threads = fetcher.threads;

  const unreadCount = useMemo(
    () => computeUnread(threads, lastSeen, author.email, author.id),
    [threads, lastSeen, author.email, author.id]
  );

  /** Live comment count per element id, for the canvas badges. */
  const counts = useMemo(() => {
    const byElement: Record<string, number> = {};
    for (const t of threads) {
      if (t.target.kind !== 'element') continue;
      const n = t.comments.filter((c) => !c.deleted).length;
      if (n > 0) byElement[t.target.elementId] = n;
    }
    return byElement;
  }, [threads]);

  const resolveElementLabel = (elementId: string): string | null => {
    for (const layouts of Object.values(page)) {
      for (const layout of layouts) {
        if (layout.id === elementId) return displayString(layout.name);
        const comp = layout.children.find((c) => c.id === elementId);
        if (comp) return displayString(comp.name);
      }
    }
    return null;
  };

  const navigateToElement = (elementId: string) => {
    const loc = findElementLocation(page, elementId);
    if (!loc) return;
    if (loc.compId) selection.selectComp(loc.layoutId, loc.compId);
    else selection.selectLayout(loc.layoutId);
    setMessagesOpen(false);
    highlightInPreview(elementId);
  };

  const dialogTitle =
    target?.kind === 'element'
      ? `${resolveElementLabel(target.elementId) ?? 'Element'} · Comments`
      : target?.kind === 'page'
      ? 'Page comments'
      : 'Comments';

  return {
    author,
    updater,
    target,
    setTarget,
    messagesOpen,
    setMessagesOpen,
    markSeen,
    threads,
    unreadCount,
    counts,
    dialogTitle,
    resolveElementLabel,
    navigateToElement,
  };
};
