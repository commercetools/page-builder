import { useIntl } from 'react-intl';
import {
  Badge,
  Box,
  Button,
  Flex,
  IconButton,
  Card,
} from '@commercetools/nimbus';
import type { DataSourceType, SavedDataSource } from '../types';
import { findDSEntry, summarizeConfig } from '../data-source-catalog';
import Icon from '../shared/icon';
import { useLocalizedDisplay } from '../shared/locales';
import messages from '../messages';

export function DataSourceSlot({
  dsType,
  dsId,
  savedDataSources,
  dataSourceCatalog,
  instancesDirty,
  onConfigure,
  onClear,
}: {
  dsType: string;
  dsId: string | null | undefined;
  savedDataSources: SavedDataSource[];
  dataSourceCatalog: DataSourceType[];
  instancesDirty: boolean;
  onConfigure: () => void;
  onClear: () => void;
}) {
  const intl = useIntl();
  const displayString = useLocalizedDisplay();
  const bound = dsId ? savedDataSources.find((d) => d.id === dsId) : null;
  const meta = findDSEntry(dsType, dataSourceCatalog);

  if (!bound) {
    return (
      <Button
        variant="outline"
        size="sm"
        onPress={onConfigure}
        width={'full'}
        paddingX={250}
        paddingY={300}
        bg={'neutral.3'}
        borderStyle={'dashed'}
        gap={250}
      >
        <Flex
          align="center"
          justify="center"
          borderRadius={150}
          width={28}
          height={28}
          bg="neutral.1"
          border="solid-25"
          borderColor="neutral.6"
          flexShrink={0}
        >
          <Icon name={meta?.icon ?? 'Storage'} size={14} color="neutral.11" />
        </Flex>
        <Box as="span" flex={1} minWidth={0} textAlign="left">
          <Box
            as="span"
            display="block"
            fontSize="12.5px"
            fontWeight={500}
            color="neutral.12"
          >
            {intl.formatMessage(messages.settingsPaneConfigureDataSource)}
          </Box>
          <Box as="span" display="block" fontSize={11} color="neutral.9">
            {meta ? displayString(meta.name) : dsType}
          </Box>
        </Box>
        <Icon name="ChevronRight" size={14} color="neutral.9" />
      </Button>
    );
  }

  const configSummary = summarizeConfig(bound.config, displayString);

  return (
    <Card.Root bg="neutral.1">
      <Card.Body>
        <Flex align="center" gap={250} mb={150}>
          <Flex
            align="center"
            justify="center"
            borderRadius={150}
            width={28}
            height={28}
            bg="primary.3"
            flexShrink={0}
          >
            <Icon name={meta?.icon ?? 'Storage'} size={14} color="primary.11" />
          </Flex>
          <Box as="span" flex={1} minWidth={0}>
            <Box
              as="span"
              display="block"
              fontSize="12.5px"
              fontWeight={600}
              color="neutral.12"
              whiteSpace="nowrap"
              overflow="hidden"
              textOverflow="ellipsis"
            >
              {displayString(bound.name)}
            </Box>
            <Box
              as="span"
              display="block"
              fontSize="10.5px"
              color="neutral.9"
              fontFamily="mono"
              whiteSpace="nowrap"
              overflow="hidden"
              textOverflow="ellipsis"
            >
              {meta ? displayString(meta.name) : dsType}
            </Box>
          </Box>
          {bound.savedForReuse && (
            <Badge
              colorPalette={instancesDirty ? 'warning' : 'positive'}
              size="2xs"
            >
              {instancesDirty
                ? intl.formatMessage(messages.settingsPaneUnpublished)
                : intl.formatMessage(messages.settingsPanePublished)}
            </Badge>
          )}
        </Flex>
        <Box
          mb={200}
          fontSize={11}
          color="neutral.9"
          lineHeight={1.4}
          whiteSpace="nowrap"
          overflow="hidden"
          textOverflow="ellipsis"
        >
          {configSummary}
        </Box>
        <Flex gap={150}>
          <Button variant="outline" size="xs" onPress={onConfigure} flex={1}>
            <Icon name="Settings" size={13} color="neutral.11" />
            {intl.formatMessage(messages.settingsPaneEditReplace)}
          </Button>
          <IconButton
            aria-label={intl.formatMessage(
              messages.settingsPaneClearDataBinding
            )}
            variant="outline"
            size="xs"
            onPress={onClear}
          >
            <Icon name="LinkOff" size={13} color="neutral.11" />
          </IconButton>
        </Flex>
      </Card.Body>
    </Card.Root>
  );
}
