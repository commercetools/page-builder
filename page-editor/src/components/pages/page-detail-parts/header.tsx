import { useIntl } from 'react-intl';
import Icon from '../../page-builder/shared/icon';
import messages from '../messages';
import {
  Box,
  Button,
  Flex,
  Heading,
  ToggleButtonGroup,
} from '@commercetools/nimbus';
import type { PageNode } from '../../page-builder/types';
import StateTag from '../state-tag';

type View = 'plp' | 'pdp';

type Props = {
  node: PageNode;
  view: View;
  setView: (v: View) => void;
  isCategory: boolean;
  headerTypeLabel: string;
  headerVersion: number | null;
  headerState: string | null;
  headerLastSaved: string | null;
  builderState: 'published' | 'draft' | null;
  pdpOverrideState: 'published' | 'draft' | null;
  ctaLabel: string;
  handleCta: () => void;
  openBuilderDisabled: boolean;
  formatDate: (iso: string) => string;
};

/** Title, state, last-saved and the PLP/PDP switcher. */
export const PageDetailHeader = ({
  node,
  view,
  setView,
  isCategory,
  headerTypeLabel,
  headerVersion,
  headerState,
  headerLastSaved,
  builderState,
  pdpOverrideState,
  ctaLabel,
  handleCta,
  openBuilderDisabled,
  formatDate,
}: Props) => {
  const intl = useIntl();
  return (
    <Box
      padding="22px 28px 16px"
      borderBottom="solid-25"
      borderBottomColor="neutral.6"
    >
      <Flex
        align="center"
        gap={4}
        fontSize={12}
        color="neutral.9"
        marginBottom={10}
      >
        <Box as="span">{intl.formatMessage(messages.breadcrumbPages)}</Box>
        <Icon name="ChevronRight" size={14} color="neutral.9" />
        <Box as="span">{node.title}</Box>
      </Flex>

      <Flex align="flex-start" gap={14}>
        <Flex
          align="center"
          justify="center"
          width={42}
          height={42}
          borderRadius={10}
          bg="primary.2"
          flexShrink={0}
        >
          <Icon
            name={
              node.icon ??
              (node.type === 'category' ? 'category' : 'description')
            }
            size={22}
            color="primary.10"
          />
        </Flex>
        <Box flex={1} minWidth={0}>
          <Heading size="lg">{node.title}</Heading>
          <Flex
            align="center"
            gap={8}
            marginTop={4}
            fontSize="12.5px"
            color="neutral.9"
            flexWrap="wrap"
          >
            <Box as="span">{headerTypeLabel}</Box>
            {headerVersion !== null && (
              <>
                <Box as="span">·</Box>
                <Box as="span" fontFamily="mono">
                  v{headerVersion}
                </Box>
              </>
            )}
            {headerState && (
              <>
                <Box as="span">·</Box>
                <StateTag state={headerState} />
              </>
            )}
            {headerLastSaved && (
              <>
                <Box as="span">·</Box>
                <Box as="span">
                  {intl.formatMessage(messages.lastSaved, {
                    date: formatDate(headerLastSaved),
                  })}
                </Box>
              </>
            )}
          </Flex>
        </Box>
        <Flex gap={8} flexShrink={0}>
          <Button variant="outline" size="xs" bg="neutral.1" onPress={() => {}}>
            <Icon name="Visibility" size={14} color="neutral.11" />
            {intl.formatMessage(messages.preview)}
          </Button>
          <Button
            variant="solid"
            colorPalette="primary"
            size="xs"
            isDisabled={openBuilderDisabled}
            onPress={handleCta}
          >
            <Icon name="Edit" size={14} color="neutral.1" />
            {ctaLabel}
          </Button>
        </Flex>
      </Flex>

      {/* Segmented control — categories only */}
      {isCategory && (
        <ToggleButtonGroup.Root
          selectedKeys={new Set([view])}
          onSelectionChange={(keys) => {
            const k = Array.from(keys)[0] as View;
            if (k) setView(k);
          }}
          disallowEmptySelection
          aria-label="Page view"
          display="inline-flex"
          bg="neutral.3"
          borderRadius={8}
          padding="3px"
          border="solid-25"
          borderColor="neutral.6"
          marginTop={16}
          gap={0}
        >
          {(
            [
              {
                key: 'plp' as View,
                icon: 'Category',
                label: intl.formatMessage(messages.viewCategoryPage),
                sub:
                  builderState !== null
                    ? intl.formatMessage(messages.viewSubDedicated)
                    : intl.formatMessage(messages.viewSubFallback),
              },
              {
                key: 'pdp' as View,
                icon: 'ShoppingBag',
                label: intl.formatMessage(messages.viewProductDetailPage),
                sub:
                  pdpOverrideState !== null
                    ? intl.formatMessage(messages.viewSubOverride)
                    : intl.formatMessage(messages.viewSubInheritsGlobal),
              },
            ] as { key: View; icon: string; label: string; sub: string }[]
          ).map((seg) => {
            const active = view === seg.key;
            return (
              <ToggleButtonGroup.Button
                key={seg.key}
                id={seg.key}
                height="36px"
                paddingLeft="14px"
                paddingRight="14px"
                paddingTop="0"
                paddingBottom="0"
                borderRadius={6}
                fontSize={13}
                fontWeight={500}
                gap={8}
                bg={active ? 'neutral.1' : 'transparent'}
                color={active ? 'primary.11' : 'neutral.10'}
                shadow={active ? '1' : 'none'}
                border="none"
              >
                <Icon
                  name={seg.icon}
                  size={16}
                  color={active ? 'primary.10' : 'neutral.9'}
                />
                <Flex direction="column" align="flex-start">
                  <Box as="span" lineHeight={1.2}>
                    {seg.label}
                  </Box>
                  <Box
                    as="span"
                    fontSize="10.5px"
                    fontWeight={400}
                    lineHeight={1.2}
                  >
                    {seg.sub}
                  </Box>
                </Flex>
              </ToggleButtonGroup.Button>
            );
          })}
        </ToggleButtonGroup.Root>
      )}
    </Box>
  );
};
