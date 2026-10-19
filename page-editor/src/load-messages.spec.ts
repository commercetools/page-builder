import loadMessages from './load-messages';

// Note: `en.json` and `de.json` are currently empty objects — only `core.json`
// (the `extract-intl` output) is populated, so every string falls back to its
// `defaultMessage`. These tests assert the loader's contract, not catalogue size,
// so they keep passing once translations land.
describe('loadMessages', () => {
  it('resolves a message catalogue for English', async () => {
    await expect(loadMessages('en')).resolves.toEqual(expect.any(Object));
  });

  it('resolves a message catalogue for German', async () => {
    await expect(loadMessages('de')).resolves.toEqual(expect.any(Object));
  });

  it('falls back to the English chunk for an unsupported locale', async () => {
    await expect(loadMessages('ja')).resolves.toEqual(await loadMessages('en'));
  });

  it('returns an empty catalogue rather than throwing when a chunk fails to load', async () => {
    // The catch exists so a missing chunk degrades to untranslated UI instead of
    // taking the whole app down. Forced at the parse seam, since a dynamic JSON
    // import under Jest resolves to an object without going through JSON.parse.
    jest.resetModules();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.doMock('@commercetools-frontend/i18n', () => ({
      parseChunkImport: () => {
        throw new Error('corrupt chunk');
      },
    }));
    try {
      const failing = (await import('./load-messages')).default;
      await expect(failing('en')).resolves.toEqual({});
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('app messages for en'),
        expect.any(Error)
      );
    } finally {
      jest.dontMock('@commercetools-frontend/i18n');
      warn.mockRestore();
      jest.resetModules();
    }
  });
});
