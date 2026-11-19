import { Box, Flex } from '@commercetools/nimbus';
import type { CommentThread as Thread } from './types';
import CommentListItem from './comment-list-item';
import { CommentComposer } from './comment-composer';

type Props = {
  thread?: Thread;
  currentUserId: string;
  currentUserEmail: string;
  onPost: (body: string) => void | Promise<void>;
  onEdit: (commentId: string, body: string) => void | Promise<void>;
  onDelete: (commentId: string) => void | Promise<void>;
  busy?: boolean;
  emptyLabel?: string;
  composerPlaceholder?: string;
};

/**
 * A conversation: the thread's comments plus a composer. Target-agnostic, so
 * the per-element dialog, the messages drawer, and the workflow reject flow all
 * reuse it against the same comments store.
 */
export const CommentThread = ({
  thread,
  currentUserId,
  currentUserEmail,
  onPost,
  onEdit,
  onDelete,
  busy,
  emptyLabel = 'No comments yet. Start the conversation.',
  composerPlaceholder,
}: Props) => {
  const comments = thread?.comments ?? [];
  const hasVisible = comments.some((c) => !c.deleted);

  return (
    <Flex direction="column">
      {hasVisible ? (
        <Flex direction="column">
          {comments.map((c, i) => (
            <Box
              key={c.id}
              borderTop={i > 0 ? 'solid-25' : undefined}
              borderTopColor={i > 0 ? 'neutral.3' : undefined}
            >
              <CommentListItem
                comment={c}
                currentUserId={currentUserId}
                currentUserEmail={currentUserEmail}
                onEdit={(b) => onEdit(c.id, b)}
                onDelete={() => onDelete(c.id)}
                busy={busy}
              />
            </Box>
          ))}
        </Flex>
      ) : (
        <Box fontSize="12px" color="neutral.9" py={200}>
          {emptyLabel}
        </Box>
      )}
      <Box
        mt={200}
        pt={hasVisible ? 300 : 0}
        borderTop={hasVisible ? 'solid-25' : undefined}
        borderTopColor={hasVisible ? 'neutral.6' : undefined}
        width="full"
      >
        <CommentComposer
          onSubmit={onPost}
          placeholder={composerPlaceholder}
          submitLabel="Comment"
          busy={busy}
        />
      </Box>
    </Flex>
  );
};

export default CommentThread;
