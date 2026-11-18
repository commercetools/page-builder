import { useState } from 'react';
import { Box } from '@commercetools/nimbus';
import type { ComponentElement } from '../types';
import { useLocalizedDisplay } from '../shared/locales';
import ElementContent from './element-content';
import { DEVICE_ORDER } from './device-dot';

type ComponentBlockProps = {
  comp: ComponentElement;
  selected: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
  onComment?: () => void;
  commentCount?: number;
};

const ComponentBlock = ({
  comp,
  selected,
  onDuplicate,
  onDelete,
  onComment,
  commentCount,
}: ComponentBlockProps) => {
  const [hover, setHover] = useState(false);
  const displayString = useLocalizedDisplay();
  const devices = DEVICE_ORDER.map((d) => comp.visibility[d]);
  return (
    <Box
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      transition="background 120ms"
      my={100}
      mx={150}
    >
      <ElementContent
        label={displayString(comp.name)}
        devices={devices}
        isSelected={selected}
        hover={hover}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        onComment={onComment}
        commentCount={commentCount}
      />
    </Box>
  );
};

export default ComponentBlock;
