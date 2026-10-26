import { useState, useRef, useEffect } from 'react';
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
import { useProductsByIds } from '../../../hooks/use-products-by-ids';
import { useProjectLocales } from './locales';
import Icon from './icon';
import messages from '../messages';

type ProductPickerProps = {
  value: string;
  valueSku?: string;
  onChange: (
    product: { id: string; key?: string; sku?: string } | null
  ) => void;
  size?: 'sm' | 'md';
};

const ProductPicker = ({
  value,
  valueSku,
  onChange,
  size = 'sm',
}: ProductPickerProps) => {
  const intl = useIntl();
  const { defaultLocale } = useProjectLocales();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { results, loading } = useProductSearch(query, defaultLocale);
  const displayMap = useProductsByIds(value ? [value] : [], defaultLocale);

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
        {display?.imageUrl ? (
          <Image
            src={display.imageUrl}
            alt={display.name ?? ''}
            fit="cover"
            width={28}
            height={28}
            borderRadius={100}
            flexShrink={0}
          />
        ) : (
          <Icon name="ShoppingBag" size={14} color="primary.10" />
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
            {display?.name ?? valueSku ?? value}
          </Box>
          {valueSku && (
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
              {valueSku}
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
          placeholder={intl.formatMessage(messages.productPickerSearch)}
          size={size}
          flex={1}
          aria-label={intl.formatMessage(messages.productPickerSearch)}
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
              {intl.formatMessage(messages.productPickerNoResults)}
            </Box>
          )}
          {results.map((r) => (
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
                onChange({
                  id: r.id,
                  key: r.key ?? undefined,
                  sku: r.sku ?? undefined,
                });
                setQuery('');
                setOpen(false);
              }}
              _hover={{ bg: 'neutral.3' }}
              _last={{ borderBottom: 'none' }}
            >
              {r.imageUrl ? (
                <Image
                  src={r.imageUrl}
                  alt={r.name ?? ''}
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
                  {r.name ?? r.id}
                </Box>
                {r.sku && (
                  <Box
                    as="span"
                    display="block"
                    fontSize={11}
                    color="neutral.9"
                    fontFamily="mono"
                  >
                    {r.sku}
                  </Box>
                )}
              </Box>
            </Flex>
          ))}
        </Box>
      )}
    </Box>
  );
};

export default ProductPicker;
