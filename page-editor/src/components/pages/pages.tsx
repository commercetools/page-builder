import { useState, useMemo, useEffect } from 'react';
import { useIntl } from 'react-intl';
import { useRouteMatch, useHistory, useLocation } from 'react-router-dom';
import {
  Box,
  Button,
  Flex,
  SearchInput,
  Heading,
  Separator,
  toast,
  ToastOutlet,
  Toolbar,
} from '@commercetools/nimbus';
import { PAGE_TREE } from '../page-builder/page-tree';
import type { PageNode } from '../page-builder/types';
import Icon from '../page-builder/shared/icon';
import { useProjectLocales } from '../page-builder/shared/locales';
import { pathForSlug } from '../page-builder/page-path';
import PreviewSettingsDialog from '../page-builder/preview/preview-settings-dialog';
import { useCategoriesFetcher } from '../../hooks/use-categories-connector';
import {
  useBuiltPageIds,
  useCreatePage,
  useMigrateAllPages,
} from '../../hooks/use-page-builder-connector';
import PageTreeRow, { filterTree } from './page-tree-row';
import PageDetail from './page-detail';
import CreatePageDrawer from './create-page-drawer';
import MigrateAllDialog from './migrate-all-dialog';
import messages from './messages';
import { useMergedPageTree } from './use-merged-page-tree';
import { usePreviewSettingsState } from './use-preview-settings-state';

/** Page ids that are not arbitrary "content" pages (home + global fallbacks). */

const Pages = () => {
  const intl = useIntl();
  const match = useRouteMatch();
  const history = useHistory();
  const location = useLocation();
  const basePath = match.url.split('/').slice(0, -1).join('/');
  const [search, setSearch] = useState('');

  const { defaultLocale } = useProjectLocales();
  const categoriesFetcher = useCategoriesFetcher(defaultLocale);
  const {
    pageStates: builtPageStates,
    pages: builtPages,
    legacyPageIds,
  } = useBuiltPageIds();
  // Preview settings now live in this top-level dashboard, not the builder.
  const previewSettingsState = usePreviewSettingsState();
  const {
    settings: previewSettings,
    saving: settingsSaving,
    isOpen: settingsOpen,
    setIsOpen: setSettingsOpen,
    save: handleSaveSettings,
  } = previewSettingsState;

  // New arbitrary page creation (Drawer).
  const { createPage, loading: creating } = useCreatePage();
  const [createOpen, setCreateOpen] = useState(false);
  const handleCreatePage = async ({
    slug,
    name,
  }: {
    slug: string;
    name: string;
  }) => {
    try {
      await createPage(slug, {
        title: name,
        path: pathForSlug(slug),
        pageType: 'static',
      });
      setCreateOpen(false);
      history.push(`${basePath}/builder/${slug}`);
    } catch {
      // Keep the drawer open on failure so the user can retry.
    }
  };

  // Force migration of any pages still in the legacy (pre-v3) storage format: the dialog
  // below auto-opens (non-closable) whenever legacy pages exist and blocks the dashboard.
  const { migrateAll } = useMigrateAllPages();
  const [migrateBusy, setMigrateBusy] = useState(false);
  const [migrateError, setMigrateError] = useState<string | null>(null);
  const handleMigrateAll = async () => {
    setMigrateBusy(true);
    setMigrateError(null);
    try {
      const res = await migrateAll();
      if (res.failed.length === 0) {
        toast.success({
          title: `Migrated ${res.migrated} page${
            res.migrated === 1 ? '' : 's'
          } to the new format.`,
        });
      } else {
        setMigrateError(
          `${res.failed.length} of ${res.total} page${
            res.total === 1 ? '' : 's'
          } failed to migrate. Please retry.`
        );
      }
    } catch {
      setMigrateError('Migration failed. Please retry.');
    } finally {
      setMigrateBusy(false);
    }
  };

  const { categoryIds, treeWithContent } = useMergedPageTree({
    categoriesFetcher,
    builtPages,
  });

  const qp = new URLSearchParams(location.search);
  const nodeIdFromUrl = qp.get('node');
  const viewFromUrl = (qp.get('view') ?? 'plp') as 'plp' | 'pdp';

  const findNode = (id: string): PageNode | undefined => {
    const search = (nodes: PageNode[]): PageNode | undefined => {
      for (const n of nodes) {
        if (n.id === id) return n;
        if (n.children) {
          const found = search(n.children);
          if (found) return found;
        }
      }
      return undefined;
    };
    return search(treeWithContent);
  };

  const [selected, setSelected] = useState<PageNode>(() => {
    if (nodeIdFromUrl) {
      const found = findNode(nodeIdFromUrl);
      if (found) return found;
    }
    return PAGE_TREE[0];
  });

  // The `view` query param is a deep link into one specific page: `handleSelect`
  // deletes it when the user picks another page. Snapshot it at mount so that,
  // once `PageDetail` is remounted per node, only the deep-linked page opens on
  // that view and every other one opens on 'plp'.
  const [deepLink] = useState<{ nodeId: string | null; view: 'plp' | 'pdp' }>(
    () => ({ nodeId: nodeIdFromUrl, view: viewFromUrl })
  );

  // Re-resolve the URL node once categories / content pages have loaded (a deep
  // id won't exist in the static tree on first render).
  useEffect(() => {
    if (!nodeIdFromUrl || categoriesFetcher.loading) return;
    const found = findNode(nodeIdFromUrl);
    if (found && found.id !== selected.id) setSelected(found);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoriesFetcher.loading, treeWithContent]);

  const handleSelect = (node: PageNode) => {
    setSelected(node);
    const params = new URLSearchParams(location.search);
    params.set('node', node.id);
    params.delete('view');
    history.replace(`${match.url}?${params.toString()}`);
  };

  // Ids on the path root→selected, so the tree auto-expands to reveal the
  // selected node (e.g. when deep-linked via ?node=<id>).
  const openIds = useMemo(() => {
    const ids = new Set<string>();
    const walk = (nodes: PageNode[], trail: string[]): boolean => {
      for (const n of nodes) {
        const nextTrail = [...trail, n.id];
        if (n.id === selected?.id) {
          nextTrail.forEach((id) => ids.add(id));
          return true;
        }
        if (n.children && walk(n.children, nextTrail)) return true;
      }
      return false;
    };
    walk(treeWithContent, []);
    return ids;
  }, [treeWithContent, selected]);

  const displayTree = filterTree(treeWithContent, search);

  return (
    <Flex
      direction="column"
      height="calc(100vh - 56px)"
      overflow="hidden"
      minHeight={0}
      fontFamily="body"
      bg="neutral.2"
    >
      <Toolbar variant="outline" borderRadius={0} mb={'1px'} bg={'bg'}>
        <Flex
          align="center"
          justify="space-between"
          marginX={500}
          width={'full'}
        >
          <Box>
            <Box fontSize={11} color="neutral.9" marginBottom={4}>
              {intl.formatMessage(messages.siteBuilderLabel)}
            </Box>
            <Heading size="xl">{intl.formatMessage(messages.title)}</Heading>
          </Box>
          <Flex gap={8}>
            <Button
              variant="outline"
              size="xs"
              onPress={() => setSettingsOpen(true)}
            >
              <Icon name="Tune" size={14} color="neutral.11" />
              {intl.formatMessage(messages.previewSettings)}
            </Button>
            <Button variant="outline" size="xs" onPress={() => {}}>
              <Icon name="Upload" size={14} color="neutral.11" />
              {intl.formatMessage(messages.import)}
            </Button>
            <Button
              variant="solid"
              colorPalette="primary"
              size="xs"
              onPress={() => setCreateOpen(true)}
            >
              <Icon name="Add" size={14} color="neutral.1" />
              {intl.formatMessage(messages.newPage)}
            </Button>
          </Flex>
        </Flex>
      </Toolbar>

      <Flex flex={1} minHeight={0}>
        {/* Left panel */}
        <Flex
          direction="column"
          width={360}
          flexShrink={0}
          bg={'bg'}
          borderRight="solid-25"
          borderRightColor="neutral.6"
          minHeight={0}
          overflow="hidden"
          overflowY="auto"
        >
          <Box padding="12px 12px 8px 12px" flexShrink={0}>
            <SearchInput
              value={search}
              onChange={(v: string) => setSearch(v)}
              aria-label={intl.formatMessage(messages.searchPages)}
              placeholder={intl.formatMessage(messages.searchPages)}
              size="sm"
              width="full"
            />
          </Box>
          <Separator />
          <Box flex={1} overflow="auto" padding="0 8px 12px 8px">
            {displayTree.length === 0 && (
              <Box
                textAlign="center"
                color="neutral.9"
                fontSize={13}
                padding={24}
              >
                {intl.formatMessage(messages.noPagesFound)}
              </Box>
            )}
            {displayTree.map((node) => (
              <PageTreeRow
                key={node.id}
                node={node}
                selectedId={selected?.id}
                onSelect={handleSelect}
                builtPageStates={builtPageStates}
                depth={0}
                forceExpand={search.length > 0}
                openIds={openIds}
              />
            ))}
          </Box>
        </Flex>

        {/* Right panel */}
        {selected ? (
          <PageDetail
            key={selected.id}
            node={selected}
            onSelectPage={handleSelect}
            basePath={basePath}
            pageTree={treeWithContent}
            initialView={
              selected.id === deepLink.nodeId ? deepLink.view : 'plp'
            }
          />
        ) : (
          <Flex align="center" justify="center" flex={1} color="neutral.9">
            {intl.formatMessage(messages.selectAPage)}
          </Flex>
        )}
      </Flex>

      <PreviewSettingsDialog
        isOpen={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={previewSettings}
        saving={settingsSaving}
        onSave={handleSaveSettings}
      />
      <CreatePageDrawer
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        settings={previewSettings}
        existingPageIds={builtPageStates}
        categoryIds={categoryIds}
        onCreate={handleCreatePage}
        creating={creating}
      />
      <MigrateAllDialog
        isOpen={legacyPageIds.length > 0}
        count={legacyPageIds.length}
        busy={migrateBusy}
        error={migrateError}
        onMigrate={handleMigrateAll}
      />
      <ToastOutlet />
    </Flex>
  );
};

export default Pages;
