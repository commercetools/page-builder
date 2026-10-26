import { WIDTH_SPAN } from './shared';
import { WIDTH_OPTIONS } from '../page-tree';

describe('WIDTH_SPAN', () => {
  it('maps every offered width to its 12-column span', () => {
    for (const { v, span } of WIDTH_OPTIONS) {
      expect(WIDTH_SPAN[v]).toBe(span);
    }
  });

  it('covers exactly the widths the picker offers — no orphans either way', () => {
    expect(Object.keys(WIDTH_SPAN).sort()).toEqual(
      WIDTH_OPTIONS.map((o) => o.v).sort()
    );
  });

  it('never exceeds a full row', () => {
    for (const span of Object.values(WIDTH_SPAN)) {
      expect(span).toBeGreaterThan(0);
      expect(span).toBeLessThanOrEqual(12);
    }
  });
});
