import { useState, useMemo } from 'react';
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
import { PinPositionInput } from './pin-position-input';

export type CategoryPin = {
  position: number;
  id: string;
  key?: string;
};

type CategoryPinsFieldProps = {
  value: CategoryPin[];
  onChange: (pins: CategoryPin[]) => void;
  limit?: number;
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

// ── Position strip ──────────────────────────────────────────────────────────

function PositionStrip({
  pins,
  limit,
  display,
}: {
  pins: CategoryPin[];
  limit: number;
  display: Record<string, { name: string | null; breadcrumb: string | null }>;
}) {
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
            const t = pin ? tone(pin.id) : null;
            const d = pin ? display[pin.id] : null;
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
                borderColor={t ? t.color : 'neutral.7'}
                bg={t ? t.bg : 'neutral.3'}
                fontSize={11}
                fontFamily="mono"
                fontWeight={500}
                color={t ? t.color : 'neutral.9'}
                title={
                  pin
                    ? `Position ${pos} — pinned to ${d?.name ?? pin.id}`
                    : `Position ${pos} — auto-filled`
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
        auto-filled
      </Box>
    </Flex>
  );
}

// ── Inline search ───────────────────────────────────────────────────────────

function InlineSearch({
  pinnedIds,
  isFull,
  onPin,
  onClose,
}: {
  pinnedIds: Set<string>;
  isFull: boolean;
  onPin: (cat: CategorySearchItem) => void;
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
          {intl.formatMessage(messages.categoryPicksNoResults)}
        </Box>
      )}

      {results.length > 0 && (
        <Box maxHeight={240} overflow="auto">
          {results.map((c) => {
            const already = pinnedIds.has(c.id);
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
                  isDisabled={already || isFull}
                  variant="outline"
                  size="xs"
                  colorPalette={already ? undefined : 'primary'}
                  onPress={() => {
                    if (!already && !isFull) {
                      onPin(c);
                      setQuery('');
                    }
                  }}
                >
                  <Icon
                    name={already ? 'Check' : 'PushPin'}
                    size={12}
                    color={already ? 'neutral.9' : 'primary.11'}
                  />
                  {already ? 'Pinned' : 'Pin'}
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

const CategoryPinsField = ({
  value,
  onChange,
  limit: limitProp = 8,
}: CategoryPinsFieldProps) => {
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

  const display = useCategoriesByIds(
    sortedPins.map((p) => p.id),
    defaultLocale
  );

  const nextFreePosition = () => {
    for (let i = 1; i <= limit; i++) {
      if (!occupied.has(i)) return i;
    }
    return null;
  };

  const addPin = (cat: CategorySearchItem) => {
    const pos = nextFreePosition();
    if (pos == null) return;
    const next = [
      ...sortedPins,
      { position: pos, id: cat.id, key: cat.key ?? undefined },
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

  const isFull = sortedPins.length >= limit;

  return (
    <Flex direction="column" gap={200}>
      <PositionStrip pins={sortedPins} limit={limit} display={display} />

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
          {intl.formatMessage(messages.categoryPinsEmpty, { limit })}
        </Box>
      ) : (
        <Flex direction="column" gap={150}>
          {sortedPins.map((pin) => {
            const d = display[pin.id];
            const t = tone(pin.id);
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

                <Flex
                  align="center"
                  justify="center"
                  width={32}
                  height={32}
                  borderRadius={150}
                  bg={t.bg}
                  flexShrink={0}
                >
                  <Icon name="Category" size={16} color={t.color} />
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
                    {d?.name ?? pin.key ?? pin.id}
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
                    {d?.breadcrumb ?? pin.id}
                  </Box>
                </Box>

                <IconButton
                  aria-label={intl.formatMessage(messages.categoryPinsRemove)}
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
          onPin={(cat) => {
            addPin(cat);
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
          borderStyle="dashed"
          opacity={isFull ? 0.5 : 1}
        >
          <Icon name="PushPin" size={14} color="primary.11" />
          {isFull
            ? 'All positions pinned'
            : intl.formatMessage(messages.categoryPinsAdd)}
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
        <Box as="span">{intl.formatMessage(messages.categoryPinsFooter)}</Box>
      </Flex>
    </Flex>
  );
};

export default CategoryPinsField;
