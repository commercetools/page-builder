import { Badge } from '@commercetools/nimbus';

type StateTagProps = { state?: string };

const StateTag = ({ state }: StateTagProps) => {
  if (!state) return null;
  const colorPalette = state === 'published' ? 'positive' : 'warning';
  return (
    <Badge
      colorPalette={colorPalette}
      size="2xs"
      textTransform="capitalize"
      height={500}
      fontSize={250}
      borderRadius={250}
    >
      {state}
    </Badge>
  );
};

export default StateTag;
