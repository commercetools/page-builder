import { FALLBACK_PAGE_ID, PDP_FALLBACK_ID } from './page-detail-ids';

describe('fallback page ids', () => {
  it('falls back to the "All categories" page', () => {
    expect(FALLBACK_PAGE_ID).toBe('cat-root');
  });

  it('derives the global PDP id from the category fallback', () => {
    expect(PDP_FALLBACK_ID).toBe(`pdp-${FALLBACK_PAGE_ID}`);
  });

  it('gives the PDP fallback the pdp- prefix that pageTypeForNode keys on', () => {
    expect(PDP_FALLBACK_ID.startsWith('pdp-')).toBe(true);
  });
});
