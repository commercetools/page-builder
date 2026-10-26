import { useIntl } from 'react-intl';
import {
  Box,
  Button,
  Flex,
  FormField,
  LocalizedField,
  Spacer,
  Switch,
  Tabs,
} from '@commercetools/nimbus';
import type {
  DataSourceType,
  LocalizedString,
  SavedDataSource,
} from '../types';
import Icon from '../shared/icon';
import messages from '../messages';
import { ConfigForm } from './config-form';
import type { DialogAction, DialogState } from '../data-source-dialog-state';

type Props = {
  edit: DialogState['edit'];
  /** Non-null: the caller only renders this panel once an edit target exists. */
  editingOriginal: SavedDataSource;
  editDirty: boolean | null;
  normalizedEditName: LocalizedString;
  defaultLocale: string;
  catalogEntry: DataSourceType;
  dispatch: (action: DialogAction) => void;
};

/** Amend an existing saved data source. */
export const EditSourceTab = ({
  edit,
  editingOriginal,
  editDirty,
  normalizedEditName,
  defaultLocale,
  catalogEntry,
  dispatch,
}: Props) => {
  const intl = useIntl();
  return (
    <Tabs.Panel id="edit">
      <Flex
        align="center"
        mt="4px"
        mb={300}
        justify="space-between"
        py={200}
        px={250}
        borderRadius={150}
        bg="neutral.3"
      >
        <Button
          variant="ghost"
          size="2xs"
          onPress={() => {
            dispatch({ type: 'editCancelled' });
          }}
        >
          <Icon name="ArrowBack" size={14} color="neutral.11" />
          {intl.formatMessage(messages.dataSourceConfigBackToSaved)}
        </Button>
        <Spacer />
        {editingOriginal.savedForReuse && (
          <Flex
            as="span"
            inline
            align="center"
            fontSize={11}
            color="neutral.9"
            gap={5}
          >
            <Icon name="Info" size={13} color="neutral.9" />
            {intl.formatMessage(messages.dataSourceConfigChangesApplyHint)}
          </Flex>
        )}
      </Flex>
      <FormField.Root size="sm" mb={300} isRequired={true}>
        <FormField.Label>
          {intl.formatMessage(messages.dataSourceConfigNameLabel)}
        </FormField.Label>
        <FormField.Input>
          <LocalizedField
            defaultLocaleOrCurrency={defaultLocale}
            valuesByLocaleOrCurrency={normalizedEditName}
            onChange={(e) =>
              dispatch({
                type: 'editChanged',
                patch: {
                  name: {
                    ...edit.name,
                    [e.target.locale!]: e.target.value as string,
                  },
                },
              })
            }
            size="sm"
            width="full"
          />
        </FormField.Input>
      </FormField.Root>
      <Flex
        align="center"
        justify="space-between"
        py={200}
        px={250}
        borderRadius={150}
        mt="4px"
        mb={350}
        bg="neutral.3"
      >
        <Box as="span" fontSize={12.5} color="neutral.12">
          <Box as="strong" fontWeight={600}>
            {intl.formatMessage(messages.dataSourceConfigSaveForReuse)}
          </Box>{' '}
          {intl.formatMessage(messages.dataSourceConfigSaveForReuseDescription)}
        </Box>
        <Switch
          isSelected={!!edit.reuse}
          onChange={() =>
            dispatch({
              type: 'editChanged',
              patch: { reuse: !edit.reuse },
            })
          }
          size="sm"
        />
      </Flex>

      <Box pt={350} borderTop="solid-25" borderTopColor="neutral.6">
        <Flex align="center" justify="space-between" mb={250}>
          <Box
            fontSize={11}
            fontWeight={600}
            color="neutral.9"
            textTransform="uppercase"
            letterSpacing="0.06em"
          >
            {intl.formatMessage(messages.dataSourceConfigConfiguration)}
          </Box>
          {editDirty && (
            <Box
              as="span"
              borderRadius="full"
              fontSize={10.5}
              fontWeight={600}
              color="warning.11"
              bg="warning.2"
              padding="2px 7px"
              letterSpacing="0.04em"
              textTransform="uppercase"
            >
              {intl.formatMessage(messages.dataSourceConfigUnsavedChanges)}
            </Box>
          )}
        </Flex>
        <ConfigForm
          schema={catalogEntry.schema}
          value={edit.config}
          onChange={(config) =>
            dispatch({ type: 'editChanged', patch: { config } })
          }
        />
      </Box>

      <Flex
        align="flex-start"
        mt={200}
        py={200}
        px={250}
        borderRadius={150}
        gap={150}
        fontSize={11.5}
        color="neutral.9"
        lineHeight={1.5}
        bg="neutral.3"
      >
        <Icon name="Info" size={13} color="neutral.9" />
        <Box as="span">
          <Box as="strong" fontWeight={600} color="neutral.11">
            {intl.formatMessage(messages.dataSourceConfigSaveAsCopy)}
          </Box>{' '}
          {intl.formatMessage(messages.dataSourceConfigSaveAsCopyDescription)}
        </Box>
      </Flex>
    </Tabs.Panel>
  );
};
