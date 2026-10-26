import { useIntl } from 'react-intl';
import { Button, Dialog, Flex } from '@commercetools/nimbus';
import Icon from '../shared/icon';
import messages from '../messages';
import type { DialogTab } from '../data-source-dialog-state';

type Props = {
  tab: DialogTab;
  canSubmit: boolean;
  saving: boolean;
  isUnpublished: boolean;
  editDirty: boolean | null;
  editNameStr: string;
  lastSavedId: string | null;
  handleUse: () => void;
  handleSave: () => Promise<void>;
  handlePublishDs: () => Promise<void>;
  handleSaveAsCopy: () => Promise<void>;
  onClose: () => void;
};

/** Use / save / publish actions, which differ per tab. */
export const DataSourceDialogFooter = ({
  tab,
  canSubmit,
  saving,
  isUnpublished,
  editDirty,
  editNameStr,
  lastSavedId,
  handleUse,
  handleSave,
  handlePublishDs,
  handleSaveAsCopy,
  onClose,
}: Props) => {
  const intl = useIntl();
  return (
    <Dialog.Footer flexDirection="column" gap={0} padding={0}>
      {(lastSavedId || isUnpublished) && (
        <Flex
          align="center"
          py={200}
          px={500}
          bg="warning.2"
          borderTop="solid-25"
          borderTopColor="warning.8"
          gap={7}
          fontSize={12.5}
          color="warning.11"
          width="full"
        >
          <Icon name="Warning" size={14} color="warning.11" />
          {intl.formatMessage(messages.dataSourceConfigSavedToDraft)}
        </Flex>
      )}
      <Flex
        justify="flex-end"
        py={300}
        px={500}
        gap={200}
        borderTop="solid-25"
        borderTopColor="neutral.6"
        bg="neutral.3"
        width="full"
      >
        {tab === 'edit' && (
          <Button
            variant="outline"
            size="sm"
            isDisabled={!editNameStr.length || saving}
            onPress={handleSaveAsCopy}
          >
            <Flex as="span" inline align="center" gap={5}>
              <Icon name="ContentCopy" size={13} color="neutral.11" />
              {intl.formatMessage(messages.dataSourceConfigSaveAsCopy)}
            </Flex>
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          isDisabled={saving}
          onPress={onClose}
        >
          {lastSavedId || isUnpublished
            ? intl.formatMessage(messages.dataSourceConfigClose)
            : intl.formatMessage(messages.dataSourceConfigCancel)}
        </Button>

        {tab === 'existing' && (
          <Button
            variant="solid"
            colorPalette="primary"
            size="sm"
            isDisabled={!canSubmit}
            onPress={handleUse}
          >
            {intl.formatMessage(messages.dataSourceConfigUseSelected)}
          </Button>
        )}

        {(tab === 'new' || tab === 'edit') && (
          <>
            {/* Use — only when edit, clean, nothing pending publish */}
            {tab === 'edit' && !editDirty && !lastSavedId && !isUnpublished && (
              <Button
                variant="solid"
                colorPalette="primary"
                size="sm"
                isDisabled={!canSubmit}
                onPress={handleUse}
              >
                {intl.formatMessage(messages.dataSourceConfigUse)}
              </Button>
            )}

            {/* Save — when new or dirty */}
            {(tab === 'new' || editDirty) && (
              <Button
                variant="outline"
                size="sm"
                isDisabled={!canSubmit || saving}
                onPress={handleSave}
              >
                <Flex as="span" inline align="center" gap={5}>
                  <Icon name="Save" size={13} color="neutral.12" />
                  {saving
                    ? intl.formatMessage(messages.dataSourceConfigSaving)
                    : tab === 'new'
                    ? intl.formatMessage(messages.dataSourceConfigSaveAndUse)
                    : intl.formatMessage(messages.dataSourceConfigSaveChanges)}
                </Flex>
              </Button>
            )}

            {/* Publish — when new, dirty, or saved-but-not-published */}
            {(tab === 'new' || editDirty || lastSavedId || isUnpublished) && (
              <Button
                variant="solid"
                colorPalette="primary"
                size="sm"
                isDisabled={!canSubmit || saving}
                onPress={handlePublishDs}
              >
                <Flex as="span" inline align="center" gap={5}>
                  <Icon name="Publish" size={13} color="neutral.1" />
                  {saving
                    ? intl.formatMessage(messages.dataSourceConfigPublishing)
                    : tab === 'new'
                    ? intl.formatMessage(messages.dataSourceConfigPublishAndUse)
                    : intl.formatMessage(messages.menuBarPublish)}
                </Flex>
              </Button>
            )}
          </>
        )}
      </Flex>
    </Dialog.Footer>
  );
};
