import { useState } from 'react';
import { useIntl } from 'react-intl';
import {
  Box,
  Flex,
  Button,
  IconButton,
  TextInput,
  Image,
} from '@commercetools/nimbus';
import { useProductSearch } from '../../../hooks/use-product-search-connector';
import type { ProductSearchItem } from '../../../hooks/use-product-search-connector';
import { useProductsByIds } from '../../../hooks/use-products-by-ids';
import { useProjectLocales } from './locales';
import Icon from './icon';
import messages from '../messages';

export type ProductPick = {
  id: string;
  key?: string;
  sku?: string;
};

type ProductPicksFieldProps = {
  value: ProductPick[];
  onChange: (next: ProductPick[]) => void;
};

function InlineSearch({
  pickedIds,
  onAdd,
  onClose,
}: {
  pickedIds: Set<string>;
  onAdd: (item: ProductSearchItem) => void;
  onClose: () => void;
}) {
  const intl = useIntl();
  const { defaultLocale } = useProjectLocales();
  const [query, setQuery] = useState('');
  const { results, loading } = useProductSearch(query, defaultLocale);

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
          placeholder={intl.formatMessage(messages.productPickerSearch)}
          size="sm"
          flex={1}
          aria-label={intl.formatMessage(messages.productPickerSearch)}
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
          onPress={onClose}
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
          {intl.formatMessage(messages.productPickerNoResults)}
        </Box>
      )}

      {results.length > 0 && (
        <Box maxHeight={220} overflow="auto">
          {results.map((p) => {
            const already = pickedIds.has(p.id);
            return (
              <Flex
                key={p.id}
                align="center"
                gap={200}
                py={200}
                px={250}
                borderBottom="solid-25"
                borderBottomColor="neutral.3"
                opacity={already ? 0.55 : 1}
                _last={{ borderBottom: 'none' }}
              >
                {p.imageUrl ? (
                  <Image
                    src={p.imageUrl}
                    alt={p.name ?? ''}
                    fit="cover"
                    width={28}
                    height={28}
                    borderRadius={100}
                    flexShrink={0}
                  />
                ) : (
                  <Flex
                    align="center"
                    justify="center"
                    width={28}
                    height={28}
                    borderRadius={100}
                    bg="neutral.3"
                    flexShrink={0}
                  >
                    <Icon name="ShoppingBag" size={14} color="neutral.9" />
                  </Flex>
                )}
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
                    {p.name ?? p.sku ?? p.id}
                  </Box>
                  {p.sku && (
                    <Box
                      as="span"
                      display="block"
                      fontSize={10.5}
                      color="neutral.9"
                      fontFamily="mono"
                    >
                      {p.sku}
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
                      onAdd(p);
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

const ProductPicksField = ({ value, onChange }: ProductPicksFieldProps) => {
  const intl = useIntl();
  const { defaultLocale } = useProjectLocales();
  const [searchOpen, setSearchOpen] = useState(false);

  const picks = Array.isArray(value) ? value : [];
  const pickedIds = new Set(picks.map((p) => p.id));
  const display = useProductsByIds(
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

  const add = (item: ProductSearchItem) => {
    if (pickedIds.has(item.id)) return;
    onChange([
      ...picks,
      {
        id: item.id,
        key: item.key ?? undefined,
        sku: item.sku ?? undefined,
      },
    ]);
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
          {intl.formatMessage(messages.productPicksEmpty)}
        </Box>
      ) : (
        <Flex direction="column" gap={150}>
          {picks.map((pick, i) => {
            const d = display[pick.id];
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
                    aria-label={intl.formatMessage(messages.productPicksMoveUp)}
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
                      messages.productPicksMoveDown
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

                {d?.imageUrl ? (
                  <Image
                    src={d.imageUrl}
                    alt={d.name ?? ''}
                    fit="cover"
                    width={32}
                    height={32}
                    borderRadius={150}
                    flexShrink={0}
                  />
                ) : (
                  <Flex
                    align="center"
                    justify="center"
                    width={32}
                    height={32}
                    borderRadius={150}
                    bg="neutral.3"
                    flexShrink={0}
                  >
                    <Icon name="ShoppingBag" size={16} color="neutral.9" />
                  </Flex>
                )}

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
                    {d?.name ?? pick.sku ?? pick.key ?? pick.id}
                  </Box>
                  {pick.sku && (
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
                      {pick.sku}
                    </Box>
                  )}
                </Box>

                <IconButton
                  aria-label={intl.formatMessage(messages.productPicksRemove)}
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
          borderStyle="dashed"
        >
          <Icon name="Add" size={14} color="primary.11" />
          {intl.formatMessage(messages.productPicksAdd)}
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
        <Box as="span">{intl.formatMessage(messages.productPicksFooter)}</Box>
      </Flex>
    </Flex>
  );
};

export default ProductPicksField;
