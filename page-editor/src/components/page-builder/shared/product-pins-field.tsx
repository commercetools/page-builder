import { useState, useMemo } from 'react';
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
import { PinPositionInput } from './pin-position-input';

export type ProductPin = {
  position: number;
  id: string;
  key?: string;
  sku?: string;
};

type ProductPinsFieldProps = {
  value: ProductPin[];
  onChange: (pins: ProductPin[]) => void;
  limit?: number;
};

// ── Position strip ──────────────────────────────────────────────────────────

function PositionStrip({ pins, limit }: { pins: ProductPin[]; limit: number }) {
  const pinByPos = (pos: number) => pins.find((p) => p.position === pos);

  return (
    <Flex
      align="center"
      justify="space-between"
      gap={200}
      py={200}
      px={250}
      bg="neutral.3"
      borderRadius={150}
      flexWrap="wrap"
    >
      <Flex align="center" gap={200} flexWrap="wrap">
        <Box
          as="span"
          fontWeight={500}
          fontSize={11.5}
          color="neutral.11"
          flexShrink={0}
        >
          Layout
        </Box>
        <Flex gap={100} flexWrap="wrap">
          {Array.from({ length: limit }, (_, i) => {
            const pos = i + 1;
            const pin = pinByPos(pos);
            return (
              <Flex
                key={pos}
                align="center"
                justify="center"
                gap={50}
                minWidth={24}
                height={22}
                px={150}
                borderRadius={100}
                border={pin ? 'solid-25' : '1px dashed'}
                borderColor={pin ? 'primary.9' : 'neutral.7'}
                bg={pin ? 'primary.2' : 'neutral.3'}
                fontSize={11}
                fontFamily="mono"
                fontWeight={500}
                color={pin ? 'primary.11' : 'neutral.9'}
                title={
                  pin
                    ? `Position ${pos} — pinned to ${pin.sku ?? pin.id}`
                    : `Position ${pos} — filled by query`
                }
              >
                {pos}
                {pin && <Icon name="PushPin" size={10} color="primary.11" />}
              </Flex>
            );
          })}
        </Flex>
      </Flex>
      <Box as="span" fontSize={11.5} color="neutral.9" whiteSpace="nowrap">
        <Box as="strong" color="neutral.11">
          {pins.length}
        </Box>{' '}
        pinned,{' '}
        <Box as="strong" color="neutral.11">
          {limit - pins.length}
        </Box>{' '}
        from query
      </Box>
    </Flex>
  );
}

// ── Inline search panel ─────────────────────────────────────────────────────

function InlineSearch({
  pinnedIds,
  isFull,
  onPin,
  onClose,
}: {
  pinnedIds: Set<string>;
  isFull: boolean;
  onPin: (item: ProductSearchItem) => void;
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
            const alreadyPinned = pinnedIds.has(p.id);
            return (
              <Flex
                key={p.id}
                align="center"
                gap={200}
                py={200}
                px={250}
                borderBottom="solid-25"
                borderBottomColor="neutral.3"
                opacity={alreadyPinned ? 0.55 : 1}
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
                    <Icon name="Image" size={14} color="neutral.9" />
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
                    {p.name ?? p.id}
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
                  isDisabled={alreadyPinned || isFull}
                  variant="outline"
                  size="xs"
                  colorPalette={alreadyPinned ? undefined : 'primary'}
                  onPress={() => {
                    if (!alreadyPinned && !isFull) {
                      onPin(p);
                      setQuery('');
                    }
                  }}
                >
                  <Icon
                    name={alreadyPinned ? 'Check' : 'PushPin'}
                    size={12}
                    color={alreadyPinned ? 'neutral.9' : 'primary.11'}
                  />
                  {alreadyPinned ? 'Pinned' : 'Pin'}
                </Button>
              </Flex>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

const ProductPinsField = ({
  value,
  onChange,
  limit: limitProp = 8,
}: ProductPinsFieldProps) => {
  const intl = useIntl();
  const { defaultLocale } = useProjectLocales();
  const [searchOpen, setSearchOpen] = useState(false);

  const limit = Number(limitProp) > 0 ? Number(limitProp) : 8;

  const sortedPins = useMemo(() => {
    const pins = Array.isArray(value) ? value : [];
    return [...pins].sort((a, b) => (a.position || 0) - (b.position || 0));
  }, [value]);

  const occupied = useMemo(
    () => new Set(sortedPins.map((p) => p.position)),
    [sortedPins]
  );
  const pinnedIds = useMemo(
    () => new Set(sortedPins.map((p) => p.id)),
    [sortedPins]
  );

  const nextFreePosition = () => {
    for (let i = 1; i <= limit; i++) {
      if (!occupied.has(i)) return i;
    }
    return null;
  };

  const addPin = (item: ProductSearchItem) => {
    const pos = nextFreePosition();
    if (pos == null) return;
    const next = [
      ...sortedPins,
      {
        position: pos,
        id: item.id,
        key: item.key ?? undefined,
        sku: item.sku ?? undefined,
      },
    ].sort((a, b) => a.position - b.position);
    onChange(next);
  };

  const removePin = (id: string) => {
    onChange(sortedPins.filter((p) => p.id !== id));
  };

  const setPosition = (id: string, rawPos: string) => {
    const np = Math.max(1, Math.min(limit, Math.round(Number(rawPos) || 1)));
    const blocking = sortedPins.find((p) => p.position === np);
    const working = sortedPins.map((p) => ({ ...p }));
    const me = working.find((p) => p.id === id);
    if (!me) return;
    if (blocking && blocking.id !== id) {
      const b = working.find((p) => p.id === blocking.id)!;
      b.position = me.position;
    }
    me.position = np;
    onChange(working.sort((a, b) => a.position - b.position));
  };

  const display = useProductsByIds(
    sortedPins.map((p) => p.id),
    defaultLocale
  );

  const isFull = sortedPins.length >= limit;

  return (
    <Flex direction="column" gap={200}>
      <PositionStrip pins={sortedPins} limit={limit} />

      {sortedPins.length === 0 ? (
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
          No products pinned. All {limit} positions will be filled by the query
          above.
        </Box>
      ) : (
        <Flex direction="column" gap={150}>
          {sortedPins.map((pin) => {
            const d = display[pin.id];
            return (
              <Flex
                key={pin.id}
                align="center"
                gap={200}
                py={150}
                px={200}
                border="solid-25"
                borderColor="neutral.6"
                borderRadius={150}
                bg="neutral.1"
              >
                <Flex align="center" gap={150} flexShrink={0}>
                  <Box
                    as="span"
                    fontSize={10.5}
                    fontWeight={600}
                    color="neutral.9"
                    textTransform="uppercase"
                    letterSpacing="0.06em"
                  >
                    Pos
                  </Box>
                  <PinPositionInput
                    position={pin.position}
                    limit={limit}
                    onCommit={(v) => setPosition(pin.id, v)}
                  />
                </Flex>

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
                    {d?.name ?? pin.sku ?? pin.key ?? pin.id}
                  </Box>
                  {pin.sku && (
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
                      {pin.sku}
                    </Box>
                  )}
                </Box>

                <IconButton
                  aria-label={intl.formatMessage(messages.productPinsRemove)}
                  variant="ghost"
                  size="xs"
                  onPress={() => removePin(pin.id)}
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
          pinnedIds={pinnedIds}
          isFull={isFull}
          onPin={(item) => {
            addPin(item);
          }}
          onClose={() => setSearchOpen(false)}
        />
      ) : (
        <Button
          variant="outline"
          size="sm"
          isDisabled={isFull}
          onPress={() => setSearchOpen(true)}
          width="full"
          borderStyle={'dashed'}
          opacity={isFull ? 0.5 : 1}
        >
          <Icon name="PushPin" size={14} color="primary.11" />
          {isFull
            ? 'All positions pinned'
            : intl.formatMessage(messages.productPinsAdd)}
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
        <Box as="span">
          Pinned products sit at fixed positions; the remaining slots are filled
          by the query above. Adjust{' '}
          <Box as="strong" fontWeight={600} color="neutral.11">
            Limit
          </Box>{' '}
          to change the total number of products.
        </Box>
      </Flex>
    </Flex>
  );
};

export default ProductPinsField;
