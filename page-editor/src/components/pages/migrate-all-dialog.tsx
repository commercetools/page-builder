import { Box, Button, Dialog, Stack, Text } from '@commercetools/nimbus';

type Props = {
  /** Open while any page still uses the legacy (pre-v3) storage format. */
  isOpen: boolean;
  count: number;
  busy: boolean;
  error: string | null;
  onMigrate: () => void;
};

/**
 * Forced, non-closable gate shown on the Pages dashboard whenever legacy-format pages exist.
 * The user must migrate before managing pages — backdrop click, Escape, and the close button
 * are all disabled (`isDismissable={false}`, `isKeyboardDismissDisabled`, no `CloseTrigger`,
 * no Cancel). Migrating splits every legacy page into its v3 draft/published/component
 * objects in one pass (same `migrateAll` logic throughout).
 */
export const MigrateAllDialog = ({
  isOpen,
  count,
  busy,
  error,
  onMigrate,
}: Props) => (
  <Dialog.Root
    isOpen={isOpen}
    onOpenChange={() => {
      // Intentionally ignore dismissal attempts — migration is required.
    }}
    isDismissable={false}
    isKeyboardDismissDisabled
    role="alertdialog"
  >
    <Dialog.Content width="md">
      <Dialog.Header>
        <Dialog.Title>Update required</Dialog.Title>
      </Dialog.Header>
      <Dialog.Body>
        <Stack direction="column" gap={200}>
          <Text>
            {count} page{count === 1 ? '' : 's'} use an outdated storage format
            and must be updated before you can manage pages. Migrating moves
            each page's components into their own versioned records. Published
            pages stay live and unchanged.
          </Text>
          <Text color="neutral.11" fontSize={300}>
            This is safe to run and only needs to happen once.
          </Text>
          {error && (
            <Box
              bg="critical.2"
              color="critical.11"
              borderRadius={200}
              py={200}
              px={300}
              fontSize={300}
            >
              {error}
            </Box>
          )}
        </Stack>
      </Dialog.Body>
      <Dialog.Footer>
        <Button variant="solid" onPress={onMigrate} isDisabled={busy}>
          {error
            ? 'Retry migration'
            : `Migrate ${count} page${count === 1 ? '' : 's'}`}
        </Button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Root>
);

export default MigrateAllDialog;
