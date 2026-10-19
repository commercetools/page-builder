import { describe, expect, it } from 'vitest';
import {
  PB_EDIT_PARAM,
  PB_ORIGIN_PARAM,
  PB_PAGE_ID_PARAM,
  PB_PREVIEW_PARAM,
  isEditRequest,
  isPreviewRequest,
  previewOrigin,
  previewPageId,
  readSearchParams,
} from './preview.js';

const params = (raw: Record<string, string | string[] | undefined>) =>
  readSearchParams(raw);

const TOKEN = 'secret-token';

describe('isPreviewRequest', () => {
  it('accepts a matching token', () => {
    expect(isPreviewRequest(params({ [PB_PREVIEW_PARAM]: TOKEN }), TOKEN)).toBe(true);
  });

  it('rejects a token that does not match', () => {
    expect(isPreviewRequest(params({ [PB_PREVIEW_PARAM]: 'guess' }), TOKEN)).toBe(false);
  });

  it('rejects a request with no token at all', () => {
    expect(isPreviewRequest(params({}), TOKEN)).toBe(false);
    expect(isPreviewRequest(undefined, TOKEN)).toBe(false);
  });

  it('rejects everything when the host has configured no token', () => {
    // Otherwise an unconfigured host would serve drafts to shoppers.
    expect(isPreviewRequest(params({ [PB_PREVIEW_PARAM]: TOKEN }), undefined)).toBe(false);
    expect(isPreviewRequest(params({ [PB_PREVIEW_PARAM]: '' }), '')).toBe(false);
  });

  it('reads the first value when the param is repeated', () => {
    expect(
      isPreviewRequest(params({ [PB_PREVIEW_PARAM]: [TOKEN, 'other'] }), TOKEN)
    ).toBe(true);
  });

  it('rejects when the first of a repeated param is wrong', () => {
    expect(
      isPreviewRequest(params({ [PB_PREVIEW_PARAM]: ['wrong', TOKEN] }), TOKEN)
    ).toBe(false);
  });
});

describe('isEditRequest', () => {
  it('accepts edit mode on a valid preview', () => {
    expect(
      isEditRequest(params({ [PB_PREVIEW_PARAM]: TOKEN, [PB_EDIT_PARAM]: '1' }), TOKEN)
    ).toBe(true);
  });

  it('refuses edit mode without a valid preview token', () => {
    // `pb_edit` alone must never switch a shopper into edit mode.
    expect(isEditRequest(params({ [PB_EDIT_PARAM]: '1' }), TOKEN)).toBe(false);
    expect(
      isEditRequest(params({ [PB_PREVIEW_PARAM]: 'guess', [PB_EDIT_PARAM]: '1' }), TOKEN)
    ).toBe(false);
  });

  it('refuses edit mode when the host configured no token', () => {
    expect(
      isEditRequest(
        params({ [PB_PREVIEW_PARAM]: TOKEN, [PB_EDIT_PARAM]: '1' }),
        undefined
      )
    ).toBe(false);
  });

  it('requires the exact value "1"', () => {
    for (const value of ['true', 'yes', '0', '']) {
      expect(
        isEditRequest(
          params({ [PB_PREVIEW_PARAM]: TOKEN, [PB_EDIT_PARAM]: value }),
          TOKEN
        )
      ).toBe(false);
    }
  });

  it('is off for a preview that did not ask for it', () => {
    expect(isEditRequest(params({ [PB_PREVIEW_PARAM]: TOKEN }), TOKEN)).toBe(false);
  });
});

describe('previewOrigin', () => {
  it('reads the origin the builder posted', () => {
    expect(previewOrigin(params({ [PB_ORIGIN_PARAM]: 'https://mc.test' }))).toBe(
      'https://mc.test'
    );
  });

  it('reads the first of a repeated param', () => {
    expect(previewOrigin(params({ [PB_ORIGIN_PARAM]: ['a', 'b'] }))).toBe('a');
  });

  it('reports nothing when absent', () => {
    expect(previewOrigin(params({}))).toBeUndefined();
    expect(previewOrigin(undefined)).toBeUndefined();
  });
});

describe('previewPageId', () => {
  it('reads the page id the editor asked for', () => {
    expect(previewPageId(params({ [PB_PAGE_ID_PARAM]: 'pdp-shoes' }))).toBe('pdp-shoes');
  });

  it('reports nothing when absent', () => {
    expect(previewPageId(params({}))).toBeUndefined();
    expect(previewPageId(undefined)).toBeUndefined();
  });
});

describe('readSearchParams', () => {
  it('passes the params through unchanged', () => {
    const raw = { a: '1' };
    expect(readSearchParams(raw)).toBe(raw);
  });

  it('passes undefined through', () => {
    expect(readSearchParams(undefined)).toBeUndefined();
  });
});
