import { useIntl } from 'react-intl';
import { Box, Button, Dialog, Flex, Stack } from '@commercetools/nimbus';
import Icon from '../page-builder/shared/icon';
import messages from './messages';

export type CreateDedicatedPageMode = 'empty' | 'copy';

/** `plp` copies the "All categories" PLP fallback; `pdp` copies its PDP. */
export type CreateDedicatedPageVariant = 'plp' | 'pdp';

type CreateDedicatedPageDialogProps = {
  open: boolean;
  /** Which page a dedicated version is being created for. Defaults to `plp`. */
  variant?: CreateDedicatedPageVariant;
  categoryTitle: string;
  canCopyFallback: boolean;
  onSelect: (mode: CreateDedicatedPageMode) => void;
  onClose: () => void;
};

const COPY = {
  plp: {
    title: messages.createDedicatedDialogTitle,
    description: messages.createDedicatedDialogDescription,
    copyLabel: messages.createDedicatedCopyFallbackLabel,
    copyHint: messages.createDedicatedCopyFallbackHint,
    copyUnavailable: messages.createDedicatedCopyFallbackUnavailable,
  },
  pdp: {
    title: messages.createOverrideDialogTitle,
    description: messages.createOverrideDialogDescription,
    copyLabel: messages.createOverrideCopyGlobalLabel,
    copyHint: messages.createOverrideCopyGlobalHint,
    copyUnavailable: messages.createOverrideCopyGlobalUnavailable,
  },
} as const;

const CreateDedicatedPageDialog = ({
  open,
  variant = 'plp',
  categoryTitle,
  canCopyFallback,
  onSelect,
  onClose,
}: CreateDedicatedPageDialogProps) => {
  const intl = useIntl();
  const copy = COPY[variant];

  const options: {
    mode: CreateDedicatedPageMode;
    icon: string;
    label: string;
    hint: string;
    disabled?: boolean;
  }[] = [
    {
      mode: 'empty',
      icon: 'Add',
      label: intl.formatMessage(messages.createDedicatedStartEmptyLabel),
      hint: intl.formatMessage(messages.createDedicatedStartEmptyHint),
    },
    {
      mode: 'copy',
      icon: 'ContentCopy',
      label: intl.formatMessage(copy.copyLabel),
      hint: canCopyFallback
        ? intl.formatMessage(copy.copyHint)
        : intl.formatMessage(copy.copyUnavailable),
      disabled: !canCopyFallback,
    },
  ];

  return (
    <Dialog.Root
      isOpen={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      isDismissable
    >
      <Dialog.Content width="480px">
        <Dialog.Header>
          <Dialog.Title>{intl.formatMessage(copy.title)}</Dialog.Title>
          <Dialog.CloseTrigger />
        </Dialog.Header>
        <Dialog.Body>
          <Box fontSize={13} color="neutral.11" lineHeight={1.5} mb={300}>
            {intl.formatMessage(copy.description, {
              category: categoryTitle,
            })}
          </Box>
          <Stack gap={200}>
            {options.map((opt) => (
              <Box
                key={opt.mode}
                as="button"
                aria-disabled={opt.disabled || undefined}
                onClick={() => {
                  if (!opt.disabled) onSelect(opt.mode);
                }}
                border="solid-25"
                borderColor="neutral.6"
                borderRadius={200}
                padding={300}
                bg="neutral.1"
                cursor={opt.disabled ? 'not-allowed' : 'pointer'}
                opacity={opt.disabled ? 0.55 : 1}
                textAlign="left"
                width="100%"
                _hover={
                  opt.disabled
                    ? undefined
                    : {
                        borderColor: 'var(--nimbus-colors-primary-6)',
                        background: 'var(--nimbus-colors-primary-1)',
                      }
                }
              >
                <Flex align="center" gap={300}>
                  <Flex
                    align="center"
                    justify="center"
                    width={36}
                    height={36}
                    borderRadius={8}
                    bg="primary.2"
                    flexShrink={0}
                  >
                    <Icon name={opt.icon} size={18} color="primary.10" />
                  </Flex>
                  <Box flex={1} minWidth={0}>
                    <Box fontSize={14} fontWeight={600} color="neutral.12">
                      {opt.label}
                    </Box>
                    <Box
                      fontSize={12}
                      color="neutral.9"
                      lineHeight={1.4}
                      mt={50}
                    >
                      {opt.hint}
                    </Box>
                  </Box>
                  {!opt.disabled && (
                    <Icon name="ChevronRight" size={18} color="neutral.9" />
                  )}
                </Flex>
              </Box>
            ))}
          </Stack>
        </Dialog.Body>
        <Dialog.Footer>
          <Button variant="outline" size="sm" onPress={onClose}>
            {intl.formatMessage(messages.createDedicatedDialogCancel)}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
};

export default CreateDedicatedPageDialog;
