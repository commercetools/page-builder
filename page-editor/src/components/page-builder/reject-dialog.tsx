import { useState } from 'react';
import { Box, Button, Dialog, MultilineTextInput } from '@commercetools/nimbus';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (comment: string) => void | Promise<void>;
  stepLabel?: string;
  busy?: boolean;
};

/** Reject a page one workflow step back. A comment is required. */
export const RejectDialog = ({
  isOpen,
  onClose,
  onConfirm,
  stepLabel,
  busy,
}: Props) => {
  const [comment, setComment] = useState('');

  const submit = async () => {
    const c = comment.trim();
    if (!c) return;
    await onConfirm(c);
    setComment('');
  };

  return (
    <Dialog.Root
      isOpen={isOpen}
      onOpenChange={(isOpenNext) => {
        if (!isOpenNext) {
          setComment('');
          onClose();
        }
      }}
    >
      <Dialog.Content width="md">
        <Dialog.Header>
          <Dialog.Title>
            Reject{stepLabel ? ` — ${stepLabel}` : ''}
          </Dialog.Title>
          <Dialog.CloseTrigger />
        </Dialog.Header>
        <Dialog.Body>
          <Box fontSize="12.5px" color="neutral.11" mb={200}>
            This sends the page back one step. A comment is required and will be
            added to the workflow history.
          </Box>
          <MultilineTextInput
            aria-label="Rejection comment"
            value={comment}
            onChange={(v: string) => setComment(v)}
            rows={4}
            autoGrow
            autoFocus
            placeholder="Explain what needs to change…  use @email to mention"
          />
        </Dialog.Body>
        <Dialog.Footer>
          <Button slot="close" variant="outline" isDisabled={busy}>
            Cancel
          </Button>
          <Button
            colorPalette="critical"
            onPress={() => void submit()}
            isDisabled={busy || !comment.trim()}
          >
            Reject
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
};

export default RejectDialog;
