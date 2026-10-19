import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Avatar, Box, Flex, IconButton } from '@commercetools/nimbus';
import Icon from '../shared/icon';
import type { Comment } from './types';
import MentionText from './mention-text';
import { CommentComposer } from './comment-composer';

type Props = {
  comment: Comment;
  currentUserId: string;
  currentUserEmail: string;
  onEdit: (body: string) => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  busy?: boolean;
};

export const CommentListItem = ({
  comment,
  currentUserId,
  currentUserEmail,
  onEdit,
  onDelete,
  busy,
}: Props) => {
  const [editing, setEditing] = useState(false);
  const isOwn = comment.author.id === currentUserId;

  if (comment.deleted) {
    return (
      <Box fontSize="12px" color="neutral.9" fontStyle="italic" py={100}>
        [comment deleted]
      </Box>
    );
  }

  return (
    <Flex gap={200} py={150} align="flex-start">
      <Avatar
        size="2xs"
        firstName={comment.author.firstName}
        lastName={comment.author.lastName}
      />
      <Box flex={1} minWidth={0}>
        <Flex align="center" gap={150}>
          <Box fontSize="12px" fontWeight={600} color="neutral.12">
            {comment.author.name}
          </Box>
          <Box fontSize="10.5px" color="neutral.9">
            {formatDistanceToNow(new Date(comment.createdAt), {
              addSuffix: true,
            })}
            {comment.editedAt ? ' · edited' : ''}
          </Box>
          <Box flex={1} />
          {isOwn && !editing && (
            <Flex>
              <IconButton
                aria-label="Edit comment"
                variant="ghost"
                size="xs"
                onPress={() => setEditing(true)}
              >
                <Icon name="Edit" size={13} color="neutral.10" />
              </IconButton>
              <IconButton
                aria-label="Delete comment"
                variant="ghost"
                size="xs"
                onPress={() => void onDelete()}
              >
                <Icon name="DeleteOutline" size={13} color="critical.11" />
              </IconButton>
            </Flex>
          )}
        </Flex>
        {editing ? (
          <Box mt={100}>
            <CommentComposer
              initialValue={comment.body}
              submitLabel="Save"
              autoFocus
              busy={busy}
              placeholder="Edit comment"
              onCancel={() => setEditing(false)}
              onSubmit={async (b) => {
                await onEdit(b);
                setEditing(false);
              }}
            />
          </Box>
        ) : (
          <Box mt={50}>
            <MentionText
              body={comment.body}
              currentUserEmail={currentUserEmail}
            />
          </Box>
        )}
      </Box>
    </Flex>
  );
};

export default CommentListItem;
