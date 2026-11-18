import { useState, useCallback } from 'react';
import { useIntl } from 'react-intl';
import { Box, Flex, IconButton, Accordion } from '@commercetools/nimbus';
import type {
  Page,
  LayoutElement,
  ComponentElement,
  SavedDataSource,
  DataSourceType,
} from './types';
import type { ComponentType } from './types';
import DataSourceConfigDialog from './data-source-config-dialog';
import Icon from './shared/icon';
import { SettingsGeneralSection } from './settings-pane-sections/general';
import { SettingsVisibilitySection } from './settings-pane-sections/visibility';
import { SettingsContentSection } from './settings-pane-sections/content';
import { SettingsAdvancedSection } from './settings-pane-sections/advanced';
import {
  useProjectLocales,
  ensureAllLocales,
  useLocalizedDisplay,
} from './shared/locales';
import messages from './messages';

type SettingsPaneProps = {
  page: Page;
  onPageChange: (page: Page) => void;
  selectedLayoutId: string | null;
  selectedCompId: string | null;
  onClose: () => void;
  savedDataSources: SavedDataSource[];
  onSaveDataSources: (ds: SavedDataSource) => Promise<void>;
  onPublishDataSources: (ds: SavedDataSource) => Promise<void>;
  instancesSaving: boolean;
  instancesDirty: boolean;
  componentCatalog: ComponentType[];
  dataSourceCatalog: DataSourceType[];
};

function findLayout(
  page: Page,
  layoutId: string
): { section: string; layout: LayoutElement } | null {
  for (const section of Object.keys(page)) {
    const layout = (page[section] ?? []).find((l) => l.id === layoutId);
    if (layout) return { section, layout };
  }
  return null;
}

function updateLayout(
  page: Page,
  section: string,
  updated: LayoutElement
): Page {
  return {
    ...page,
    [section]: (page[section] ?? []).map((l) =>
      l.id === updated.id ? updated : l
    ),
  };
}

function updateComp(
  page: Page,
  section: string,
  layoutId: string,
  updated: ComponentElement
): Page {
  return {
    ...page,
    [section]: (page[section] ?? []).map((l) =>
      l.id === layoutId
        ? {
            ...l,
            children: l.children.map((c) =>
              c.id === updated.id ? updated : c
            ),
          }
        : l
    ),
  };
}

/**
 * Sizing lives on the `Splitter` that owns this pane (see `page-builder.tsx`) —
 * the pane just fills whatever the splitter's aside gives it.
 */
const SettingsPane = ({
  page,
  onPageChange,
  selectedLayoutId,
  selectedCompId,
  onClose,
  savedDataSources,
  onSaveDataSources,
  onPublishDataSources,
  instancesSaving,
  instancesDirty,
  componentCatalog,
  dataSourceCatalog,
}: SettingsPaneProps) => {
  const intl = useIntl();
  const { locales, defaultLocale } = useProjectLocales();
  const displayString = useLocalizedDisplay();
  // Data source dialog state
  type DsDialog = {
    type: string;
    currentId: string | null;
    applyId: (id: string | null) => void;
  };
  const [dsDialog, setDsDialog] = useState<DsDialog | null>(null);
  const openDsDialog = (
    type: string,
    currentId: string | null,
    applyId: (id: string | null) => void
  ) => setDsDialog({ type, currentId, applyId });
  const closeDsDialog = () => setDsDialog(null);

  const handleDsUse = useCallback(
    (ds: SavedDataSource) => {
      if (ds.id !== dsDialog?.currentId) dsDialog?.applyId(ds.id);
      closeDsDialog();
    },
    [dsDialog]
  );

  const handleDsSave = useCallback(
    async (ds: SavedDataSource) => {
      if (ds.id !== dsDialog?.currentId) dsDialog?.applyId(ds.id);
      await onSaveDataSources(ds);
    },
    [dsDialog, onSaveDataSources]
  );

  const handleDsPublish = useCallback(
    async (ds: SavedDataSource) => {
      if (ds.id !== dsDialog?.currentId) dsDialog?.applyId(ds.id);
      closeDsDialog();
      await onPublishDataSources(ds);
    },
    [dsDialog, onPublishDataSources]
  );

  if (!selectedLayoutId) {
    return (
      <Flex
        direction="column"
        width="100%"
        height="100%"
        borderLeft="solid-25"
        borderLeftColor="neutral.6"
        bg={'bg'}
        minHeight={0}
        overflow="hidden"
      >
        <Box
          py={300}
          px={350}
          borderBottom="solid-25"
          borderBottomColor="neutral.6"
          fontSize={300}
          fontWeight={600}
          color="neutral.12"
          textTransform="uppercase"
          letterSpacing="0.06em"
        >
          {intl.formatMessage(messages.settingsPaneComponentSettings)}
        </Box>
        <Box p={700} textAlign="center" color="neutral.9" fontSize={13}>
          <Flex
            align="center"
            justify="center"
            mb={250}
            width={48}
            height={48}
            borderRadius={10}
            bg="neutral.3"
            display="inline-flex"
          >
            <Icon name="Tune" size={22} color="neutral.9" />
          </Flex>
          <Box mb={100} fontSize={350} fontWeight={500} color="neutral.12">
            {intl.formatMessage(messages.settingsPaneNothingSelected)}
          </Box>
          <Box>
            {intl.formatMessage(messages.settingsPaneNothingSelectedHint)}
          </Box>
        </Box>
      </Flex>
    );
  }

  const found = findLayout(page, selectedLayoutId);
  if (!found) return null;
  const { section, layout } = found;

  const selectedComp = selectedCompId
    ? layout.children.find((c) => c.id === selectedCompId)
    : null;

  const isLayout = !selectedComp;
  const element = selectedComp ?? layout;

  const handleLayoutChange = (updated: LayoutElement) => {
    onPageChange(updateLayout(page, section, updated));
  };

  const handleCompChange = (updated: ComponentElement) => {
    onPageChange(updateComp(page, section, layout.id, updated));
  };

  const compDef = selectedComp
    ? componentCatalog.find((c) => c.type === selectedComp.type)
    : null;

  const headerIcon = isLayout ? 'GridView' : compDef?.icon ?? 'Widgets';

  const normalizedName = ensureAllLocales(element.name ?? {}, locales);

  const handleNameChange = (locale: string, value: string) => {
    const updated = { ...normalizedName, [locale]: value };
    if (isLayout) {
      handleLayoutChange({ ...layout, name: updated });
    } else {
      handleCompChange({ ...selectedComp!, name: updated });
    }
  };

  return (
    <Flex
      direction="column"
      width="100%"
      height="100%"
      borderLeft="solid-25"
      borderLeftColor="neutral.6"
      bg="neutral.1"
      minHeight={0}
      overflowY="auto"
    >
      {/* Header */}
      <Flex
        align="center"
        gap={200}
        py={250}
        px={350}
        borderBottom="solid-25"
        borderBottomColor="neutral.6"
        flexShrink={0}
      >
        <Flex
          align="center"
          justify="center"
          borderRadius={150}
          width={26}
          height={26}
          bg="primary.3"
          flexShrink={0}
        >
          <Icon name={headerIcon} size={14} color="primary.10" />
        </Flex>
        <Box flex={1} minWidth={0}>
          <Box
            fontSize={300}
            color="neutral.9"
            textTransform="uppercase"
            letterSpacing="0.06em"
            fontWeight={600}
          >
            {isLayout ? 'Layout' : 'Component'}
          </Box>
          <Box
            fontSize={13}
            fontWeight={500}
            color="neutral.12"
            whiteSpace="nowrap"
            overflow="hidden"
            textOverflow="ellipsis"
          >
            {displayString(element.name)}
          </Box>
        </Box>
        <IconButton
          aria-label="Close"
          variant="ghost"
          size="xs"
          onPress={onClose}
        >
          <Icon name="Close" size={16} color="neutral.9" />
        </IconButton>
      </Flex>

      {/* Scrollable sections */}
      <Box flex={1} overflow="auto">
        <Accordion.Root
          key={`${selectedLayoutId}-${selectedCompId}`}
          allowsMultipleExpanded
          defaultExpandedKeys={
            compDef && compDef.schema.length > 0 ? ['content'] : ['general']
          }
          size="sm"
        >
          {/* General */}
          <SettingsGeneralSection
            isLayout={isLayout}
            element={element}
            layout={layout}
            selectedComp={selectedComp}
            normalizedName={normalizedName}
            defaultLocale={defaultLocale}
            handleNameChange={handleNameChange}
            handleLayoutChange={handleLayoutChange}
            handleCompChange={handleCompChange}
          />

          {/* Visibility */}
          <SettingsVisibilitySection
            element={element}
            layout={layout}
            selectedComp={selectedComp}
            handleLayoutChange={handleLayoutChange}
            handleCompChange={handleCompChange}
          />

          {/* Schema fields for component */}
          {selectedComp && compDef && compDef.schema.length > 0 && (
            <SettingsContentSection
              selectedComp={selectedComp}
              compDef={compDef}
              dataSourceCatalog={dataSourceCatalog}
              savedDataSources={savedDataSources}
              instancesDirty={instancesDirty}
              openDsDialog={openDsDialog}
              handleCompChange={handleCompChange}
            />
          )}

          {/* Advanced — collapsed by default */}
          <SettingsAdvancedSection />
        </Accordion.Root>
      </Box>

      {dsDialog && (
        <DataSourceConfigDialog
          key={`${dsDialog.type}:${dsDialog.currentId ?? 'new'}`}
          open={!!dsDialog}
          typeFilter={dsDialog.type}
          currentId={dsDialog.currentId}
          savedSources={savedDataSources}
          dataSourceCatalog={dataSourceCatalog}
          saving={instancesSaving}
          isUnpublished={instancesDirty}
          onUse={handleDsUse}
          onSave={handleDsSave}
          onPublish={handleDsPublish}
          onClose={closeDsDialog}
        />
      )}
    </Flex>
  );
};

export default SettingsPane;
