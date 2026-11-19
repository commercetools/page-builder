import { Box, Flex } from '@commercetools/nimbus';
import type { ComponentType } from '../types';
import Icon from './icon';

/** A draggable palette tile representing one component type in the left pane. */
export function ComponentCard({
  comp,
  displayString,
  onDragStart,
}: {
  comp: ComponentType;
  displayString: (v: ComponentType['name']) => string;
  onDragStart: (type: string) => void;
}) {
  return (
    <Flex
      draggable
      onDragStart={() => onDragStart(comp.type)}
      direction="column"
      align="center"
      gap={150}
      py={250}
      px={200}
      borderRadius={200}
      border="solid-25"
      borderColor="neutral.6"
      bg="neutral.1"
      cursor="grab"
      userSelect="none"
      textAlign="center"
      _hover={{
        borderColor: 'var(--nimbus-colors-primary-8)',
        background: 'var(--nimbus-colors-primary-4)',
      }}
    >
      <Flex
        align="center"
        justify="center"
        borderRadius={200}
        width={36}
        height={36}
        bg="primary.2"
      >
        <Icon name={comp.icon} size={20} color="primary.10" />
      </Flex>
      <Box as="span" fontSize={11} color="neutral.12" lineHeight={1.2}>
        {displayString(comp.name)}
      </Box>
    </Flex>
  );
}
