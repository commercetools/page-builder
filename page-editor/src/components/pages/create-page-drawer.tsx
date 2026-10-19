import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { Drawer } from '@commercetools-frontend/application-components';
import { Box, Flex, FormField, TextInput } from '@commercetools/nimbus';
import type { PreviewSettings } from '../page-builder/types';
import {
  normalizeSlug,
  pathForSlug,
  validateArbitrarySlug,
} from '../page-builder/page-path';
import messages from './messages';

type CreatePageDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  settings: PreviewSettings | null;
  existingPageIds: { has(id: string): boolean };
  categoryIds: string[];
  onCreate: (args: { slug: string; name: string }) => void;
  creating?: boolean;
};

const CreatePageDrawer = ({
  isOpen,
  onClose,
  settings,
  existingPageIds,
  categoryIds,
  onCreate,
  creating = false,
}: CreatePageDrawerProps) => {
  const intl = useIntl();
  const [name, setName] = useState('');
  const [urlInput, setUrlInput] = useState('');

  const slug = normalizeSlug(urlInput);
  const validation = useMemo(
    () =>
      validateArbitrarySlug({ slug, settings, existingPageIds, categoryIds }),
    [slug, settings, existingPageIds, categoryIds]
  );

  const touched = urlInput.trim().length > 0;
  const showError = touched && !validation.ok;
  const errorMessage =
    validation.ok || !touched
      ? undefined
      : validation.reason === 'duplicate'
      ? intl.formatMessage(messages.newPageErrorDuplicate)
      : validation.reason === 'reserved'
      ? intl.formatMessage(messages.newPageErrorReserved)
      : intl.formatMessage(messages.newPageErrorFormat);

  const canCreate = validation.ok && name.trim().length > 0 && !creating;

  const reset = () => {
    setName('');
    setUrlInput('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleCreate = () => {
    if (!canCreate) return;
    onCreate({ slug, name: name.trim() });
    reset();
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={handleClose}
      size={20}
      title={intl.formatMessage(messages.newPageDrawerTitle)}
      labelPrimaryButton={intl.formatMessage(messages.newPageCreate)}
      onPrimaryButtonClick={handleCreate}
      isPrimaryButtonDisabled={!canCreate}
      labelSecondaryButton={intl.formatMessage(messages.newPageCancel)}
      onSecondaryButtonClick={handleClose}
    >
      <Flex direction="column" gap={500} maxWidth={9600}>
        <FormField.Root isRequired>
          <FormField.Label>
            {intl.formatMessage(messages.newPageNameLabel)}
          </FormField.Label>
          <FormField.Input>
            <TextInput
              value={name}
              onChange={(v: string) => setName(v)}
              placeholder={intl.formatMessage(messages.newPageNamePlaceholder)}
            />
          </FormField.Input>
        </FormField.Root>

        <FormField.Root isRequired isInvalid={showError}>
          <FormField.Label>
            {intl.formatMessage(messages.newPageUrlLabel)}
          </FormField.Label>
          <FormField.Input>
            <TextInput
              value={urlInput}
              onChange={(v: string) => setUrlInput(v)}
              placeholder="about-us"
            />
          </FormField.Input>
          <FormField.Description>
            {intl.formatMessage(messages.newPageUrlHint)}
          </FormField.Description>
          <FormField.Error>{errorMessage}</FormField.Error>
        </FormField.Root>

        {validation.ok && slug && (
          <Box fontSize={300} color="neutral.11">
            {intl.formatMessage(messages.newPageResolvesTo, {
              url: pathForSlug(slug),
            })}
          </Box>
        )}
      </Flex>
    </Drawer>
  );
};

export default CreatePageDrawer;
