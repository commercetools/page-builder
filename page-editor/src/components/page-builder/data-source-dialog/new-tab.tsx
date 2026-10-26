import { useIntl } from 'react-intl';
import {
  Box,
  Flex,
  FormField,
  LocalizedField,
  Switch,
  Tabs,
} from '@commercetools/nimbus';
import type { DataSourceType, LocalizedString } from '../types';
import messages from '../messages';
import { ConfigForm } from './config-form';
import type { DialogAction, DialogState } from '../data-source-dialog-state';

type Props = {
  draft: DialogState['draft'];
  normalizedDraftName: LocalizedString;
  defaultLocale: string;
  catalogEntry: DataSourceType;
  dispatch: (action: DialogAction) => void;
};

/** Compose a brand-new data source. */
export const NewSourceTab = ({
  draft,
  normalizedDraftName,
  defaultLocale,
  catalogEntry,
  dispatch,
}: Props) => {
  const intl = useIntl();
  return (
    <Tabs.Panel id="new">
      <FormField.Root size="sm" isRequired={true} mb={300}>
        <FormField.Label>
          {intl.formatMessage(messages.dataSourceConfigNameLabel)}
        </FormField.Label>
        <FormField.Input>
          <LocalizedField
            defaultLocaleOrCurrency={defaultLocale}
            valuesByLocaleOrCurrency={normalizedDraftName}
            onChange={(e) =>
              dispatch({
                type: 'draftChanged',
                patch: {
                  name: {
                    ...draft.name,
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
          isSelected={!!draft.reuse}
          onChange={() =>
            dispatch({
              type: 'draftChanged',
              patch: { reuse: !draft.reuse },
            })
          }
          size="sm"
        />
      </Flex>
      <Box pt={350} borderTop="solid-25" borderTopColor="neutral.6">
        <Box
          mb={250}
          fontSize={11}
          fontWeight={600}
          color="neutral.9"
          textTransform="uppercase"
          letterSpacing="0.06em"
        >
          {intl.formatMessage(messages.dataSourceConfigConfiguration)}
        </Box>
        <ConfigForm
          schema={catalogEntry.schema}
          value={draft.config}
          onChange={(config) =>
            dispatch({ type: 'draftChanged', patch: { config } })
          }
        />
      </Box>
    </Tabs.Panel>
  );
};
