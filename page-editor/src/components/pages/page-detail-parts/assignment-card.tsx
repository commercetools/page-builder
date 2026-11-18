import { useIntl } from 'react-intl';
import Icon from '../../page-builder/shared/icon';
import messages from '../messages';
import { Box, Button, Card, Flex, Text } from '@commercetools/nimbus';
import type { PageNode } from '../../page-builder/types';
import { findPageById } from '../../page-builder/page-tree';
import StateTag from '../state-tag';
import { useHistory } from 'react-router-dom';

type Props = {
  node: PageNode;
  view: 'plp' | 'pdp';
  isCategory: boolean;
  basePath: string;
  pageTree: PageNode[];
  onSelectPage: (n: PageNode) => void;
  builderState: 'published' | 'draft' | null;
  appVersion: number | null;
  publishedAt: string | null;
  unpublishedCount: number;
  pdpOverrideState: 'published' | 'draft' | null;
  pdpOverrideVersion: number | null;
  pdpOverridePublishedAt: string | null;
  pdpOverrideUnpublishedCount: number;
  globalPdpVersion: number | null;
  canDelete: boolean;
  setCreateDialogOpen: (open: boolean) => void;
  setPdpDialogOpen: (open: boolean) => void;
  setDeleteOpen: (open: boolean) => void;
  setDeleteError: (err: string | null) => void;
  PDP_FALLBACK_ID: string;
  formatDate: (iso: string) => string;
};

/** Which page object serves this node, and the actions to change that. */
export const PageDetailAssignmentCard = ({
  node,
  view,
  isCategory,
  basePath,
  pageTree,
  onSelectPage,
  builderState,
  appVersion,
  publishedAt,
  unpublishedCount,
  pdpOverrideState,
  pdpOverrideVersion,
  pdpOverridePublishedAt,
  pdpOverrideUnpublishedCount,
  globalPdpVersion,
  canDelete,
  setCreateDialogOpen,
  setPdpDialogOpen,
  setDeleteOpen,
  setDeleteError,
  PDP_FALLBACK_ID,
  formatDate,
}: Props) => {
  const intl = useIntl();
  const history = useHistory();
  return (
    <Card.Root variant="outlined">
      <Card.Header>
        <Flex align="center" justify="space-between" gap={8}>
          <Text fontWeight={600} textStyle="sm" textTransform="uppercase">
            {isCategory && view === 'pdp'
              ? intl.formatMessage(messages.pdpAssignment)
              : intl.formatMessage(messages.pageAssignment)}
          </Text>
          {canDelete && (
            <Button
              variant="outline"
              size="xs"
              colorPalette="critical"
              onPress={() => {
                setDeleteError(null);
                setDeleteOpen(true);
              }}
            >
              <Icon name="Delete" size={14} color="critical.11" />
              {intl.formatMessage(messages.deletePageButton)}
            </Button>
          )}
        </Flex>
      </Card.Header>
      <Card.Body>
        {isCategory && view === 'pdp' ? (
          pdpOverrideState === null ? (
            /* Inherited global PDP */
            <Box
              border="1px dashed"
              borderColor="neutral.8"
              borderRadius={8}
              padding="14px 16px"
              bg="neutral.3"
            >
              <Flex align="center" gap={8} marginBottom={6}>
                <Icon name="Link" size={16} color="primary.10" />
                <Box as="strong" fontSize={13} color="neutral.12">
                  {intl.formatMessage(messages.inheritedGlobalPdpTitle)}
                </Box>
              </Flex>
              <Box
                as="p"
                fontSize="12.5px"
                color="neutral.11"
                lineHeight={1.5}
                marginBottom={10}
              >
                {intl.formatMessage(messages.inheritedGlobalPdpDescription, {
                  category: <strong>{node.title}</strong>,
                })}
                {globalPdpVersion !== null && (
                  <>
                    {' '}
                    <Box as="span" fontFamily="mono" fontSize="11px">
                      (v{globalPdpVersion})
                    </Box>
                  </>
                )}
              </Box>
              <Flex gap={8}>
                <Button
                  variant="solid"
                  colorPalette="primary"
                  size="xs"
                  onPress={() => setPdpDialogOpen(true)}
                >
                  <Icon name="Add" size={14} color="neutral.1" />
                  {intl.formatMessage(messages.createOverride)}
                </Button>
                <Button
                  variant="outline"
                  size="xs"
                  onPress={() =>
                    history.push(`${basePath}/builder/${PDP_FALLBACK_ID}`)
                  }
                >
                  {intl.formatMessage(messages.editGlobalPdp)}
                </Button>
              </Flex>
            </Box>
          ) : (
            /* PDP override exists */
            <>
              {[
                {
                  label: intl.formatMessage(messages.assignmentStatusLabel),
                  value: <StateTag state={pdpOverrideState} />,
                },
                {
                  label: intl.formatMessage(messages.assignmentVersionLabel),
                  value:
                    pdpOverrideVersion !== null
                      ? `v${pdpOverrideVersion}`
                      : '—',
                },
                {
                  label: intl.formatMessage(messages.assignmentPublishedLabel),
                  value: pdpOverridePublishedAt
                    ? formatDate(pdpOverridePublishedAt)
                    : '—',
                },
                {
                  label: intl.formatMessage(messages.assignmentDraftsLabel),
                  value:
                    pdpOverrideUnpublishedCount > 0
                      ? intl.formatMessage(
                          messages.assignmentUnpublishedChanges,
                          { count: pdpOverrideUnpublishedCount }
                        )
                      : intl.formatMessage(messages.assignmentUpToDate),
                },
                {
                  label: intl.formatMessage(messages.assignmentSourceLabel),
                  value: (
                    <Flex
                      as="span"
                      align="center"
                      gap={4}
                      display="inline-flex"
                      padding="1px 8px"
                      borderRadius={100}
                      bg="primary.2"
                      color="primary.11"
                      fontSize="11.5px"
                      fontWeight={500}
                    >
                      <Icon name="ForkRight" size={12} color="primary.10" />
                      {intl.formatMessage(messages.forkedFromGlobalPdp)}
                    </Flex>
                  ),
                },
              ].map(({ label, value }) => (
                <Flex key={label} gap={8} marginBottom={8}>
                  <Box
                    as="span"
                    width={2400}
                    fontSize={12}
                    color="neutral.9"
                    flexShrink={0}
                  >
                    {label}
                  </Box>
                  <Box as="span" color="neutral.12" fontSize={12}>
                    {value}
                  </Box>
                </Flex>
              ))}
            </>
          )
        ) : /* PLP view */ builderState ? (
          <>
            {[
              {
                label: intl.formatMessage(messages.assignmentStatusLabel),
                value: <StateTag state={builderState} />,
              },
              {
                label: intl.formatMessage(messages.assignmentVersionLabel),
                value: appVersion !== null ? `v${appVersion}` : '—',
              },
              {
                label: intl.formatMessage(messages.assignmentPublishedLabel),
                value: publishedAt ? formatDate(publishedAt) : '—',
              },
              {
                label: intl.formatMessage(messages.assignmentDraftsLabel),
                value:
                  unpublishedCount > 0
                    ? intl.formatMessage(
                        messages.assignmentUnpublishedChanges,
                        { count: unpublishedCount }
                      )
                    : intl.formatMessage(messages.assignmentUpToDate),
              },
            ].map(({ label, value }) => (
              <Flex key={label} gap={8} marginBottom={8}>
                <Box
                  as="span"
                  width={2400}
                  fontSize={12}
                  color="neutral.9"
                  flexShrink={0}
                >
                  {label}
                </Box>
                <Box as="span" color="neutral.12" fontSize={12}>
                  {value}
                </Box>
              </Flex>
            ))}
          </>
        ) : node.type === 'category' && builderState === null ? (
          <Box
            border="1px dashed"
            borderColor="neutral.8"
            borderRadius={8}
            padding="14px 16px"
            bg="neutral.3"
          >
            <Flex align="center" gap={8} marginBottom={6}>
              <Icon name="Warning" size={16} color="#8a6a12" />
              <Box as="strong" fontSize={13} color="neutral.12">
                {intl.formatMessage(messages.noDedicatedPage)}
              </Box>
            </Flex>
            <Box
              as="p"
              fontSize="12.5px"
              color="neutral.11"
              lineHeight={1.5}
              marginBottom={10}
            >
              This category falls back to <Box as="strong">All categories</Box>.
              Create a dedicated page to give it a custom layout, hero or
              recommendations.
            </Box>
            <Flex gap={8}>
              <Button
                variant="solid"
                colorPalette="primary"
                size="xs"
                onPress={() => setCreateDialogOpen(true)}
              >
                <Icon name="Add" size={14} color="neutral.1" />
                {intl.formatMessage(messages.createDedicatedPage)}
              </Button>
              <Button
                variant="outline"
                size="xs"
                onPress={() => {
                  const fallback = findPageById(pageTree, 'cat-root');
                  if (fallback) onSelectPage(fallback);
                }}
              >
                {intl.formatMessage(messages.editFallback)}
              </Button>
            </Flex>
          </Box>
        ) : null}
      </Card.Body>
    </Card.Root>
  );
};
