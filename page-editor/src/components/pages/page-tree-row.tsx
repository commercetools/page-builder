import { useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { Box, Button, Flex } from '@commercetools/nimbus';
import type { PageNode } from '../page-builder/types';
import Icon from '../page-builder/shared/icon';
import StateTag from './state-tag';
import messages from './messages';

export function filterTree(nodes: PageNode[], query: string): PageNode[] {
  if (!query) return nodes;
  const q = query.toLowerCase();
  return nodes.flatMap((node) => {
    const childMatches = node.children ? filterTree(node.children, query) : [];
    if (node.title.toLowerCase().includes(q)) {
      return [{ ...node, children: node.children }];
    }
    if (childMatches.length > 0) {
      return [{ ...node, children: childMatches }];
    }
    return [];
  });
}

type PageTreeRowProps = {
  node: PageNode;
  selectedId: string | undefined;
  onSelect: (n: PageNode) => void;
  builtPageStates: Map<string, 'draft' | 'published'>;
  depth?: number;
  forceExpand?: boolean;
  /** Ids on the path to the selected node — forces those ancestors open. */
  openIds?: Set<string>;
};

const PageTreeRow = ({
  node,
  selectedId,
  onSelect,
  builtPageStates,
  depth = 0,
  forceExpand = false,
  openIds,
}: PageTreeRowProps) => {
  const intl = useIntl();
  const hasChildren = node.children && node.children.length > 0;
  const [expanded, setExpanded] = useState(depth < 1);
  const isExpanded =
    forceExpand || expanded || (openIds?.has(node.id) ?? false);
  const isSelected = selectedId === node.id;
  const isCategory = node.type === 'category' || node.id === 'cat-root';
  const iconName =
    node.icon ??
    (node.type === 'category'
      ? 'category'
      : node.type === 'template'
      ? 'description'
      : node.type === 'dynamic'
      ? 'dynamic_form'
      : 'insert_drive_file');

  // Scroll the selected row into view (e.g. when deep-linked via ?node=<id>).
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isSelected) rowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [isSelected]);

  // Category assignment badge: PLP (page-<id>), PDP (page-pdp-<id>), or both (All).
  const hasPlp = builtPageStates.has(node.id);
  const hasPdp = builtPageStates.has(`pdp-${node.id}`);
  const assignmentLabel =
    hasPlp && hasPdp
      ? intl.formatMessage(messages.pageTreeAllBadge)
      : hasPlp
      ? intl.formatMessage(messages.pageTreePlpBadge)
      : hasPdp
      ? intl.formatMessage(messages.pageTreePdpBadge)
      : null;
  // Combined state: published only when every present assignment is published.
  const presentStates = [
    hasPlp ? builtPageStates.get(node.id) : undefined,
    hasPdp ? builtPageStates.get(`pdp-${node.id}`) : undefined,
  ].filter(Boolean) as ('draft' | 'published')[];
  const combinedState =
    presentStates.length === 0
      ? undefined
      : presentStates.every((s) => s === 'published')
      ? 'published'
      : 'draft';

  return (
    <>
      <Flex
        ref={rowRef}
        align="center"
        onClick={() =>
          node.type === 'folder' ? setExpanded((v) => !v) : onSelect(node)
        }
        gap={6}
        padding="6px 10px"
        paddingLeft={10 + depth * 16}
        cursor="pointer"
        borderRadius={6}
        bg={isSelected ? 'primary.3' : 'transparent'}
        margin="1px 0"
      >
        {hasChildren ? (
          <Button
            onPress={() => setExpanded((v) => !v)}
            onClick={(e) => e.stopPropagation()}
            variant="ghost"
            size="xs"
            padding={0}
            minWidth={0}
            height={400}
          >
            <Icon
              name={isExpanded ? 'ExpandMore' : 'ChevronRight'}
              size={16}
              color="neutral.9"
            />
          </Button>
        ) : (
          <Box width={16} flexShrink={0} />
        )}
        <Icon
          name={iconName}
          size={15}
          color={isSelected ? 'primary.10' : 'neutral.11'}
        />
        <Box
          as="span"
          flex={1}
          fontSize={13}
          color={isSelected ? 'primary.11' : 'neutral.12'}
          fontWeight={isSelected ? 500 : 400}
        >
          {node.title}
        </Box>
        {isCategory ? (
          assignmentLabel ? (
            <Flex
              align="center"
              as="span"
              gap={3}
              fontSize="10.5px"
              fontWeight={500}
              padding="1px 6px 1px 4px"
              borderRadius={999}
              bg="primary.3"
              color="primary.11"
            >
              <Icon name="Link" size={11} color="primary.11" />
              {assignmentLabel}
            </Flex>
          ) : (
            <Box
              as="span"
              fontSize="10.5px"
              fontStyle="italic"
              color="neutral.9"
            >
              {intl.formatMessage(messages.pageTreeFallbackBadge)}
            </Box>
          )
        ) : null}
        <StateTag
          state={isCategory ? combinedState : builtPageStates.get(node.id)}
        />
      </Flex>
      {hasChildren &&
        isExpanded &&
        node.children!.map((child) => (
          <PageTreeRow
            key={child.id}
            node={child}
            selectedId={selectedId}
            onSelect={onSelect}
            builtPageStates={builtPageStates}
            depth={depth + 1}
            forceExpand={forceExpand}
            openIds={openIds}
          />
        ))}
    </>
  );
};

export default PageTreeRow;
