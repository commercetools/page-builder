import { useState, useCallback, useMemo } from 'react';
import { useIntl } from 'react-intl';
import { useParams, useHistory, useLocation } from 'react-router-dom';
import {
  ToastOutlet,
  Flex,
  Splitter,
  useResponsiveSplitterSizes,
} from '@commercetools/nimbus';
import type { LayoutElement } from './types';
import { DEFAULT_SECTIONS } from './types';
import { PAGE_TREE as PAGE_TREE_DATA, findPageById } from './page-tree';
import { useComponentsPublishedFetcher } from '../../hooks/use-components-connector';
import { useSectionsPublishedFetcher } from '../../hooks/use-sections-connector';
import { useDataSourcesPublishedFetcher } from '../../hooks/use-data-sources-connector';
import { useCategoriesFetcher } from '../../hooks/use-categories-connector';
import { useProjectLocales } from './shared/locales';
import MenuBar from './menu-bar';
import LeftPane, { type LeftPanelId } from './left-pane';
import LayoutCanvas from './layout-canvas';
import LayoutPickerDialog from './layout-picker-dialog';
import SettingsPane from './settings-pane';
import PreviewFrame from './preview/preview-frame';
import { originOf } from './preview/preview-bridge';
import { ImagePickerHost } from './shared/image-picker-host';
import ElementCommentsDialog from './comments/element-comments-dialog';
import MessagesDrawer from './comments/messages-drawer';
import WorkflowHistoryDrawer from './workflow-history-drawer';
import RejectDialog from './reject-dialog';
import { useWorkflowRuntime } from './use-workflow-runtime';
import { useElementSelection } from './use-element-selection';
import { usePageDocument } from './use-page-document';
import { usePreviewBridge } from './use-preview-bridge';
import { usePageComments } from './use-page-comments';
import { usePreviewTarget } from './use-preview-target';
import messages from './messages';

type PageBuilderParams = {
  pageId: string;
};

const PageBuilder = () => {
  const { pageId } = useParams<PageBuilderParams>();
  const routerHistory = useHistory();
  const intl = useIntl();

  const { defaultLocale } = useProjectLocales();
  const categoriesFetcher = useCategoriesFetcher(defaultLocale);
  const { pageNode, pageNodeIsLive } = useMemo(() => {
    const staticNode = findPageById(PAGE_TREE_DATA, pageId);
    if (staticNode) return { pageNode: staticNode, pageNodeIsLive: true };
    // findPageById already recurses through `.children`, so this also matches
    // sub-categories nested under a top-level category, not just root ones.
    const categoryNode = findPageById(categoriesFetcher.nodes, pageId);
    if (categoryNode) return { pageNode: categoryNode, pageNodeIsLive: true };
    // Synthesize a minimal node so id-based type inference (e.g. pdp-*) still works.
    return { pageNode: { id: pageId, title: pageId }, pageNodeIsLive: false };
  }, [pageId, categoriesFetcher.nodes]);
  const location = useLocation();

  const sectionsFetcher = useSectionsPublishedFetcher();
  // Fall back to the default sections whenever the synced catalog has none.
  // `??` alone is not enough: a synced-but-empty `sections: []` is not nullish,
  // so it would slip through and leave the canvas with nothing to render (a
  // blank edit grid). The editor must always expose at least HEAD/MAIN/FOOTER.
  const fetchedSections = sectionsFetcher.payload?.sections;
  const sections =
    fetchedSections && fetchedSections.length > 0
      ? fetchedSections
      : DEFAULT_SECTIONS;

  const doc = usePageDocument({ pageId, pageNode, pageNodeIsLive, sections });
  const { page, pageType, pushHistory, dirty, saving } = doc;

  const preview = usePreviewTarget({
    pageId,
    pageNode,
    pageType,
    defaultLocale,
    dirty,
    save: doc.save,
  });
  const { viewMode } = preview;

  // Component / data-source definitions are owned by the host code and synced into
  // CT by the page-builder service's catalog ingest; the builder only reads the
  // published catalog. An unsynced project yields an empty palette (see the empty
  // state in LeftPane), never a stale local stub.
  const componentsFetcher = useComponentsPublishedFetcher();
  const componentCatalog = componentsFetcher.payload?.components ?? [];
  const componentGroups = componentsFetcher.payload?.groups ?? [];
  const dataSourcesFetcher = useDataSourcesPublishedFetcher();
  const dataSourceCatalog = dataSourcesFetcher.payload?.sources ?? [];
  const selection = useElementSelection();
  const [activeLeftPanel, setActiveLeftPanel] = useState<LeftPanelId | null>(
    'components'
  );
  const [draggedType, setDraggedType] = useState<string | null>(null);
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>(
    'desktop'
  );
  const [pickerSection, setPickerSection] = useState<string | null>(null);

  const handlePickerAdd = useCallback(
    (layout: LayoutElement) => {
      if (!pickerSection) return;
      pushHistory({
        ...page,
        [pickerSection]: [...page[pickerSection], layout],
      });
      setPickerSection(null);
    },
    [pickerSection, page, pushHistory]
  );

  // In preview mode the settings pane only exists while something is selected.
  // It collapses rather than unmounting the splitter, so the preview iframe is
  // never torn down and reloaded by a selection change.
  const previewSettingsOpen =
    preview.enabled && !!(selection.layoutId || selection.compId);
  // `Splitter` is percentage-native; this hook is its pixel/token facade — it
  // measures the container, clamps the pane to 320–600px, and persists the
  // settled width per browser.
  const { rootProps: settingsSplitterProps } = useResponsiveSplitterSizes({
    orientation: 'horizontal',
    persistKey: 'page-builder:settings-pane',
    size: 320,
    minSize: 320,
    maxSize: 600,
    onCollapsedChange: (collapsed) => {
      // Enter on the focused handle collapses the aside — clear the selection
      // so app state and the pane agree.
      if (collapsed) selection.selectLayout(null);
    },
  });
  const pagesPath = location.pathname.replace(/\/builder\/[^/]+$/, '/pages');

  const {
    previewFrameRef,
    previewRects,
    previewHoveredId,
    previewDropzones,
    bridgeConnected,
    bridgeSend,
    previewPaletteCatalog,
    duplicateSelected,
    deleteSelected,
    handlePaletteDrop,
  } = usePreviewBridge({
    doc,
    selection,
    componentCatalog,
    draggedType,
    setDraggedType,
    viewMode,
    previewEnabled: preview.enabled,
    previewLocale: preview.locale,
    hostOrigin: originOf(preview.hostOrigin),
  });

  const comments = usePageComments({
    pageId,
    page,
    selection,
    highlightInPreview: (elementId) => {
      if (viewMode === 'preview' && bridgeConnected)
        bridgeSend('highlight', { id: elementId });
    },
  });

  // Every element id present in the page model the editor is editing.
  const pageIdSet = useMemo(
    () =>
      new Set(
        Object.values(page).flatMap((ls) =>
          ls.flatMap((l) => [l.id, ...l.children.map((c) => c.id)])
        )
      ),
    [page]
  );

  const workflow = useWorkflowRuntime({
    pageId,
    pageType,
    saving,
    author: comments.author,
    commentsUpdater: comments.updater,
    onSaveDraftForReview: doc.saveDraftSilently,
    onPublish: doc.publishPage,
    publishLabel: intl.formatMessage(messages.menuBarPublish),
  });

  // Fail-loud guard: the host reported rects for a set of ids, but NONE of them
  // exist in the page we're editing. That means the storefront is rendering a
  // different page object (wrong container/key, or it ignored pb_page_id), so
  // every click silently no-ops (see `case 'select'`). Zero overlap is a strong,
  // low-false-positive signal; a partial overlap (some ids matching) is treated
  // as normal to avoid flagging transient/partial render states.
  const previewIdMismatch = useMemo(() => {
    if (!bridgeConnected || viewMode !== 'preview' || !preview.enabled) {
      return false;
    }
    const renderedIds = Object.keys(previewRects);
    if (renderedIds.length === 0 || pageIdSet.size === 0) return false;
    return renderedIds.every((id) => !pageIdSet.has(id));
  }, [bridgeConnected, viewMode, preview.enabled, previewRects, pageIdSet]);

  return (
    // Mounted here so the settings pane and the data-source config dialog — both rendered
    // below — share one media-service connection and one JWT read.
    <ImagePickerHost>
      <Flex
        direction="column"
        height="calc(100vh - 56px)"
        overflow="hidden"
        onDragEnd={() => setDraggedType(null)}
      >
        <ToastOutlet />
        <LayoutPickerDialog
          open={!!pickerSection}
          section={
            pickerSection ?? sections[1]?.id ?? sections[0]?.id ?? 'MAIN'
          }
          onAdd={handlePickerAdd}
          onClose={() => setPickerSection(null)}
        />
        <MenuBar
          pageId={pageId}
          pageTitle={pageNode.title}
          version={(
            doc.draftFetcher.current?.appVersion ??
            doc.currentPublished?.appVersion
          )?.toString()}
          state={
            doc.draftFetcher.loading && doc.initialized !== pageId
              ? undefined
              : doc.draftFetcher.current
              ? doc.currentPublished && !!doc.draftFetcher.current.publishedAt
                ? 'published'
                : 'draft'
              : undefined
          }
          device={device}
          onDeviceChange={setDevice}
          viewMode={viewMode}
          onViewModeChange={preview.changeViewMode}
          previewEnabled={preview.enabled}
          canUndo={doc.canUndo}
          canRedo={doc.canRedo}
          onUndo={doc.undo}
          onRedo={doc.redo}
          saveState={doc.saveState}
          canSave={dirty && !saving}
          canPublish={
            workflow.active ? workflow.canPublish : doc.legacyCanPublish
          }
          publishLoading={
            doc.draftFetcher.loading && doc.initialized !== pageId
          }
          onSave={doc.save}
          onPublish={
            workflow.active ? workflow.publishAndReset : doc.publishPage
          }
          onSaveAndPublish={doc.saveAndPublish}
          onOpenComments={() => {
            comments.setMessagesOpen(true);
            comments.markSeen();
          }}
          unreadCount={comments.unreadCount}
          workflowActive={workflow.active}
          workflowNextLabel={workflow.nextLabel}
          workflowAtFinish={workflow.atFinish}
          onAdvance={workflow.advance}
          canAdvance={workflow.canAdvance}
          onReject={() => workflow.setRejectOpen(true)}
          canReject={workflow.canReject}
          onOpenHistory={() => workflow.setHistoryOpen(true)}
          workflowName={workflow.active ? workflow.name : undefined}
          workflowStageLabel={workflow.stageLabel}
        />
        {viewMode === 'preview' ? (
          <Flex flex={1} minHeight={0}>
            <LeftPane
              activePanel={activeLeftPanel}
              onActivatePanel={setActiveLeftPanel}
              onDragStart={(type) => setDraggedType(type)}
              catalog={previewPaletteCatalog}
              groups={componentGroups}
              pageType={pageType}
              page={page}
              sections={sections}
              selectedLayoutId={selection.layoutId}
              selectedCompId={selection.compId}
              onSelectLayout={selection.selectLayout}
              onSelectComp={selection.selectComp}
            />
            <Splitter.Root
              {...settingsSplitterProps}
              flex={1}
              minWidth={0}
              collapsible
              collapsed={!previewSettingsOpen}
              isDisabled={!previewSettingsOpen}
            >
              <Splitter.Main display="flex">
                <PreviewFrame
                  ref={previewFrameRef}
                  url={preview.url}
                  configured={preview.enabled}
                  device={device}
                  locales={preview.settings?.locales ?? []}
                  locale={preview.locale}
                  onLocaleChange={preview.setLocale}
                  onRefresh={preview.refresh}
                  onConfigure={() => routerHistory.push(pagesPath)}
                  envOptions={preview.envOptions}
                  activeEnv={preview.activeEnv}
                  onEnvChange={preview.changeEnv}
                  rects={previewRects}
                  selectedId={selection.elementId}
                  hoveredId={previewHoveredId}
                  onComment={() => {
                    if (selection.elementId)
                      comments.setTarget({
                        kind: 'element',
                        elementId: selection.elementId,
                      });
                  }}
                  commentCount={
                    selection.elementId
                      ? comments.counts[selection.elementId]
                      : undefined
                  }
                  onDuplicate={duplicateSelected}
                  onDelete={deleteSelected}
                  dropzones={previewDropzones}
                  dragActive={!!draggedType}
                  onPaletteDrop={handlePaletteDrop}
                  idMismatch={previewIdMismatch}
                />
              </Splitter.Main>
              <Splitter.Handle />
              <Splitter.Aside>
                {previewSettingsOpen && (
                  <SettingsPane
                    page={page}
                    onPageChange={pushHistory}
                    selectedLayoutId={selection.layoutId}
                    selectedCompId={selection.compId}
                    onClose={() => selection.selectLayout(null)}
                    savedDataSources={doc.savedDataSources}
                    onSaveDataSources={doc.saveDataSource}
                    onPublishDataSources={doc.publishDataSource}
                    instancesSaving={doc.instancesSaving}
                    instancesDirty={doc.instancesDirty}
                    componentCatalog={componentCatalog}
                    dataSourceCatalog={dataSourceCatalog}
                  />
                )}
              </Splitter.Aside>
            </Splitter.Root>
          </Flex>
        ) : (
          <Flex flex={1} minHeight={0}>
            <LeftPane
              activePanel={activeLeftPanel}
              onActivatePanel={setActiveLeftPanel}
              onDragStart={(type) => setDraggedType(type)}
              catalog={componentCatalog}
              groups={componentGroups}
              pageType={pageType}
              page={page}
              sections={sections}
              selectedLayoutId={selection.layoutId}
              selectedCompId={selection.compId}
              onSelectLayout={selection.selectLayout}
              onSelectComp={selection.selectComp}
            />
            <Splitter.Root {...settingsSplitterProps} flex={1} minWidth={0}>
              <Splitter.Main display="flex">
                <LayoutCanvas
                  page={page}
                  sections={sections}
                  pageType={pageType}
                  onPageChange={pushHistory}
                  selectedLayoutId={selection.layoutId}
                  selectedCompId={selection.compId}
                  onSelectLayout={selection.selectLayout}
                  onSelectComp={selection.selectComp}
                  draggedComponentType={draggedType}
                  device={device}
                  onAddLayout={setPickerSection}
                  componentCatalog={componentCatalog}
                  onCommentElement={(id) =>
                    comments.setTarget({ kind: 'element', elementId: id })
                  }
                  commentCounts={comments.counts}
                />
              </Splitter.Main>
              <Splitter.Handle />
              <Splitter.Aside>
                <SettingsPane
                  page={page}
                  onPageChange={pushHistory}
                  selectedLayoutId={selection.layoutId}
                  selectedCompId={selection.compId}
                  onClose={() => selection.selectLayout(null)}
                  savedDataSources={doc.savedDataSources}
                  onSaveDataSources={doc.saveDataSource}
                  onPublishDataSources={doc.publishDataSource}
                  instancesSaving={doc.instancesSaving}
                  instancesDirty={doc.instancesDirty}
                  componentCatalog={componentCatalog}
                  dataSourceCatalog={dataSourceCatalog}
                />
              </Splitter.Aside>
            </Splitter.Root>
          </Flex>
        )}

        <ElementCommentsDialog
          isOpen={!!comments.target}
          onClose={() => comments.setTarget(null)}
          target={comments.target}
          title={comments.dialogTitle}
          threads={comments.threads}
          updater={comments.updater}
          author={comments.author}
        />
        <MessagesDrawer
          isOpen={comments.messagesOpen}
          onClose={() => comments.setMessagesOpen(false)}
          threads={comments.threads}
          author={comments.author}
          updater={comments.updater}
          resolveElementLabel={comments.resolveElementLabel}
          onNavigateToElement={comments.navigateToElement}
        />
        <WorkflowHistoryDrawer
          isOpen={workflow.historyOpen}
          onClose={() => workflow.setHistoryOpen(false)}
          workflowName={workflow.name}
          history={workflow.history}
        />
        <RejectDialog
          isOpen={workflow.rejectOpen}
          onClose={() => workflow.setRejectOpen(false)}
          onConfirm={workflow.reject}
          stepLabel={workflow.currentStepLabel}
          busy={workflow.committing}
        />
      </Flex>
    </ImagePickerHost>
  );
};

export default PageBuilder;
