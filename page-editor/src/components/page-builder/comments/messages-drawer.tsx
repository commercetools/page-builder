import type { ReactNode } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Drawer } from '@commercetools-frontend/application-components';
import { Badge, Box, Flex, IconButton } from '@commercetools/nimbus';
import Icon from '../shared/icon';
import type { Comment, CommentAuthor, CommentThread as Thread } from './types';
import MentionText from './mention-text';
import { CommentThread } from './comment-thread';
import type { CommentsUpdater } from '../../../hooks/use-comments-connector';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  threads: Thread[];
  author: CommentAuthor;
  updater: CommentsUpdater;
  /** Resolve an element id to a display label, or null when it no longer exists. */
  resolveElementLabel: (elementId: string) => string | null;
  onNavigateToElement: (elementId: string) => void;
};

const iconFor = (t: Thread): string => {
  switch (t.target.kind) {
    case 'element':
      return 'widgets';
    case 'workflow':
      return 'account_tree';
    default:
      return 'web';
  }
};

const elementIdOf = (t: Thread): string | null =>
  t.target.kind === 'element' ? t.target.elementId : null;

const Section = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <Flex direction="column" gap={200}>
    <Box
      fontSize="11px"
      fontWeight={700}
      color="neutral.10"
      textTransform="uppercase"
      letterSpacing="0.04em"
    >
      {title}
    </Box>
    {children}
  </Flex>
);

const Card = ({ children }: { children: ReactNode }) => (
  <Box
    border="solid-25"
    borderColor="neutral.6"
    borderRadius={200}
    p={300}
    bg="neutral.1"
  >
    {children}
  </Box>
);

/**
 * Page-wide messages: every comment thread on the page, grouped — mentions of
 * the current user, component comments, page comments, workflow comments, and
 * orphaned comments (whose element was deleted).
 */
export const MessagesDrawer = ({
  isOpen,
  onClose,
  threads,
  author,
  updater,
  resolveElementLabel,
  onNavigateToElement,
}: Props) => {
  const labelFor = (t: Thread): string => {
    if (t.target.kind === 'element')
      return resolveElementLabel(t.target.elementId) ?? 'Deleted element';
    if (t.target.kind === 'workflow') return 'Workflow step';
    return 'Page';
  };

  const elementThreads = threads.filter((t) => t.target.kind === 'element');
  const present = elementThreads.filter(
    (t) =>
      t.target.kind === 'element' &&
      resolveElementLabel(t.target.elementId) !== null
  );
  const orphaned = elementThreads.filter(
    (t) =>
      t.target.kind === 'element' &&
      resolveElementLabel(t.target.elementId) === null
  );
  const pageThreads = threads.filter((t) => t.target.kind === 'page');
  const workflowThreads = threads.filter((t) => t.target.kind === 'workflow');

  const myEmail = author.email.toLowerCase();
  const mentionRows: { thread: Thread; comment: Comment }[] = [];
  for (const t of threads) {
    for (const c of t.comments) {
      if (!c.deleted && myEmail && c.mentions.includes(myEmail)) {
        mentionRows.push({ thread: t, comment: c });
      }
    }
  }

  const renderThreadCard = (t: Thread) => {
    const elementId = elementIdOf(t);
    return (
      <Card key={t.id}>
        <Flex align="center" gap={150} mb={200}>
          <Icon name={iconFor(t)} size={14} color="neutral.10" />
          <Box fontSize="12.5px" fontWeight={600} color="neutral.12">
            {labelFor(t)}
          </Box>
          <Box flex={1} />
          {t.resolved && (
            <Badge size="2xs" colorPalette="positive">
              Resolved
            </Badge>
          )}
          {elementId && (
            <IconButton
              aria-label="Go to element"
              variant="ghost"
              size="xs"
              onPress={() => onNavigateToElement(elementId)}
            >
              <Icon name="MyLocation" size={13} color="neutral.10" />
            </IconButton>
          )}
          <IconButton
            aria-label={t.resolved ? 'Reopen thread' : 'Resolve thread'}
            variant="ghost"
            size="xs"
            onPress={() => void updater.resolveThread(t.id, !t.resolved)}
          >
            <Icon
              name={t.resolved ? 'Replay' : 'CheckCircle'}
              size={14}
              color={t.resolved ? 'neutral.10' : 'positive.11'}
            />
          </IconButton>
        </Flex>
        <CommentThread
          thread={t}
          currentUserId={author.id}
          currentUserEmail={author.email}
          busy={updater.loading}
          onPost={(b) => updater.addComment(t.target, b, author)}
          onEdit={(cid, b) => updater.editComment(t.id, cid, b)}
          onDelete={(cid) => updater.deleteComment(t.id, cid)}
        />
      </Card>
    );
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      size={30}
      title="Messages"
      hideControls
    >
      <Flex direction="column" gap={500}>
        {threads.length === 0 && (
          <Box color="neutral.9" fontSize="13px">
            No messages yet. Comment on a component or in a workflow to start a
            conversation.
          </Box>
        )}

        {mentionRows.length > 0 && (
          <Section title={`Mentions of you (${mentionRows.length})`}>
            {mentionRows.map(({ thread, comment }) => {
              const elementId = elementIdOf(thread);
              return (
                <Card key={comment.id}>
                  <Flex align="center" gap={150} mb={100}>
                    <Box fontSize="11.5px" fontWeight={600} color="neutral.12">
                      {comment.author.name}
                    </Box>
                    <Box fontSize="10.5px" color="neutral.9">
                      {formatDistanceToNow(new Date(comment.createdAt), {
                        addSuffix: true,
                      })}
                    </Box>
                    <Box flex={1} />
                    <Box fontSize="10.5px" color="neutral.10">
                      {labelFor(thread)}
                    </Box>
                    {elementId && (
                      <IconButton
                        aria-label="Go to element"
                        variant="ghost"
                        size="xs"
                        onPress={() => onNavigateToElement(elementId)}
                      >
                        <Icon name="MyLocation" size={13} color="neutral.10" />
                      </IconButton>
                    )}
                  </Flex>
                  <MentionText
                    body={comment.body}
                    currentUserEmail={author.email}
                  />
                </Card>
              );
            })}
          </Section>
        )}

        {present.length > 0 && (
          <Section title="Component comments">
            {present.map(renderThreadCard)}
          </Section>
        )}
        {pageThreads.length > 0 && (
          <Section title="Page comments">
            {pageThreads.map(renderThreadCard)}
          </Section>
        )}
        {workflowThreads.length > 0 && (
          <Section title="Workflow comments">
            {workflowThreads.map(renderThreadCard)}
          </Section>
        )}
        {orphaned.length > 0 && (
          <Section title="Orphaned (deleted elements)">
            {orphaned.map(renderThreadCard)}
          </Section>
        )}
      </Flex>
    </Drawer>
  );
};

export default MessagesDrawer;
