import { useIntl } from 'react-intl';
import { Box, Flex, IconButton } from '@commercetools/nimbus';
import Icon from '../shared/icon';
import messages from '../messages';
import DeviceDot, { DEVICE_ORDER } from './device-dot';

type ElementContentProps = {
  label: string;
  devices: boolean[];
  isSelected: boolean;
  hover: boolean;
  onDuplicate?: () => void;
  onDelete: () => void;
  onComment?: () => void;
  commentCount?: number;
};

const ElementContent = ({
  label,
  devices,
  isSelected,
  hover,
  onDuplicate,
  onDelete,
  onComment,
  commentCount,
}: ElementContentProps) => {
  const intl = useIntl();
  const fg = isSelected ? 'primary.11' : 'neutral.12';

  return (
    <Flex align="center" gap={150} flex={1}>
      <Box
        as="span"
        flex={1}
        fontSize={11}
        fontWeight={600}
        color={fg}
        whiteSpace="nowrap"
        overflow="hidden"
        textOverflow="ellipsis"
        letterSpacing="0.02em"
      >
        {label}
      </Box>
      <Flex as="span" align="center" mr={100} gap={3}>
        {devices.map((show, i) => (
          <DeviceDot key={DEVICE_ORDER[i]} show={show} />
        ))}
      </Flex>
      <Flex
        as="span"
        align="center"
        onClick={(e) => e.stopPropagation()}
        gap={1}
        opacity={hover || isSelected ? 1 : 0}
        pointerEvents={hover || isSelected ? 'auto' : 'none'}
        transition="opacity 120ms"
      >
        {onComment && (
          <IconButton
            aria-label="Comment on this element"
            variant="ghost"
            size="xs"
            onPress={onComment}
            minWidth={'500'}
            height={'500'}
            position="relative"
          >
            <Icon
              name="ChatBubbleOutline"
              size={13}
              color={commentCount ? 'primary.11' : 'neutral.11'}
            />
            {!!commentCount && (
              <Box
                as="span"
                position="absolute"
                top={4}
                right={4}
                width={6}
                height={6}
                borderRadius="full"
                bg="primary.9"
              />
            )}
          </IconButton>
        )}
        {onDuplicate && (
          <IconButton
            aria-label={intl.formatMessage(
              messages.layoutCanvasDuplicateLayoutElement
            )}
            variant="ghost"
            size="xs"
            onPress={onDuplicate}
            minWidth={'500'}
            height={'500'}
          >
            <Icon name="ContentCopy" size={13} color="neutral.11" />
          </IconButton>
        )}
        <IconButton
          aria-label={intl.formatMessage(
            messages.layoutCanvasDeleteLayoutElement
          )}
          variant="ghost"
          size="xs"
          onPress={onDelete}
          minWidth={'500'}
          height={'500'}
        >
          <Icon name="DeleteOutline" size={13} color="critical.11" />
        </IconButton>
      </Flex>
    </Flex>
  );
};

export default ElementContent;
