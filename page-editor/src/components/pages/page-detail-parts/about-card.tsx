import { useIntl } from 'react-intl';
import Icon from '../../page-builder/shared/icon';
import messages from '../messages';
import { Box, Card, Flex, Link, Text } from '@commercetools/nimbus';
import type { PageNode } from '../../page-builder/types';

type Props = {
  node: PageNode;
  view: 'plp' | 'pdp';
  isCategory: boolean;
  slug?: string;
  projectKey: string;
  languagesLabel: string;
  plpTypeLabel: string;
  lastSavedAt: string | null;
  pdpOverrideState: 'published' | 'draft' | null;
  formatDate: (iso: string) => string;
};

/** Slug, languages, type and last-saved summary. */
export const PageDetailAboutCard = ({
  node,
  view,
  isCategory,
  slug,
  projectKey,
  languagesLabel,
  plpTypeLabel,
  lastSavedAt,
  pdpOverrideState,
  formatDate,
}: Props) => {
  const intl = useIntl();
  return (
    <Card.Root variant="outlined">
      <Card.Header>
        <Text fontWeight={600} textStyle="sm" textTransform="uppercase">
          {isCategory && view === 'pdp'
            ? intl.formatMessage(messages.aboutThisPdp)
            : intl.formatMessage(messages.aboutThisPage)}
        </Text>
      </Card.Header>
      <Card.Body>
        {[
          {
            label: intl.formatMessage(messages.aboutSlugLabel),
            value:
              isCategory && view === 'pdp' ? (
                <Box as="span" fontFamily="mono" fontSize="11.5px">
                  /{node.id.replace(/^cat-/, 'categories/')}/
                  <Box as="span" color="neutral.9">
                    {'{product-slug}'}
                  </Box>
                </Box>
              ) : (
                slug
              ),
          },
          {
            label: intl.formatMessage(messages.aboutTypeLabel),
            value:
              isCategory && view === 'pdp'
                ? pdpOverrideState !== null
                  ? intl.formatMessage(messages.pdpTypeCategoryOverride)
                  : intl.formatMessage(messages.pdpTypeGlobalTemplate)
                : plpTypeLabel,
          },
          ...(isCategory
            ? [
                {
                  label: intl.formatMessage(messages.aboutCategoryLabel),
                  value: (
                    <Link
                      href={`${window.location.origin}/${projectKey}/categories/${node.id}/general`}
                      target="_blank"
                      size="sm"
                      fontColor="inherit"
                      textDecoration="none"
                    >
                      <Flex
                        as="span"
                        align="center"
                        gap={6}
                        display="inline-flex"
                        padding="2px 8px"
                        borderRadius={6}
                        bg="neutral.3"
                        fontSize="11.5px"
                      >
                        <Icon name="Category" size={12} color="neutral.9" />
                        {node.title}
                      </Flex>
                    </Link>
                  ),
                },
              ]
            : []),
          ...(isCategory && view === 'pdp'
            ? [
                {
                  label: 'Applies to',
                  value: (
                    <>
                      All products in <strong>{node.title}</strong>
                      {pdpOverrideState === null && ' (via global default)'}
                    </>
                  ),
                },
              ]
            : []),
          {
            label: intl.formatMessage(messages.aboutMarketsLabel),
            value: intl.formatMessage(messages.aboutMarketsValue),
          },
          {
            label: intl.formatMessage(messages.aboutLanguagesLabel),
            value: languagesLabel,
          },
          {
            label: intl.formatMessage(messages.aboutLastEditedLabel),
            value: lastSavedAt ? formatDate(lastSavedAt) : '—',
          },
        ].map(({ label, value }) => (
          <Box
            key={label}
            display="grid"
            gridTemplateColumns="140px 1fr"
            gap={12}
            padding="6px 0"
            fontSize="12.5px"
            alignItems="center"
          >
            <Box as="span" color="neutral.9">
              {label}
            </Box>
            <Box as="span" color="neutral.12">
              {value}
            </Box>
          </Box>
        ))}
      </Card.Body>
    </Card.Root>
  );
};
