import { Dialog } from '@commercetools/nimbus';
import type {
  CommentAuthor,
  CommentTarget,
  CommentThread as Thread,
} from './types';
import { isSameTarget } from './types';
import { CommentThread } from './comment-thread';
import type { CommentsUpdater } from '../../../hooks/use-comments-connector';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  target: CommentTarget | null;
  title?: string;
  threads: Thread[];
  updater: CommentsUpdater;
  author: CommentAuthor;
};

/** Per-element (or page) comment conversation, shown in a modal. */
export const ElementCommentsDialog = ({
  isOpen,
  onClose,
  target,
  title = 'Comments',
  threads,
  updater,
  author,
}: Props) => {
  const thread = target
    ? threads.find((t) => isSameTarget(t.target, target))
    : undefined;

  return (
    <Dialog.Root
      isOpen={isOpen}
      onOpenChange={(isOpenNext) => {
        if (!isOpenNext) onClose();
      }}
      scrollBehavior="inside"
    >
      <Dialog.Content width="lg">
        <Dialog.Header>
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.CloseTrigger />
        </Dialog.Header>
        <Dialog.Body>
          {target && (
            <CommentThread
              thread={thread}
              currentUserId={author.id}
              currentUserEmail={author.email}
              busy={updater.loading}
              onPost={(body) => updater.addComment(target, body, author)}
              onEdit={(commentId, body) =>
                thread
                  ? updater.editComment(thread.id, commentId, body)
                  : Promise.resolve()
              }
              onDelete={(commentId) =>
                thread
                  ? updater.deleteComment(thread.id, commentId)
                  : Promise.resolve()
              }
            />
          )}
        </Dialog.Body>
      </Dialog.Content>
    </Dialog.Root>
  );
};

export default ElementCommentsDialog;
