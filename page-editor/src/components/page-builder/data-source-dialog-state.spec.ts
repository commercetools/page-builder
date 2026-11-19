import {
  dialogReducer,
  initialDialogState,
  type DialogState,
} from './data-source-dialog-state';
import type { SavedDataSource } from './types';

const source = (over: Partial<SavedDataSource> = {}): SavedDataSource => ({
  id: 'ds_1',
  type: 'products/list',
  name: { 'en-US': 'Featured' },
  config: { limit: 4 },
  savedForReuse: true,
  ...over,
});

const start = (over: Partial<Parameters<typeof initialDialogState>[0]> = {}) =>
  initialDialogState({
    hasMatchingSaved: true,
    currentId: null,
    firstMatchingId: 'ds_first',
    defaultConfig: { limit: 8 },
    ...over,
  });

describe('initialDialogState', () => {
  it('opens on the existing tab when there is something to pick', () => {
    expect(start().tab).toBe('existing');
  });

  it('opens on the new tab when nothing matches the type', () => {
    expect(start({ hasMatchingSaved: false }).tab).toBe('new');
  });

  it('prefers the currently-assigned source over the first match', () => {
    expect(start({ currentId: 'ds_current' }).pickedId).toBe('ds_current');
    expect(start().pickedId).toBe('ds_first');
    expect(start({ firstMatchingId: null }).pickedId).toBeNull();
  });

  it('seeds the new-source form from the schema defaults', () => {
    expect(start().draft.config).toEqual({ limit: 8 });
  });
});

describe('dialogReducer', () => {
  it('patches the draft without touching the edit form', () => {
    const next = dialogReducer(start(), {
      type: 'draftChanged',
      patch: { name: { 'en-US': 'New' } },
    });
    expect(next.draft.name).toEqual({ 'en-US': 'New' });
    // the patch is partial — config and reuse survive
    expect(next.draft.config).toEqual({ limit: 8 });
    expect(next.draft.reuse).toBe(true);
    expect(next.edit).toEqual(start().edit);
  });

  it('patches the edit form without touching the draft', () => {
    const next = dialogReducer(start(), {
      type: 'editChanged',
      patch: { reuse: false },
    });
    expect(next.edit.reuse).toBe(false);
    expect(next.draft).toEqual(start().draft);
  });

  // This replaced five setters that were duplicated in two helpers; the whole
  // point is that opening an edit can no longer half-apply.
  it('editStarted switches tab and seeds every edit field at once', () => {
    const next = dialogReducer(start(), {
      type: 'editStarted',
      source: source({ id: 'ds_9', savedForReuse: false }),
      config: { limit: 4, extra: true },
    });
    expect(next.tab).toBe('edit');
    expect(next.edit).toEqual({
      id: 'ds_9',
      name: { 'en-US': 'Featured' },
      config: { limit: 4, extra: true },
      reuse: false,
    });
  });

  it('editStarted tolerates a source with no name', () => {
    const next = dialogReducer(start(), {
      type: 'editStarted',
      source: source({ name: undefined }),
      config: {},
    });
    expect(next.edit.name).toEqual({});
  });

  it('editStarted takes the config passed in, not the source config', () => {
    // The caller merges schema defaults under the stored config for one entry
    // point and passes the stored config alone for the other.
    const next = dialogReducer(start(), {
      type: 'editStarted',
      source: source({ config: { limit: 4 } }),
      config: { limit: 4, fromDefaults: 'yes' },
    });
    expect(next.edit.config).toEqual({ limit: 4, fromDefaults: 'yes' });
  });

  it('editCancelled returns to the existing tab and clears the target', () => {
    const editing = dialogReducer(start(), {
      type: 'editStarted',
      source: source(),
      config: {},
    });
    const next = dialogReducer(editing, { type: 'editCancelled' });
    expect(next.tab).toBe('existing');
    expect(next.edit.id).toBeNull();
    // the form values stay put; only the target is cleared
    expect(next.edit.name).toEqual({ 'en-US': 'Featured' });
  });

  it('records the last saved id', () => {
    expect(
      dialogReducer(start(), { type: 'saved', id: 'ds_7' }).lastSavedId
    ).toBe('ds_7');
  });

  it('handles tab, pick and search', () => {
    let s: DialogState = start();
    s = dialogReducer(s, { type: 'tabSelected', tab: 'new' });
    s = dialogReducer(s, { type: 'sourcePicked', id: 'ds_2' });
    s = dialogReducer(s, { type: 'searched', text: 'feat' });
    expect(s.tab).toBe('new');
    expect(s.pickedId).toBe('ds_2');
    expect(s.search).toBe('feat');
  });

  it('never mutates the state it is given', () => {
    const before = start();
    const snapshot = structuredClone(before);
    dialogReducer(before, { type: 'draftChanged', patch: { reuse: false } });
    dialogReducer(before, {
      type: 'editStarted',
      source: source(),
      config: { a: 1 },
    });
    expect(before).toEqual(snapshot);
  });
});
