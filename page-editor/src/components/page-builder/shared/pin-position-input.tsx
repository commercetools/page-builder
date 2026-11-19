import { useCallback, useEffect, useRef, useState } from 'react';
import { NumberInput } from '@commercetools/nimbus';

/**
 * Deferred position input for the pin fields. It commits only on blur, so the
 * parent can re-sort the pin list without stealing focus on every keystroke.
 *
 * The local draft is re-synced from `position` because setting one pin's
 * position swaps another pin into the vacated slot — that second input's value
 * changes without anyone touching it, and would otherwise go stale. The
 * `editing` guard keeps that re-sync from overwriting whatever the user is
 * currently typing; without it, a swap triggered elsewhere in the list could
 * replace an in-progress edit mid-keystroke.
 */
export function PinPositionInput({
  position,
  limit,
  onCommit,
}: {
  position: number;
  limit: number;
  onCommit: (raw: string) => void;
}) {
  const [draft, setDraft] = useState(position);
  const editing = useRef(false);

  useEffect(() => {
    if (!editing.current) setDraft(position);
  }, [position]);

  const commit = useCallback(
    (v: number) => {
      const clamped = Math.max(1, Math.min(limit, Math.round(Number(v) || 1)));
      setDraft(clamped);
      onCommit(String(clamped));
    },
    [limit, onCommit]
  );

  return (
    <NumberInput
      value={draft}
      onChange={setDraft}
      onFocus={() => {
        editing.current = true;
      }}
      onBlur={() => {
        editing.current = false;
        commit(draft);
      }}
      minValue={1}
      maxValue={limit}
      size="sm"
      width="80px"
      aria-label="Position"
    />
  );
}

export default PinPositionInput;
