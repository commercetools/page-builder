/**
 * `constants.ts` resolves the entry-point path and derives permission keys at
 * *import* time, so every case needs a fresh module registry with `window.app`
 * set up beforehand.
 */
type AppWindow = Window &
  typeof globalThis & { app?: { entryPointUriPath: string } };

const loadConstants = async (entryPointUriPath?: string) => {
  jest.resetModules();
  const w = window as AppWindow;
  const previous = w.app;
  if (entryPointUriPath === undefined) delete w.app;
  else w.app = { entryPointUriPath };
  try {
    return await import('./constants');
  } finally {
    if (previous === undefined) delete w.app;
    else w.app = previous;
  }
};

describe('entryPointUriPath', () => {
  it('reads the path the MC injected on window.app', async () => {
    const { entryPointUriPath } = await loadConstants('page-editor-eu');
    expect(entryPointUriPath).toBe('page-editor-eu');
  });

  it('falls back to the default when window.app carries an empty path', async () => {
    const { entryPointUriPath } = await loadConstants('');
    expect(entryPointUriPath).toBe('page-editor-us');
  });
});

describe('PERMISSION_GROUP_NAMES', () => {
  it('names one group per editor area', async () => {
    const { PERMISSION_GROUP_NAMES } = await loadConstants('page-editor-us');
    expect(PERMISSION_GROUP_NAMES).toEqual({
      componentEditor: 'component-editor',
      dataSources: 'data-sources',
      sectionsEditor: 'sections-editor',
    });
  });

  it('uses names the custom-application-config schema accepts', async () => {
    const { PERMISSION_GROUP_NAMES } = await loadConstants('page-editor-us');
    // Lowercase, hyphen-separated, no leading/trailing/adjacent hyphens.
    const valid = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    for (const name of Object.values(PERMISSION_GROUP_NAMES)) {
      expect(name).toMatch(valid);
    }
  });
});

describe('PERMISSIONS', () => {
  it('derives a View and Manage key for the app itself', async () => {
    const { PERMISSIONS } = await loadConstants('page-editor-us');
    expect(PERMISSIONS.View).toBe('ViewPageEditorUs');
    expect(PERMISSIONS.Manage).toBe('ManagePageEditorUs');
  });

  it('derives a View and Manage key for every additional group', async () => {
    const { PERMISSIONS } = await loadConstants('page-editor-us');
    expect(PERMISSIONS.ViewComponentEditor).toBe(
      'ViewPageEditorUsComponentEditor'
    );
    expect(PERMISSIONS.ManageComponentEditor).toBe(
      'ManagePageEditorUsComponentEditor'
    );
    expect(PERMISSIONS.ViewDataSources).toBe('ViewPageEditorUsDataSources');
    expect(PERMISSIONS.ManageSectionsEditor).toBe(
      'ManagePageEditorUsSectionsEditor'
    );
  });

  it('tracks the configured entry point rather than hardcoding it', async () => {
    const { PERMISSIONS } = await loadConstants('page-editor-eu');
    expect(PERMISSIONS.View).toBe('ViewPageEditorEu');
  });
});
