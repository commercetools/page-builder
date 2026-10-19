import type { ElementType } from 'react';
import { Icon as NimbusIcon } from '@commercetools/nimbus';
import * as Icons from '@commercetools/nimbus-icons';

type IconProps = {
  name: string;
  size?: number;
  color?: string;
};

// `name` is an export name from @commercetools/nimbus-icons (`MarkEmailRead`) — there
// is no name mapping. The lookup is by runtime string because the catalog supplies the
// name, so the whole barrel is bundled rather than imported icon by icon.
const icons = Icons as unknown as Record<string, ElementType | undefined>;

/** Every icon name Nimbus ships, for the icon picker to offer. */

/** Renders nothing when `name` is not a Nimbus icon. */
const Icon = ({ name, size = 16, color }: IconProps) => {
  const NamedIcon = icons[name];
  if (!NamedIcon) return null;

  return (
    <NimbusIcon
      as={NamedIcon}
      boxSize={`${size}px`}
      color={color}
      flexShrink={0}
    />
  );
};

export default Icon;
