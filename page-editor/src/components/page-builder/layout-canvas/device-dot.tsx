import { Box } from '@commercetools/nimbus';

/**
 * Canonical order of the visibility dots. Callers build their `devices` boolean
 * array from this, and `ElementContent` keys each dot by the matching name, so
 * the position/device contract lives in one place instead of three.
 */
export const DEVICE_ORDER = ['mobile', 'tablet', 'desktop'] as const;

const DeviceDot = ({ show }: { show: boolean }) => (
  <Box
    as="span"
    borderRadius="full"
    width={5}
    height={5}
    bg={show ? 'positive.9' : 'neutral.6'}
    display="inline-block"
  />
);

export default DeviceDot;
