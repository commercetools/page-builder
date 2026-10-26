import { useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  Flex,
  LoadingSpinner,
  Stack,
  Text,
  toast,
  ToastOutlet,
} from '@commercetools/nimbus';
import Icon from '../page-builder/shared/icon';
import {
  RESET_CONTAINERS,
  useResetConnector,
} from '../../hooks/use-reset-connector';

/**
 * Hidden maintenance route (`/reset`, not linked from the app menu). Lists every
 * custom-object container the app owns with a checkbox + live object count, and
 * lets an operator wipe the selected containers after an explicit confirmation.
 */
const Reset = () => {
  const { counts, loading, error, resetContainers } = useResetConnector();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const toggle = (container: string, isSelected: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (isSelected) next.add(container);
      else next.delete(container);
      return next;
    });

  const allSelected = selected.size === RESET_CONTAINERS.length;
  const someSelected = selected.size > 0 && !allSelected;
  const toggleAll = (isSelected: boolean) =>
    setSelected(
      isSelected ? new Set(RESET_CONTAINERS.map((c) => c.container)) : new Set()
    );

  const selectedContainers = RESET_CONTAINERS.filter((c) =>
    selected.has(c.container)
  );
  const selectedTotal = selectedContainers.reduce(
    (sum, c) => sum + (counts[c.container] ?? 0),
    0
  );

  const handleReset = async () => {
    setBusy(true);
    try {
      const deleted = await resetContainers([...selected]);
      const total = Object.values(deleted).reduce((a, b) => a + b, 0);
      toast.success({
        title: 'Reset complete',
        description: `Deleted ${total} object${total === 1 ? '' : 's'} from ${
          selectedContainers.length
        } container${selectedContainers.length === 1 ? '' : 's'}.`,
      });
      setSelected(new Set());
      setConfirmOpen(false);
    } catch (e) {
      toast.error({
        title: 'Reset failed',
        description:
          e instanceof Error ? e.message : 'Some objects could not be deleted.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box p={600} maxWidth={'720px'} margin="0 auto" width="100%">
      {/* Header */}
      <Flex align="center" gap={300} mb={200}>
        <Flex
          align="center"
          justify="center"
          width={36}
          height={36}
          borderRadius={100}
          bg="critical.3"
          flexShrink={0}
        >
          <Icon name="RestartAlt" size={20} color="critical.11" />
        </Flex>
        <Box>
          <Box as="h1" fontSize="24px" fontWeight={700} color="neutral.12">
            Reset containers
          </Box>
          <Box fontSize="13px" color="neutral.10">
            Permanently delete all custom objects in the selected containers.
          </Box>
        </Box>
      </Flex>

      {/* Danger notice */}
      <Flex
        gap={200}
        mb={400}
        p={300}
        borderRadius={200}
        bg="critical.2"
        color="critical.11"
        fontSize="12.5px"
        align="flex-start"
      >
        <Icon name="Warning" size={16} color="critical.11" />
        <Box>
          This is a destructive maintenance action and cannot be undone. Objects
          are removed from commercetools immediately.
        </Box>
      </Flex>

      {loading && Object.keys(counts).length === 0 ? (
        <Flex align="center" gap={200} color="neutral.10" py={600}>
          <LoadingSpinner aria-label="Loading containers" />
          <Text>Loading containers…</Text>
        </Flex>
      ) : error ? (
        <Box
          bg="critical.2"
          color="critical.11"
          borderRadius={200}
          p={300}
          fontSize="13px"
        >
          {error}
        </Box>
      ) : (
        <Stack direction="column" gap={200}>
          {/* Select all */}
          <Box borderBottom="solid-25" borderBottomColor="neutral.6" pb={200}>
            <Checkbox
              isSelected={allSelected}
              isIndeterminate={someSelected}
              onChange={toggleAll}
            >
              <Box as="span" fontWeight={600} color="neutral.12">
                Select all containers
              </Box>
            </Checkbox>
          </Box>

          {/* One checkbox per container */}
          {RESET_CONTAINERS.map(({ container, description }) => {
            const count = counts[container] ?? 0;
            return (
              <Flex
                key={container}
                align="flex-start"
                gap={300}
                p={300}
                border="solid-25"
                borderColor="neutral.6"
                borderRadius={200}
                bg="neutral.1"
              >
                <Box pt={50}>
                  <Checkbox
                    isSelected={selected.has(container)}
                    onChange={(isSelected) => toggle(container, isSelected)}
                    aria-label={`Select ${container}`}
                  />
                </Box>
                <Box flex={1} minWidth={0}>
                  <Flex align="center" gap={200} wrap="wrap">
                    <Box
                      as="span"
                      fontSize="13px"
                      fontWeight={600}
                      color="neutral.12"
                    >
                      {container}
                    </Box>
                    <Box
                      as="span"
                      fontSize="11px"
                      fontWeight={600}
                      color={count > 0 ? 'primary.11' : 'neutral.9'}
                      bg={count > 0 ? 'primary.3' : 'neutral.3'}
                      borderRadius={100}
                      py={50}
                      px={150}
                    >
                      {count} object{count === 1 ? '' : 's'}
                    </Box>
                  </Flex>
                  <Box fontSize="12px" color="neutral.10" mt={100}>
                    {description}
                  </Box>
                </Box>
              </Flex>
            );
          })}
        </Stack>
      )}

      {/* Action */}
      <Flex mt={500} justify="flex-end">
        <Button
          variant="solid"
          colorPalette="critical"
          isDisabled={selected.size === 0 || busy || loading}
          onPress={() => setConfirmOpen(true)}
        >
          <Icon name="DeleteForever" size={16} color="neutral.1" />
          Reset selected
        </Button>
      </Flex>

      {/* Confirmation */}
      <Dialog.Root
        isOpen={confirmOpen}
        onOpenChange={(open) => {
          // Don't let the operator dismiss mid-delete.
          if (!busy) setConfirmOpen(open);
        }}
        isKeyboardDismissDisabled
        role="alertdialog"
      >
        <Dialog.Content width="md">
          <Dialog.Header>
            <Dialog.Title>Reset selected containers?</Dialog.Title>
          </Dialog.Header>
          <Dialog.Body>
            <Stack direction="column" gap={300}>
              <Text>
                You are about to permanently delete{' '}
                <Box as="span" fontWeight={600}>
                  {selectedTotal} object{selectedTotal === 1 ? '' : 's'}
                </Box>{' '}
                across {selectedContainers.length} container
                {selectedContainers.length === 1 ? '' : 's'}. This cannot be
                undone.
              </Text>
              <Stack direction="column" gap={100}>
                {selectedContainers.map(({ container }) => (
                  <Flex
                    key={container}
                    align="center"
                    gap={200}
                    fontSize="13px"
                  >
                    <Icon name="ChevronRight" size={14} color="neutral.9" />
                    <Box as="span" fontWeight={600} color="neutral.12">
                      {container}
                    </Box>
                    <Box as="span" color="neutral.10">
                      ({counts[container] ?? 0})
                    </Box>
                  </Flex>
                ))}
              </Stack>
            </Stack>
          </Dialog.Body>
          <Dialog.Footer>
            <Button
              slot="close"
              variant="outline"
              isDisabled={busy}
              onPress={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button colorPalette="critical" onPress={handleReset}>
              Delete {selectedTotal} object{selectedTotal === 1 ? '' : 's'}
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Root>

      <ToastOutlet />
    </Box>
  );
};

Reset.displayName = 'Reset';

export default Reset;
