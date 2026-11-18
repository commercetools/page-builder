import { useIntl } from 'react-intl';
import {
  Box,
  Button,
  Flex,
  SearchInput,
  Stack,
  Tabs,
} from '@commercetools/nimbus';
import type { DataSourceType, SavedDataSource } from '../types';
import { summarizeConfig } from '../data-source-catalog';
import Icon from '../shared/icon';
import messages from '../messages';
import type { DialogAction } from '../data-source-dialog-state';

type Props = {
  matchingSaved: SavedDataSource[];
  filteredSaved: SavedDataSource[];
  pickedId: string | null;
  search: string;
  catalogEntry: DataSourceType;
  beginEdit: (ds: SavedDataSource) => void;
  dispatch: (action: DialogAction) => void;
};

/** Browse and pick an already-saved data source of this type. */
export const ExistingSourceTab = ({
  matchingSaved,
  filteredSaved,
  pickedId,
  search,
  catalogEntry,
  beginEdit,
  dispatch,
}: Props) => {
  const intl = useIntl();
  return (
    <Tabs.Panel id="existing">
      {!matchingSaved.length ? (
        <Box
          py={600}
          px={400}
          borderRadius={200}
          textAlign="center"
          color="neutral.9"
          border="1px dashed"
          borderColor="neutral.6"
          fontSize={13}
        >
          {intl.formatMessage(messages.dataSourceConfigNoSavedYet)}{' '}
          <Button
            variant="link"
            size="sm"
            onPress={() => dispatch({ type: 'tabSelected', tab: 'new' })}
          >
            {intl.formatMessage(messages.dataSourceConfigTabCreateNew)}
          </Button>{' '}
          {intl.formatMessage(messages.dataSourceConfigToMakeOne)}
        </Box>
      ) : (
        <Stack gap={250}>
          <SearchInput
            size={'sm'}
            value={search}
            onChange={(val) => dispatch({ type: 'searched', text: val })}
            aria-label={intl.formatMessage(
              messages.dataSourceConfigSearchPlaceholder
            )}
            placeholder={intl.formatMessage(
              messages.dataSourceConfigSearchPlaceholder
            )}
            width={'full'}
          />
          <Box
            borderRadius={200}
            maxHeight={280}
            overflow="auto"
            border="solid-25"
            borderColor="neutral.6"
          >
            {filteredSaved.length === 0 && (
              <Box
                py="18px"
                px={350}
                fontSize={12.5}
                color="neutral.9"
                textAlign="center"
              >
                {intl.formatMessage(messages.dataSourceConfigNoMatches)}
              </Box>
            )}
            {filteredSaved.map((s) => {
              const active = pickedId === s.id;
              const displayName =
                Object.values(s.name ?? {}).find(Boolean) ?? s.id;
              const configSummary = summarizeConfig(s.config, (v) => {
                if (typeof v !== 'object' || v === null) return String(v ?? '');
                const obj = v as Record<string, string>;
                return obj.name || Object.values(obj).find(Boolean) || '';
              });
              return (
                <Flex
                  key={s.id}
                  align="center"
                  gap={200}
                  pt={150}
                  pr={200}
                  pb={150}
                  pl={0}
                  bg={active ? 'primary.2' : 'transparent'}
                  borderBottom="solid-25"
                  borderBottomColor="neutral.3"
                  boxShadow={
                    active
                      ? 'inset 3px 0 0 var(--nimbus-colors-primary-9)'
                      : 'none'
                  }
                >
                  <Flex
                    as="button"
                    align="center"
                    onClick={() => dispatch({ type: 'sourcePicked', id: s.id })}
                    gap={300}
                    flex={1}
                    minWidth={0}
                    textAlign="left"
                    cursor="pointer"
                    pt={100}
                    pr={100}
                    pb={100}
                    pl={300}
                    bg="transparent"
                    border={0}
                  >
                    <Flex
                      as="span"
                      align="center"
                      justify="center"
                      borderRadius={150}
                      width={30}
                      height={30}
                      bg="neutral.3"
                      flexShrink={0}
                    >
                      <Icon
                        name={catalogEntry.icon}
                        size={15}
                        color="neutral.11"
                      />
                    </Flex>
                    <Box as="span" flex={1} minWidth={0}>
                      <Box
                        as="span"
                        display="block"
                        fontSize={13}
                        fontWeight={500}
                        color="neutral.12"
                        whiteSpace="nowrap"
                        overflow="hidden"
                        textOverflow="ellipsis"
                      >
                        {displayName}
                      </Box>
                      <Box
                        as="span"
                        display="block"
                        fontSize={11}
                        color="neutral.9"
                        fontFamily="mono"
                        whiteSpace="nowrap"
                        overflow="hidden"
                        textOverflow="ellipsis"
                      >
                        {configSummary}
                      </Box>
                    </Box>
                    {active && (
                      <Icon name="CheckCircle" size={16} color="primary.10" />
                    )}
                  </Flex>
                  <Button
                    variant="outline"
                    size="xs"
                    onPress={() => beginEdit(s)}
                    bg={'neutral.1'}
                  >
                    <Icon name="Edit" size={13} color="neutral.11" />
                    {intl.formatMessage(messages.dataSourceConfigEdit)}
                  </Button>
                </Flex>
              );
            })}
          </Box>
          <Flex align="center" inline fontSize={11.5} color="neutral.9" gap={5}>
            <Icon name="Info" size={13} color="neutral.9" />
            {intl.formatMessage(messages.dataSourceConfigReuseHint)}
          </Flex>
        </Stack>
      )}
    </Tabs.Panel>
  );
};
