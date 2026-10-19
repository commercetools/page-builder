import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useHistory } from 'react-router-dom';
import { Box, Button, Dialog, Grid, Stack } from '@commercetools/nimbus';
import { useApplicationContext } from '@commercetools-frontend/application-shell-connectors';
import type { Page, PageNode } from '../page-builder/types';
import { useProjectLocales } from '../page-builder/shared/locales';
import CreateDedicatedPageDialog, {
  type CreateDedicatedPageMode,
} from './create-dedicated-page-dialog';
import messages from './messages';
import { PDP_FALLBACK_ID } from './page-detail-ids';
import { usePageDetailData } from './use-page-detail-data';
import { usePageDeletion } from './use-page-deletion';
import { PageDetailHeader } from './page-detail-parts/header';
import { PageDetailAboutCard } from './page-detail-parts/about-card';
import { PageDetailAssignmentCard } from './page-detail-parts/assignment-card';
import { PageDetailVersionHistory } from './page-detail-parts/version-history';

// The PDP fallback is "All categories"' PDP (`pdp-cat-root`) — mirroring how the
// category PLP falls back to `cat-root`. Every subcategory PDP inherits from it.

type PageDetailProps = {
  node: PageNode;
  onSelectPage: (n: PageNode) => void;
  basePath: string;
  pageTree: PageNode[];
  initialView?: 'plp' | 'pdp';
};

type View = 'plp' | 'pdp';

const PageDetail = ({
  node,
  onSelectPage,
  basePath,
  pageTree,
  initialView = 'plp',
}: PageDetailProps) => {
  const intl = useIntl();
  const history = useHistory();
  const isCategory = node.type === 'category' || node.id === 'cat-root';
  const projectKey = useApplicationContext((ctx) => ctx.project?.key ?? '');

  // Real project languages (replaces the old hardcoded "EN, DE, FR").
  const { locales: projectLocales } = useProjectLocales();
  const languagesLabel =
    Array.from(
      new Set(projectLocales.map((l) => l.split('-')[0].toUpperCase()))
    ).join(', ') || '—';

  // `Pages` keys this component by node id, so selecting a different page
  // remounts it and this starts over from `initialView` — no reset effect.
  const [view, setView] = useState<View>(initialView);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [pdpDialogOpen, setPdpDialogOpen] = useState(false);
  const data = usePageDetailData(node);
  const {
    draftFetcher,
    fallbackContent,
    canCopyFallback,
    builderState,
    appVersion,
    publishedAt,
    lastSavedAt,
    unpublishedCount,
    recentVersions,
    pdpOverrideId,
    pdpOverrideDraft,
    pdpOverrideState,
    pdpOverrideVersion,
    pdpOverridePublishedAt,
    pdpOverrideUnpublishedCount,
    globalPdpState,
    globalPdpVersion,
    globalPdpContent,
    canCopyGlobalPdp,
  } = data;

  const deletion = usePageDeletion({
    node,
    pageTree,
    onSelectPage,
    isCategory,
    view,
    pdpOverrideId,
    pdpOverrideDraft,
    draftFetcher,
    pdpOverrideState,
    builderState,
  });
  const { canDelete } = deletion;

  const formatDate = (iso: string) =>
    intl.formatDate(iso, { year: 'numeric', month: 'short', day: 'numeric' });

  // Arbitrary pages carry their canonical URL path in `node.slug`; categories
  // still derive a display path from the id.
  const slug =
    node.slug && node.type !== 'category'
      ? node.slug.startsWith('/')
        ? node.slug
        : `/${node.slug}`
      : `/${node.id.replace(/-/g, '/')}`;

  const plpTypeLabel =
    node.type === 'category'
      ? intl.formatMessage(messages.typeCategoryPage)
      : node.type === 'template'
      ? intl.formatMessage(messages.typeTemplate)
      : node.type === 'dynamic'
      ? intl.formatMessage(messages.typeDynamicPage)
      : intl.formatMessage(messages.typeStandardPage);

  // Derived for PDP header subtitle
  const pdpSubtitle =
    pdpOverrideState !== null
      ? intl.formatMessage(messages.pdpTypeCategoryOverride)
      : intl.formatMessage(messages.pdpTypeGlobalTemplate);

  const headerTypeLabel =
    isCategory && view === 'pdp' ? pdpSubtitle : plpTypeLabel;

  const headerVersion =
    isCategory && view === 'pdp'
      ? pdpOverrideVersion ?? globalPdpVersion
      : appVersion;

  const headerState =
    isCategory && view === 'pdp'
      ? pdpOverrideState ?? globalPdpState
      : builderState;

  const headerLastSaved = isCategory && view === 'pdp' ? null : lastSavedAt;

  // CTA
  const ctaDisabled = isCategory && view === 'pdp' && pdpOverrideState === null;

  const ctaLabel =
    isCategory && view === 'pdp'
      ? pdpOverrideState !== null
        ? intl.formatMessage(messages.editPdpOverride)
        : intl.formatMessage(messages.editGlobalPdp)
      : intl.formatMessage(messages.openInPageBuilder);

  const handleCta = () => {
    if (isCategory && view === 'pdp') {
      if (pdpOverrideState !== null) {
        history.push(`${basePath}/builder/${pdpOverrideId}`);
      }
    } else {
      history.push(`${basePath}/builder/${node.id}`);
    }
  };

  const handleCreateDedicatedPage = (mode: CreateDedicatedPageMode) => {
    setCreateDialogOpen(false);
    const pathname = `${basePath}/builder/${node.id}`;
    if (mode === 'copy' && fallbackContent) {
      // Deep clone so the builder's local edits never mutate the cached
      // fallback page (router state keeps the same object reference).
      const copyFromPage: Page = structuredClone(fallbackContent);
      history.push({ pathname, state: { copyFromPage } });
    } else {
      history.push(pathname);
    }
  };

  const handleCreatePdpOverride = (mode: CreateDedicatedPageMode) => {
    setPdpDialogOpen(false);
    const pathname = `${basePath}/builder/${pdpOverrideId}`;
    if (mode === 'copy' && globalPdpContent) {
      const copyFromPage: Page = structuredClone(globalPdpContent);
      history.push({ pathname, state: { copyFromPage } });
    } else {
      history.push(pathname);
    }
  };

  // Non-category nodes (home, pdp) can always open the builder to create or edit.
  // Category PDP view is blocked only when there's no override (the card handles creation instead).
  const openBuilderDisabled =
    isCategory && view === 'pdp' ? ctaDisabled : false;

  return (
    <Box flex={1} overflow="hidden" overflowY="auto">
      {/* Header */}
      <PageDetailHeader
        node={node}
        view={view}
        setView={setView}
        isCategory={isCategory}
        headerTypeLabel={headerTypeLabel}
        headerVersion={headerVersion}
        headerState={headerState}
        headerLastSaved={headerLastSaved}
        builderState={builderState}
        pdpOverrideState={pdpOverrideState}
        ctaLabel={ctaLabel}
        handleCta={handleCta}
        openBuilderDisabled={openBuilderDisabled}
        formatDate={formatDate}
      />

      {/* Cards */}
      <Stack padding="20px 28px" gap={24}>
        <Grid gridTemplateColumns="1fr 1fr" gap={16}>
          {/* About card */}
          <PageDetailAboutCard
            node={node}
            view={view}
            isCategory={isCategory}
            slug={slug}
            projectKey={projectKey}
            languagesLabel={languagesLabel}
            plpTypeLabel={plpTypeLabel}
            lastSavedAt={lastSavedAt}
            pdpOverrideState={pdpOverrideState}
            formatDate={formatDate}
          />

          {/* Page assignment / PDP assignment card */}
          <PageDetailAssignmentCard
            node={node}
            view={view}
            isCategory={isCategory}
            basePath={basePath}
            pageTree={pageTree}
            onSelectPage={onSelectPage}
            builderState={builderState}
            appVersion={appVersion}
            publishedAt={publishedAt}
            unpublishedCount={unpublishedCount}
            pdpOverrideState={pdpOverrideState}
            pdpOverrideVersion={pdpOverrideVersion}
            pdpOverridePublishedAt={pdpOverridePublishedAt}
            pdpOverrideUnpublishedCount={pdpOverrideUnpublishedCount}
            globalPdpVersion={globalPdpVersion}
            canDelete={canDelete}
            setCreateDialogOpen={setCreateDialogOpen}
            setPdpDialogOpen={setPdpDialogOpen}
            setDeleteOpen={deletion.setIsOpen}
            setDeleteError={deletion.setError}
            PDP_FALLBACK_ID={PDP_FALLBACK_ID}
            formatDate={formatDate}
          />
        </Grid>

        {/* Version history */}
        {view === 'plp' && recentVersions.length > 0 && (
          <PageDetailVersionHistory
            recentVersions={recentVersions}
            formatDate={formatDate}
          />
        )}
      </Stack>

      <CreateDedicatedPageDialog
        open={createDialogOpen}
        variant="plp"
        categoryTitle={node.title}
        canCopyFallback={canCopyFallback}
        onSelect={handleCreateDedicatedPage}
        onClose={() => setCreateDialogOpen(false)}
      />

      <CreateDedicatedPageDialog
        open={pdpDialogOpen}
        variant="pdp"
        categoryTitle={node.title}
        canCopyFallback={canCopyGlobalPdp}
        onSelect={handleCreatePdpOverride}
        onClose={() => setPdpDialogOpen(false)}
      />

      <Dialog.Root
        isOpen={deletion.isOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) deletion.setIsOpen(false);
        }}
        isDismissable={!deletion.deleting}
      >
        <Dialog.Content width="440px">
          <Dialog.Header>
            <Dialog.Title>
              {intl.formatMessage(messages.deleteAssignmentTitle)}
            </Dialog.Title>
            <Dialog.CloseTrigger isDisabled={deletion.deleting} />
          </Dialog.Header>
          <Dialog.Body>
            <Box fontSize={13} color="neutral.11" lineHeight={1.5}>
              {intl.formatMessage(messages.deleteAssignmentBody, {
                kind: deletion.deleteKind,
              })}
            </Box>
            {deletion.error && (
              <Box mt={200} fontSize={12} color="critical.11">
                {deletion.error}
              </Box>
            )}
          </Dialog.Body>
          <Dialog.Footer>
            <Button
              variant="outline"
              size="sm"
              onPress={() => deletion.setIsOpen(false)}
              isDisabled={deletion.deleting}
            >
              {intl.formatMessage(messages.deleteAssignmentCancel)}
            </Button>
            <Button
              variant="solid"
              colorPalette="critical"
              size="sm"
              onPress={deletion.confirmDelete}
              isDisabled={deletion.deleting}
            >
              {intl.formatMessage(messages.deleteAssignmentConfirm)}
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Root>
    </Box>
  );
};

export default PageDetail;
