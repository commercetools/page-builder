import { useState, useRef, useEffect } from 'react';
import { useIntl } from 'react-intl';
import {
  Box,
  Flex,
  Button,
  IconButton,
  TextInput,
} from '@commercetools/nimbus';
import { useCategorySearch } from '../../../hooks/use-category-search';
import { useCategoriesByIds } from '../../../hooks/use-categories-by-ids';
import { useProjectLocales } from './locales';
import Icon from './icon';
import messages from '../messages';

type CategoryPickerProps = {
  value: string;
  valueKey?: string;
  onChange: (category: { id: string; key?: string } | null) => void;
  size?: 'sm' | 'md';
};

const TONE_PALETTE = [
  { bg: 'primary.2', color: 'primary.11' },
  { bg: 'positive.2', color: 'positive.11' },
  { bg: 'critical.2', color: 'critical.11' },
  { bg: 'neutral.4', color: 'neutral.11' },
  { bg: 'primary.3', color: 'primary.10' },
  { bg: 'positive.3', color: 'positive.10' },
] as const;

function tone(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONE_PALETTE[h % TONE_PALETTE.length];
}

const CategoryPicker = ({
  value,
  valueKey,
  onChange,
  size = 'sm',
}: CategoryPickerProps) => {
  const intl = useIntl();
  const { defaultLocale } = useProjectLocales();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { results, loading } = useCategorySearch(query, defaultLocale);
  const displayMap = useCategoriesByIds(value ? [value] : [], defaultLocale);
  const display = value ? displayMap[value] : undefined;

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (value) {
    const t = tone(value);
    return (
      <Flex
        align="center"
        gap={150}
        py={150}
        px={200}
        borderRadius={150}
        bg="neutral.3"
        border="solid-25"
        borderColor="neutral.6"
      >
        <Flex
          align="center"
          justify="center"
          width={24}
          height={24}
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
            {display?.name ?? valueKey ?? value}
          </Box>
          {display?.breadcrumb && (
            <Box
              as="span"
              display="block"
              fontSize={11}
              color="neutral.9"
              whiteSpace="nowrap"
              overflow="hidden"
              textOverflow="ellipsis"
            >
              {display.breadcrumb}
            </Box>
          )}
        </Box>
        <Button
          variant="ghost"
          size="2xs"
          onPress={() => {
            setQuery('');
            setOpen(true);
            onChange(null);
          }}
        >
          {intl.formatMessage(messages.productPickerChange)}
        </Button>
        <IconButton
          aria-label={intl.formatMessage(messages.productPickerClear)}
          variant="ghost"
          size="2xs"
          onPress={() => onChange(null)}
        >
          <Icon name="Close" size={13} color="neutral.9" />
        </IconButton>
      </Flex>
    );
  }

  return (
    <Box ref={containerRef} position="relative">
      <Flex
        align="center"
        gap={100}
        py={150}
        px={200}
        borderRadius={150}
        border="solid-25"
        borderColor={open ? 'primary.9' : 'neutral.6'}
        bg="neutral.1"
        cursor="text"
        onClick={() => setOpen(true)}
      >
        <Icon name="Search" size={14} color="neutral.9" />
        <TextInput
          variant="ghost"
          value={query}
          onChange={(v) => {
            setQuery(v);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={intl.formatMessage(messages.categoryPickerSearch)}
          size={size}
          flex={1}
          aria-label={intl.formatMessage(messages.categoryPickerSearch)}
        />
        {loading && (
          <Box as="span" fontSize={11} color="neutral.9">
            {intl.formatMessage(messages.productPickerLoading)}
          </Box>
        )}
      </Flex>

      {open && query.trim() && (
        <Box
          position="absolute"
          top="calc(100% + 4px)"
          left={0}
          right={0}
          zIndex={100}
          bg="neutral.1"
          border="solid-25"
          borderColor="neutral.6"
          borderRadius={150}
          boxShadow="3"
          maxHeight={220}
          overflow="auto"
        >
          {results.length === 0 && !loading && (
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
          {results.map((r) => {
            const t = tone(r.id);
            return (
              <Flex
                key={r.id}
                as="button"
                align="center"
                gap={200}
                width="full"
                textAlign="left"
                cursor="pointer"
                py={150}
                px={250}
                bg="transparent"
                border={0}
                borderBottom="solid-25"
                borderBottomColor="neutral.3"
                onClick={() => {
                  onChange({ id: r.id, key: r.key ?? undefined });
                  setQuery('');
                  setOpen(false);
                }}
                _hover={{ bg: 'neutral.3' }}
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
                    {r.name ?? r.key ?? r.id}
                  </Box>
                  {r.breadcrumb && (
                    <Box
                      as="span"
                      display="block"
                      fontSize={11}
                      color="neutral.9"
                      fontFamily="mono"
                    >
                      {r.breadcrumb}
                    </Box>
                  )}
                </Box>
              </Flex>
            );
          })}
        </Box>
      )}
    </Box>
  );
};

export default CategoryPicker;
