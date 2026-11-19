import { useCallback, useState } from 'react';
import { useIntl } from 'react-intl';
import { Box, DraggableList, Flex } from '@commercetools/nimbus';
import type { ComponentElement, LayoutElement } from '../types';
import Icon from '../shared/icon';
import { useLocalizedDisplay } from '../shared/locales';
import messages from '../messages';
import { WIDTH_SPAN } from './shared';
import ElementHeader from './element-header';
import ComponentBlock from './component-block';
import { DEVICE_ORDER } from './device-dot';

type LayoutBlockProps = {
  layout: LayoutElement;
  selected: boolean;
  selectedCompId: string | null;
  onSelectLayout: () => void;
  onSelectComp: (compId: string) => void;
  onDuplicateLayout: () => void;
  onDeleteLayout: () => void;
  onDuplicateComp: (compId: string) => void;
  onDeleteComp: (compId: string) => void;
  onCommentLayout?: () => void;
  onCommentComp?: (compId: string) => void;
  commentCounts?: Record<string, number>;
  onDropNewComp: (layoutId: string) => void;
  onUpdateComponents: (components: ComponentElement[]) => void;
  onLayoutDragStart: () => void;
  onLayoutDragOver: (e: React.DragEvent) => void;
  onLayoutDrop: () => void;
  draggedComponentType: string | null;
};

const LayoutBlock = ({
  layout,
  selected,
  selectedCompId,
  onSelectLayout,
  onSelectComp,
  onDuplicateLayout,
  onDeleteLayout,
  onDuplicateComp,
  onDeleteComp,
  onCommentLayout,
  onCommentComp,
  commentCounts,
  onDropNewComp,
  onUpdateComponents,
  onLayoutDragStart,
  onLayoutDragOver,
  onLayoutDrop,
  draggedComponentType,
}: LayoutBlockProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const [hover, setHover] = useState(false);
  const [dropZoneActive, setDropZoneActive] = useState(false);
  const intl = useIntl();
  const displayString = useLocalizedDisplay();

  const span = WIDTH_SPAN[layout.width] ?? 12;
  const devices = DEVICE_ORDER.map((d) => layout.visibility[d]);

  const isDraggingNewComp = draggedComponentType !== null;
  const containerDropActive = dropZoneActive && isDraggingNewComp;

  const getKey = useCallback((comp: ComponentElement) => comp.id, []);
  const headerBg = (compId: string) =>
    selectedCompId === compId ? 'primary.3' : hover ? 'neutral.2' : 'neutral.1';

  return (
    <Box
      draggable
      onDragStart={(e) => {
        e.stopPropagation();
        onLayoutDragStart();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const isCompDrag = Array.from(e.dataTransfer.types).includes(
          'nimbus-draggable-list-item'
        );
        if (!isDraggingNewComp && !isCompDrag) onLayoutDragOver(e);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const isCompDrag = Array.from(e.dataTransfer.types).includes(
          'nimbus-draggable-list-item'
        );
        if (!isDraggingNewComp && !isCompDrag) onLayoutDrop();
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      borderRadius={200}
      gridColumn={`span ${span}`}
      minWidth={0}
      border="solid-50"
      borderColor={selected ? 'primary.9' : '#e1e2ea'}
      overflow="hidden"
      bg="#fafafa"
      boxSizing="border-box"
    >
      <ElementHeader
        label={`${displayString(layout.name)} · ${layout.width}`}
        devices={devices}
        isSelected={selected}
        hover={hover}
        collapsible
        expanded={!collapsed}
        onSelect={onSelectLayout}
        onToggleExpand={() => setCollapsed(!collapsed)}
        onDuplicate={onDuplicateLayout}
        onDelete={onDeleteLayout}
        onComment={onCommentLayout}
        commentCount={commentCounts?.[layout.id]}
      />

      {!collapsed && (
        <Box
          onDragOver={(e) => {
            e.preventDefault();
            if (isDraggingNewComp) setDropZoneActive(true);
          }}
          onDragLeave={(e) => {
            if (
              !(e.currentTarget as HTMLElement).contains(
                e.relatedTarget as Node
              )
            ) {
              setDropZoneActive(false);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDropZoneActive(false);
            if (isDraggingNewComp) onDropNewComp(layout.id);
          }}
          p={250}
          bg={
            selected
              ? 'primary.2'
              : containerDropActive
              ? 'primary.2'
              : '#fafafa'
          }
          borderTop="solid-25"
          borderTopColor="neutral.6"
          transition="background 120ms"
          position="relative"
        >
          <Box onDragStart={(e) => e.stopPropagation()}>
            <DraggableList.Root
              items={layout.children}
              onUpdateItems={onUpdateComponents}
              getKey={getKey}
              aria-label={displayString(layout.name)}
              size="sm"
              width="full"
              // @ts-ignore — css prop not in DraggableList.Root typings
              css={{ '& .nimbus-draggable-list__empty': { width: '100%' } }}
              renderEmptyState={
                <Flex
                  align="center"
                  justify="center"
                  borderRadius={200}
                  p={500}
                  gap={150}
                  border="2px dashed"
                  borderColor={containerDropActive ? 'primary.9' : 'neutral.8'}
                  color="neutral.9"
                  fontSize={300}
                  textAlign="center"
                  bg="transparent"
                  width="full"
                >
                  <Icon name="AddCircleOutline" size={14} color="neutral.9" />
                  {intl.formatMessage(messages.layoutCanvasDropHere)}
                </Flex>
              }
            >
              {(comp) => (
                <DraggableList.Item
                  id={comp.id}
                  textValue={displayString(comp.name)}
                  onAction={() => onSelectComp(comp.id)}
                  bg={headerBg(comp.id)}
                  borderRadius={200}
                  border="solid-50"
                  borderColor={
                    selectedCompId === comp.id ? 'primary.9' : 'neutral.6'
                  }
                >
                  <ComponentBlock
                    comp={comp}
                    selected={selectedCompId === comp.id}
                    onDuplicate={() => onDuplicateComp(comp.id)}
                    onDelete={() => onDeleteComp(comp.id)}
                    onComment={() => onCommentComp?.(comp.id)}
                    commentCount={commentCounts?.[comp.id]}
                  />
                </DraggableList.Item>
              )}
            </DraggableList.Root>
          </Box>

          {isDraggingNewComp && (
            <Box
              position="absolute"
              top={0}
              left={0}
              right={0}
              bottom={0}
              zIndex={1}
              borderRadius={200}
              border="2px dashed"
              borderColor={dropZoneActive ? 'primary.9' : 'neutral.7'}
              bg={dropZoneActive ? 'primary.2' : 'transparent'}
              transition="all 120ms"
              onDragOver={(e) => {
                e.preventDefault();
                setDropZoneActive(true);
              }}
              onDragLeave={(e) => {
                if (
                  !(e.currentTarget as HTMLElement).contains(
                    e.relatedTarget as Node
                  )
                ) {
                  setDropZoneActive(false);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDropZoneActive(false);
                onDropNewComp(layout.id);
              }}
            />
          )}
        </Box>
      )}
    </Box>
  );
};

export default LayoutBlock;
