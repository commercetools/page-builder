import { useIntl } from 'react-intl';
import { Box, Flex, IconButton } from '@commercetools/nimbus';
import Icon from '../shared/icon';
import messages from '../messages';
import type { ElementRect } from './preview-bridge';

type PreviewOverlayProps = {
  rects: Record<string, ElementRect>;
  selectedId: string | null;
  hoveredId: string | null;
  onComment?: () => void;
  commentCount?: number;
  onDuplicate?: () => void;
  onDelete?: () => void;
};

const OutlineBox = ({
  rect,
  color,
  fill,
}: {
  rect: ElementRect;
  color: string;
  fill?: boolean;
}) => (
  <Box
    position="absolute"
    top={`${rect.top}px`}
    left={`${rect.left}px`}
    width={`${rect.width}px`}
    height={`${rect.height}px`}
    border="solid-50"
    borderColor={color}
    borderRadius={100}
    bg={fill ? color : 'transparent'}
    opacity={fill ? 0.08 : 1}
    pointerEvents="none"
  />
);

/**
 * Draws selection/hover outlines and the on-render action toolbar over the
 * iframe, from rects the host reports (viewport-relative to the iframe). The
 * overlay exactly covers the iframe box, so reported coordinates map directly.
 * The layer is non-interactive except for the toolbar.
 */
const PreviewOverlay = ({
  rects,
  selectedId,
  hoveredId,
  onComment,
  commentCount,
  onDuplicate,
  onDelete,
}: PreviewOverlayProps) => {
  const intl = useIntl();
  const hovered =
    hoveredId && hoveredId !== selectedId ? rects[hoveredId] : undefined;
  const selected = selectedId ? rects[selectedId] : undefined;

  return (
    <Box
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height="100%"
      overflow="hidden"
      pointerEvents="none"
    >
      {hovered && <OutlineBox rect={hovered} color="info.9" />}
      {selected && <OutlineBox rect={selected} color="primary.9" fill />}
      {selected && (onComment || onDuplicate || onDelete) && (
        <Flex
          position="absolute"
          top={`${selected.top}px`}
          left={`${selected.left + selected.width}px`}
          transform="translate(-100%, -100%)"
          align="center"
          gap={1}
          p={50}
          bg="neutral.1"
          border="solid-25"
          borderColor="neutral.6"
          borderRadius={150}
          shadow="2"
          pointerEvents="auto"
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
              aria-label={intl.formatMessage(messages.previewDuplicate)}
              variant="ghost"
              size="xs"
              onPress={onDuplicate}
              minWidth={'500'}
              height={'500'}
            >
              <Icon name="ContentCopy" size={13} color="neutral.11" />
            </IconButton>
          )}
          {onDelete && (
            <IconButton
              aria-label={intl.formatMessage(messages.previewDelete)}
              variant="ghost"
              size="xs"
              onPress={onDelete}
              minWidth={'500'}
              height={'500'}
            >
              <Icon name="DeleteOutline" size={13} color="critical.11" />
            </IconButton>
          )}
        </Flex>
      )}
    </Box>
  );
};

export default PreviewOverlay;
