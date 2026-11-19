import { useCallback, useReducer } from 'react';
import {
  dialogReducer,
  initialDialogState,
  type DialogTab,
} from './data-source-dialog-state';
import { useIntl } from 'react-intl';
import { Box, Button, Dialog, Flex, Tabs } from '@commercetools/nimbus';
import type { SavedDataSource, LocalizedString, DataSourceType } from './types';
import { findDSEntry, defaultConfigFor } from './data-source-catalog';
import Icon from './shared/icon';
import { useProjectLocales, ensureAllLocales } from './shared/locales';
import messages from './messages';
import { ExistingSourceTab } from './data-source-dialog/existing-tab';
import { NewSourceTab } from './data-source-dialog/new-tab';
import { EditSourceTab } from './data-source-dialog/edit-tab';
import { DataSourceDialogFooter } from './data-source-dialog/footer';
import { DataSourceDialogTabBar } from './data-source-dialog/tab-bar';

// ─── Main dialog ───────────────────────────────────────────────────────────

type Props = {
  open: boolean;
  typeFilter: string;
  currentId: string | null;
  savedSources: SavedDataSource[];
  dataSourceCatalog: DataSourceType[];
  saving?: boolean;
  isUnpublished?: boolean;
  onUse: (ds: SavedDataSource) => void;
  onSave: (ds: SavedDataSource) => Promise<void>;
  onPublish: (ds: SavedDataSource) => Promise<void>;
  onClose: () => void;
};

export default function DataSourceConfigDialog({
  open,
  typeFilter,
  currentId,
  savedSources,
  dataSourceCatalog,
  saving = false,
  isUnpublished = false,
  onUse,
  onSave,
  onPublish,
  onClose,
}: Props) {
  const intl = useIntl();
  const { locales, defaultLocale } = useProjectLocales();
  const catalogEntry = findDSEntry(typeFilter, dataSourceCatalog);
  const matchingSaved = savedSources.filter((s) => s.type === typeFilter);

  const [state, dispatch] = useReducer(
    dialogReducer,
    {
      hasMatchingSaved: matchingSaved.length > 0,
      currentId: currentId ?? null,
      firstMatchingId: matchingSaved[0]?.id ?? null,
      defaultConfig: catalogEntry ? defaultConfigFor(catalogEntry.schema) : {},
    },
    initialDialogState
  );
  const { tab, pickedId, search, draft, edit, lastSavedId } = state;

  const editingOriginal = savedSources.find((s) => s.id === edit.id) ?? null;

  const beginEdit = useCallback(
    (ds: SavedDataSource) => {
      dispatch({
        type: 'editStarted',
        source: ds,
        config: {
          ...(catalogEntry ? defaultConfigFor(catalogEntry.schema) : {}),
          ...ds.config,
        },
      });
    },
    [catalogEntry]
  );

  // ── "No catalog entry" fallback ──
  if (!catalogEntry) {
    return (
      <Dialog.Root
        isOpen={open}
        onOpenChange={(isOpen) => {
          if (!isOpen) onClose();
        }}
        isDismissable
      >
        <Dialog.Content>
          <Dialog.Header>
            <Dialog.Title>
              {intl.formatMessage(messages.dataSourceConfigTitle)}
            </Dialog.Title>
            <Dialog.CloseTrigger />
          </Dialog.Header>
          <Dialog.Body>
            <Box as="p" fontSize={13} color="neutral.9">
              No data source matching{' '}
              <Box as="code" fontFamily="mono">
                {typeFilter}
              </Box>{' '}
              is registered.
            </Box>
          </Dialog.Body>
          <Dialog.Footer>
            <Button variant="outline" size="sm" onPress={onClose}>
              {intl.formatMessage(messages.dataSourceConfigClose)}
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Root>
    );
  }

  // ── Derived values ──
  const filteredSaved = matchingSaved.filter((s) => {
    if (!search.trim()) return true;
    const n = Object.values(s.name ?? {})
      .join(' ')
      .toLowerCase();
    return n.includes(search.toLowerCase());
  });

  const draftNameStr = Object.values(draft.name)
    .filter(Boolean)
    .join('')
    .trim();
  const editNameStr = Object.values(edit.name).filter(Boolean).join('').trim();

  const editDirty =
    editingOriginal &&
    (JSON.stringify(editingOriginal.name ?? {}) !== JSON.stringify(edit.name) ||
      JSON.stringify(editingOriginal.config ?? {}) !==
        JSON.stringify(edit.config) ||
      editingOriginal.savedForReuse !== edit.reuse);

  const canSubmit =
    tab === 'existing'
      ? !!pickedId
      : tab === 'new'
      ? draftNameStr.length > 0
      : editNameStr.length > 0;

  const buildNewDs = (): SavedDataSource => ({
    id: `ds_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 6)}`,
    type: catalogEntry.type,
    name: draft.name,
    config: draft.config,
    savedForReuse: draft.reuse,
  });

  const buildEditedDs = (): SavedDataSource => ({
    ...editingOriginal!,
    name: edit.name,
    config: edit.config,
    savedForReuse: edit.reuse,
  });

  const handleUse = () => {
    if (tab === 'existing') {
      const picked = savedSources.find((s) => s.id === pickedId);
      if (picked) onUse(picked);
    } else if (tab === 'edit') {
      onUse(buildEditedDs());
    }
  };

  const switchToEdit = (ds: SavedDataSource) =>
    dispatch({ type: 'editStarted', source: ds, config: ds.config ?? {} });

  const handleSave = async () => {
    if (tab === 'new') {
      const ds = buildNewDs();
      switchToEdit(ds);
      dispatch({ type: 'saved', id: ds.id });
      await onSave(ds);
    } else if (tab === 'edit') {
      const ds = buildEditedDs();
      dispatch({ type: 'saved', id: ds.id });
      await onSave(ds);
    }
  };

  const handlePublishDs = async () => {
    if (tab === 'new') await onPublish(buildNewDs());
    else if (tab === 'edit') await onPublish(buildEditedDs());
  };

  const handleSaveAsCopy = async () => {
    const copyName: LocalizedString = {};
    for (const [k, v] of Object.entries(edit.name)) {
      if (v?.trim()) copyName[k] = `${v} (copy)`;
    }
    const ds: SavedDataSource = {
      id: `ds_${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 6)}`,
      type: catalogEntry.type,
      name: copyName,
      config: edit.config,
      savedForReuse: edit.reuse,
    };
    switchToEdit(ds);
    dispatch({ type: 'saved', id: ds.id });
    await onSave(ds);
  };

  const normalizedDraftName = ensureAllLocales(draft.name, locales);
  const normalizedEditName = ensureAllLocales(edit.name, locales);

  return (
    <Dialog.Root
      isOpen={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      scrollBehavior="inside"
      isDismissable
    >
      <Dialog.Content width={'620px'} maxWidth={'calc(-32px + 100vw);'}>
        {/* Header */}
        <Dialog.Header>
          <Flex align="center" gap={200} flex={1}>
            <Flex
              as="span"
              align="center"
              justify="center"
              width={30}
              height={30}
              borderRadius={7}
              bg="primary.3"
              flexShrink={0}
            >
              <Icon name={catalogEntry.icon} size={16} color="primary.11" />
            </Flex>
            <Dialog.Title>
              {intl.formatMessage(messages.dataSourceConfigTitle)} ·{' '}
              {Object.values(catalogEntry.name)[0]}
            </Dialog.Title>
          </Flex>
          <Dialog.CloseTrigger />
        </Dialog.Header>

        {/* Body */}
        <Dialog.Body>
          <Box
            as="p"
            mb={300}
            color="neutral.9"
            fontSize={12.5}
            lineHeight={1.5}
          >
            {Object.values(catalogEntry.description ?? {})[0] ?? ''}
          </Box>

          <Tabs.Root
            selectedKey={tab}
            onSelectionChange={(key) =>
              dispatch({ type: 'tabSelected', tab: key as DialogTab })
            }
            disabledKeys={!matchingSaved.length ? ['existing'] : []}
            gap={350}
          >
            <DataSourceDialogTabBar tab={tab} matchingSaved={matchingSaved} />
            <Tabs.Panels>
              {/* ── Existing tab ── */}
              <ExistingSourceTab
                matchingSaved={matchingSaved}
                filteredSaved={filteredSaved}
                pickedId={pickedId}
                search={search}
                catalogEntry={catalogEntry}
                beginEdit={beginEdit}
                dispatch={dispatch}
              />

              {/* ── Create new tab ── */}
              <NewSourceTab
                draft={draft}
                normalizedDraftName={normalizedDraftName}
                defaultLocale={defaultLocale}
                catalogEntry={catalogEntry}
                dispatch={dispatch}
              />

              {/* ── Edit tab ── */}
              {tab === 'edit' && editingOriginal && (
                <EditSourceTab
                  edit={edit}
                  editingOriginal={editingOriginal}
                  editDirty={editDirty}
                  normalizedEditName={normalizedEditName}
                  defaultLocale={defaultLocale}
                  catalogEntry={catalogEntry}
                  dispatch={dispatch}
                />
              )}
            </Tabs.Panels>
          </Tabs.Root>
        </Dialog.Body>

        {/* Footer */}
        <DataSourceDialogFooter
          tab={tab}
          canSubmit={canSubmit}
          saving={saving}
          isUnpublished={isUnpublished}
          editDirty={editDirty}
          editNameStr={editNameStr}
          lastSavedId={lastSavedId}
          handleUse={handleUse}
          handleSave={handleSave}
          handlePublishDs={handlePublishDs}
          handleSaveAsCopy={handleSaveAsCopy}
          onClose={onClose}
        />
      </Dialog.Content>
    </Dialog.Root>
  );
}
