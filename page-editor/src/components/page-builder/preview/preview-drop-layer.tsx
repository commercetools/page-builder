import { useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { Box } from '@commercetools/nimbus';
import type { Dropzone } from './preview-bridge';

type DropTarget = { section: string; layoutId: string | null; index: number };

type PreviewDropLayerProps = {
  dropzones: Dropzone[];
  /** True while a palette component is being dragged. */
  active: boolean;
  onDrop: (target: DropTarget) => void;
};

const centerDistance = (rect: Dropzone['rect'], x: number, y: number) =>
  Math.hypot(rect.left + rect.width / 2 - x, rect.top + rect.height / 2 - y);

/**
 * Phase-3 palette → render drop. Native HTML5 DnD can't cross the cross-origin
 * iframe boundary, so during a palette drag this builder-side layer covers the
 * iframe (pointer-events on), hit-tests the nearest host-reported dropzone to the
 * cursor, previews it, and commits the drop. Inert (unmounted) otherwise.
 */
const PreviewDropLayer = ({
  dropzones,
  active,
  onDrop,
}: PreviewDropLayerProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  if (!active) return null;

  const nearestIndex = (clientX: number, clientY: number): number | null => {
    const box = ref.current?.getBoundingClientRect();
    if (!box || dropzones.length === 0) return null;
    const x = clientX - box.left;
    const y = clientY - box.top;
    let best = 0;
    let bestDistance = Infinity;
    dropzones.forEach((dz, i) => {
      const d = centerDistance(dz.rect, x, y);
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    });
    return best;
  };

  const indicator = activeIdx != null ? dropzones[activeIdx] : undefined;

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setActiveIdx(nearestIndex(e.clientX, e.clientY));
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const idx = nearestIndex(e.clientX, e.clientY);
    if (idx != null && dropzones[idx]) {
      const { section, layoutId, index } = dropzones[idx];
      onDrop({ section, layoutId, index });
    }
    setActiveIdx(null);
  };

  return (
    <Box
      ref={ref}
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height="100%"
      pointerEvents="auto"
      onDragOver={handleDragOver}
      onDragLeave={() => setActiveIdx(null)}
      onDrop={handleDrop}
    >
      {indicator && (
        <Box
          position="absolute"
          top={`${indicator.rect.top}px`}
          left={`${indicator.rect.left}px`}
          width={`${indicator.rect.width}px`}
          height={`${indicator.rect.height}px`}
          border="solid-50"
          borderColor="primary.9"
          bg="primary.9"
          opacity={0.15}
          borderRadius={100}
          pointerEvents="none"
        />
      )}
    </Box>
  );
};

export default PreviewDropLayer;
