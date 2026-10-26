import type { LocalizedString, SavedDataSource } from './types';

export type DialogTab = 'existing' | 'new' | 'edit';

type Editable = {
  name: LocalizedString;
  config: Record<string, unknown>;
  reuse: boolean;
};

export type DialogState = {
  tab: DialogTab;
  /** Selected saved source on the "existing" tab. */
  pickedId: string | null;
  search: string;
  /** The source being composed on the "new" tab. */
  draft: Editable;
  /** The source being amended on the "edit" tab, plus which one it is. */
  edit: Editable & { id: string | null };
  /** Last source written to CT, so the UI can show it as just-saved. */
  lastSavedId: string | null;
};

export type DialogAction =
  | { type: 'tabSelected'; tab: DialogTab }
  | { type: 'sourcePicked'; id: string }
  | { type: 'searched'; text: string }
  | { type: 'draftChanged'; patch: Partial<Editable> }
  | { type: 'editChanged'; patch: Partial<Editable> }
  /** Open the edit tab on a source, seeding the form from it. */
  | {
      type: 'editStarted';
      source: SavedDataSource;
      config: Record<string, unknown>;
    }
  | { type: 'editCancelled' }
  | { type: 'saved'; id: string };

export const initialDialogState = (args: {
  hasMatchingSaved: boolean;
  currentId: string | null;
  firstMatchingId: string | null;
  defaultConfig: Record<string, unknown>;
}): DialogState => ({
  tab: args.hasMatchingSaved ? 'existing' : 'new',
  pickedId: args.currentId ?? args.firstMatchingId ?? null,
  search: '',
  draft: { name: {}, config: args.defaultConfig, reuse: true },
  edit: { id: null, name: {}, config: {}, reuse: true },
  lastSavedId: null,
});

export const dialogReducer = (
  state: DialogState,
  action: DialogAction
): DialogState => {
  switch (action.type) {
    case 'tabSelected':
      return { ...state, tab: action.tab };
    case 'sourcePicked':
      return { ...state, pickedId: action.id };
    case 'searched':
      return { ...state, search: action.text };
    case 'draftChanged':
      return { ...state, draft: { ...state.draft, ...action.patch } };
    case 'editChanged':
      return { ...state, edit: { ...state.edit, ...action.patch } };
    // One action for what used to be five setters in two duplicated helpers.
    case 'editStarted':
      return {
        ...state,
        tab: 'edit',
        edit: {
          id: action.source.id,
          name: action.source.name ?? {},
          config: action.config,
          reuse: action.source.savedForReuse,
        },
      };
    case 'editCancelled':
      return { ...state, tab: 'existing', edit: { ...state.edit, id: null } };
    case 'saved':
      return { ...state, lastSavedId: action.id };
    default:
      return state;
  }
};
