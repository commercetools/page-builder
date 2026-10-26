import { Flex } from '@commercetools/nimbus';
import Icon from '../shared/icon';
import ElementContent from './element-content';

type ElementHeaderProps = {
  label: string;
  devices: boolean[];
  isSelected: boolean;
  hover: boolean;
  collapsible?: boolean;
  expanded?: boolean;
  onSelect?: () => void;
  onToggleExpand?: () => void;
  onDuplicate?: () => void;
  onDelete: () => void;
  onComment?: () => void;
  commentCount?: number;
};

const ElementHeader = ({
  label,
  devices,
  isSelected,
  hover,
  collapsible,
  expanded,
  onSelect,
  onToggleExpand,
  onDuplicate,
  onDelete,
  onComment,
  commentCount,
}: ElementHeaderProps) => {
  const headerBg = isSelected ? 'primary.3' : hover ? 'neutral.2' : 'neutral.1';

  return (
    <Flex
      align="center"
      gap={150}
      py={100}
      px={150}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.();
      }}
      bg={headerBg}
      transition="background 120ms"
      cursor={onSelect ? 'pointer' : 'default'}
      userSelect="none"
    >
      <Flex
        as="span"
        align="center"
        justify="center"
        width={18}
        height={18}
        color="neutral.9"
        cursor="grab"
        flexShrink={0}
      >
        <Icon name="DragIndicator" size={14} color="neutral.9" />
      </Flex>
      {collapsible && (
        <Flex
          as="span"
          align="center"
          justify="center"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand?.();
          }}
          borderRadius={100}
          width={18}
          height={18}
          flexShrink={0}
          transition="transform 120ms"
          transform={expanded ? 'none' : 'rotate(-90deg)'}
          cursor="pointer"
        >
          <Icon name="ExpandMore" size={14} color="neutral.9" />
        </Flex>
      )}
      <ElementContent
        label={label}
        devices={devices}
        isSelected={isSelected}
        hover={hover}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        onComment={onComment}
        commentCount={commentCount}
      />
    </Flex>
  );
};

export default ElementHeader;
