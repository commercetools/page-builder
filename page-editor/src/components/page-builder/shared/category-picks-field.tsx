import { useState } from 'react';
import { useIntl } from 'react-intl';
import {
  Box,
  Flex,
  Button,
  IconButton,
  TextInput,
} from '@commercetools/nimbus';
import { useCategorySearch } from '../../../hooks/use-category-search';
import type { CategorySearchItem } from '../../../hooks/use-category-search';
import { useCategoriesByIds } from '../../../hooks/use-categories-by-ids';
import { useProjectLocales } from './locales';
import Icon from './icon';
import messages from '../messages';

export type CategoryPick = {
  id: string;
  key?: string;
};

const TONE_PALETTE = [
  { bg: 'primary.2', color: 'primary.11' },
  { bg: 'positive.2', color: 'positive.11' },
  { bg: 'critical.2', color: 'critical.11' },
  { bg: 'neutral.4', color: 'neutral.11' },
  { bg: 'primary.3', color: 'primary.10' },
  { bg: 'positive.3', color: 'positive.10' },
] as const;

type ToneEntry = (typeof TONE_PALETTE)[number];

function tone(id: string): ToneEntry {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONE_PALETTE[h % TONE_PALETTE.length];
}

type CategoryPicksFieldProps = {
  value: CategoryPick[];
  onChange: (next: CategoryPick[]) => void;
};

function InlineSearch({
  pickedIds,
  onAdd,
  onClose,
}: {
  pickedIds: Set<string>;
  onAdd: (item: CategorySearchItem) => void;
  onClose: () => void;
}) {
  const intl = useIntl();
  const { defaultLocale } = useProjectLocales();
  const [query, setQuery] = useState('');
  const { results, loading } = useCategorySearch(query, defaultLocale);

  return (
    <Box
      border="solid-25"
      borderColor="neutral.6"
      borderRadius={150}
      bg="neutral.1"
      overflow="hidden"
    >
      <Flex
        align="center"
        gap={200}
        py={150}
        px={250}
        borderBottom={results.length ? 'solid-25' : undefined}
        borderBottomColor="neutral.3"
      >
        <Icon name="Search" size={15} color="neutral.9" />
        <TextInput
          autoFocus
          variant="ghost"
          value={query}
          onChange={setQuery}
          placeholder={intl.formatMessage(messages.categoryPicksFilter)}
          size="sm"
          flex={1}
          aria-label={intl.formatMessage(messages.categoryPicksFilter)}
        />
        {loading && (
          <Box as="span" fontSize={11} color="neutral.9">
            {intl.formatMessage(messages.productPickerLoading)}
          </Box>
        )}
        <IconButton
          aria-label={intl.formatMessage(messages.productPickerClear)}
          variant="ghost"
          size="2xs"
          onPress={() => {
            onClose();
          }}
        >
          <Icon name="Close" size={14} color="neutral.9" />
        </IconButton>
      </Flex>

      {query.trim() && results.length === 0 && !loading && (
        <Box
          py={300}
          px={300}
          fontSize={12.5}
          color="neutral.9"
          textAlign="center"
        >
          {intl.formatMessage(messages.categoryPicksNoResults)}
        </Box>
      )}

      {results.length > 0 && (
        <Box maxHeight={240} overflow="auto">
          {results.map((c) => {
            const already = pickedIds.has(c.id);
            const t = tone(c.id);
            return (
              <Flex
                key={c.id}
                align="center"
                gap={200}
                py={200}
                px={250}
                borderBottom="solid-25"
                borderBottomColor="neutral.3"
                opacity={already ? 0.55 : 1}
                _last={{ borderBottom: 'none' }}
              >
                <Flex
                  align="center"
                  justify="center"
                  width={26}
                  height={26}
                  borderRadius={100}
                  bg={t.bg}
                  flexShrink={0}
                >
                  <Icon name="Category" size={13} color={t.color} />
                </Flex>
                <Box flex={1} minWidth={0}>
                  <Box
                    as="span"
                    display="block"
                    fontSize={12.5}
                    fontWeight={500}
                    color="neutral.12"
                    whiteSpace="nowrap"
                    overflow="hidden"
                    textOverflow="ellipsis"
                  >
                    {c.name ?? c.key ?? c.id}
                  </Box>
                  {c.breadcrumb && (
                    <Box
                      as="span"
                      display="block"
                      fontSize={10.5}
                      color="neutral.9"
                      whiteSpace="nowrap"
                      overflow="hidden"
                      textOverflow="ellipsis"
                    >
                      {c.breadcrumb}
                    </Box>
                  )}
                </Box>
                <Button
                  isDisabled={already}
                  variant="outline"
                  size="xs"
                  colorPalette={already ? undefined : 'primary'}
                  onPress={() => {
                    if (!already) {
                      onAdd(c);
                      setQuery('');
                    }
                  }}
                >
                  <Icon
                    name={already ? 'Check' : 'Add'}
                    size={12}
                    color={already ? 'neutral.9' : 'primary.11'}
                  />
                  {already ? 'Added' : 'Add'}
                </Button>
              </Flex>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

const CategoryPicksField = ({ value, onChange }: CategoryPicksFieldProps) => {
  const intl = useIntl();
  const { defaultLocale } = useProjectLocales();
  const [searchOpen, setSearchOpen] = useState(false);

  const picks = Array.isArray(value) ? value : [];
  const pickedIds = new Set(picks.map((p) => p.id));

  const display = useCategoriesByIds(
    picks.map((p) => p.id),
    defaultLocale
  );

  const remove = (id: string) => onChange(picks.filter((p) => p.id !== id));

  const move = (id: string, dir: -1 | 1) => {
    const idx = picks.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const j = idx + dir;
    if (j < 0 || j >= picks.length) return;
    const next = [...picks];
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  };

  const add = (item: CategorySearchItem) => {
    if (pickedIds.has(item.id)) return;
    onChange([...picks, { id: item.id, key: item.key ?? undefined }]);
  };

  return (
    <Flex direction="column" gap={200}>
      {picks.length === 0 ? (
        <Box
          py={300}
          px={300}
          textAlign="center"
          border="1px dashed"
          borderColor="neutral.6"
          borderRadius={150}
          color="neutral.9"
          fontSize={12.5}
          lineHeight={1.5}
        >
          {intl.formatMessage(messages.categoryPicksEmpty)}
        </Box>
      ) : (
        <Flex direction="column" gap={150}>
          {picks.map((pick, i) => {
            const d = display[pick.id];
            const t = tone(pick.id);
            return (
              <Flex
                key={pick.id}
                align="center"
                gap={200}
                py={150}
                px={200}
                border="solid-25"
                borderColor="neutral.6"
                borderRadius={150}
                bg="neutral.1"
              >
                <Flex direction="column" gap={0} flexShrink={0}>
                  <IconButton
                    aria-label={intl.formatMessage(
                      messages.categoryPicksMoveUp
                    )}
                    variant="ghost"
                    size="2xs"
                    isDisabled={i === 0}
                    onPress={() => move(pick.id, -1)}
                  >
                    <Icon
                      name="KeyboardArrowUp"
                      size={14}
                      color={i === 0 ? 'neutral.6' : 'neutral.9'}
                    />
                  </IconButton>
                  <IconButton
                    aria-label={intl.formatMessage(
                      messages.categoryPicksMoveDown
                    )}
                    variant="ghost"
                    size="2xs"
                    isDisabled={i === picks.length - 1}
                    onPress={() => move(pick.id, 1)}
                  >
                    <Icon
                      name="KeyboardArrowDown"
                      size={14}
                      color={i === picks.length - 1 ? 'neutral.6' : 'neutral.9'}
                    />
                  </IconButton>
                </Flex>

                <Box
                  as="span"
                  width={20}
                  textAlign="center"
                  fontSize={11}
                  fontFamily="mono"
                  fontWeight={500}
                  color="neutral.9"
                  flexShrink={0}
                >
                  {i + 1}
                </Box>

                <Flex
                  align="center"
                  justify="center"
                  width={30}
                  height={30}
                  borderRadius={150}
                  bg={t.bg}
                  flexShrink={0}
                >
                  <Icon name="Category" size={15} color={t.color} />
                </Flex>

                <Box flex={1} minWidth={0}>
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
                    {d?.name ?? pick.key ?? pick.id}
                  </Box>
                  <Box
                    as="span"
                    display="block"
                    fontSize={11}
                    color="neutral.9"
                    whiteSpace="nowrap"
                    overflow="hidden"
                    textOverflow="ellipsis"
                  >
                    {d?.breadcrumb ?? pick.id}
                  </Box>
                </Box>

                <IconButton
                  aria-label={intl.formatMessage(messages.categoryPicksRemove)}
                  variant="ghost"
                  size="xs"
                  onPress={() => remove(pick.id)}
                  flexShrink={0}
                >
                  <Icon name="Close" size={14} color="neutral.9" />
                </IconButton>
              </Flex>
            );
          })}
        </Flex>
      )}

      {searchOpen ? (
        <InlineSearch
          pickedIds={pickedIds}
          onAdd={(item) => {
            add(item);
          }}
          onClose={() => setSearchOpen(false)}
        />
      ) : (
        <Button
          variant="outline"
          size="sm"
          onPress={() => setSearchOpen(true)}
          width="full"
          borderStyle={'dashed'}
        >
          <Icon name="Add" size={14} color="primary.11" />
          {intl.formatMessage(messages.categoryPicksAdd)}
        </Button>
      )}

      <Flex
        align="flex-start"
        gap={150}
        py={150}
        px={200}
        bg="neutral.3"
        borderRadius={150}
        fontSize={11.5}
        color="neutral.9"
        lineHeight={1.5}
      >
        <Icon name="Info" size={13} color="neutral.9" />
        <Box as="span">{intl.formatMessage(messages.categoryPicksFooter)}</Box>
      </Flex>
    </Flex>
  );
};

export default CategoryPicksField;
