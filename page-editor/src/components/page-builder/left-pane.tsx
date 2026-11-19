import { useMemo, useState, type ReactNode } from 'react';
import { useIntl } from 'react-intl';
import {
  SearchInput,
  Accordion,
  IconButton,
  Badge,
  Box,
  Flex,
} from '@commercetools/nimbus';
import { KeyboardDoubleArrowLeft } from '@commercetools/nimbus-icons';
import type {
  ComponentGroup,
  ComponentType,
  LocalizedString,
  Page,
  PageTypeId,
  Section,
} from './types';
import { buildOutline } from './outline-tree';
import { WIDTH_OPTIONS } from './page-tree';
import Icon from './shared/icon';
import { useLocalizedDisplay } from './shared/locales';
import messages from './messages';
import AccordionHeader from './shared/accordion-header';
import { LeftPaneComponents } from './left-pane-components';

/** The two mutually-exclusive panels; `null` means the pane is collapsed to its icon rail. */
export type LeftPanelId = 'components' | 'outline';

/** Material-symbol glyph that stands in for each panel on the rail and the switch button. */
const PANEL_ICON: Record<LeftPanelId, string> = {
  components: 'Widgets',
  outline: 'AccountTree',
};

const COLLAPSED_WIDTH = 44;
const EXPANDED_WIDTH = 260;

type LeftPaneProps = {
  activePanel: LeftPanelId | null;
  onActivatePanel: (panel: LeftPanelId | null) => void;
  onDragStart: (type: string) => void;
  catalog: ComponentType[];
  groups: ComponentGroup[];
  pageType?: PageTypeId;
  page: Page;
  sections: Section[];
  selectedLayoutId: string | null;
  selectedCompId: string | null;
  onSelectLayout: (id: string | null) => void;
  onSelectComp: (layoutId: string, compId: string) => void;
};

const widthLabel = (width: string) =>
  WIDTH_OPTIONS.find((w) => w.v === width)?.label ?? width;

/**
 * Shared chrome for whichever panel is active: a header carrying the title, a button to switch
 * to the *other* panel, a button to collapse the pane entirely, and the panel's own search box.
 * The panel body is passed as `children` and fills the remaining height.
 */
function PanelChrome({
  title,
  otherPanel,
  onActivatePanel,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  children,
}: {
  title: string;
  otherPanel: LeftPanelId;
  onActivatePanel: (panel: LeftPanelId | null) => void;
  searchValue: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder: string;
  children: ReactNode;
}) {
  const intl = useIntl();
  const showOtherLabel = intl.formatMessage(
    otherPanel === 'components'
      ? messages.leftPaneShowComponents
      : messages.leftPaneShowOutline
  );

  return (
    <Flex direction="column" flex={1} minHeight={0}>
      <Flex
        py={250}
        px={300}
        borderBottom="solid-25"
        borderBottomColor="neutral.6"
        direction="column"
        gap={200}
        flexShrink={0}
      >
        <Flex align="center" gap={200} flexShrink={0}>
          <Box
            as="span"
            flex={1}
            fontWeight={600}
            fontSize={13}
            color="neutral.12"
          >
            {title}
          </Box>
          <IconButton
            aria-label={showOtherLabel}
            variant="ghost"
            size="xs"
            onPress={() => onActivatePanel(otherPanel)}
          >
            <Icon name={PANEL_ICON[otherPanel]} size={18} color="neutral.11" />
          </IconButton>
          <IconButton
            aria-label={intl.formatMessage(messages.leftPaneCollapse)}
            variant="outline"
            size="xs"
            onPress={() => onActivatePanel(null)}
          >
            <KeyboardDoubleArrowLeft color="neutral.11" />
          </IconButton>
        </Flex>
        <SearchInput
          value={searchValue}
          onChange={onSearchChange}
          placeholder={searchPlaceholder}
          size={'sm'}
          aria-label={searchPlaceholder}
          width={'full'}
        />
      </Flex>
      {children}
    </Flex>
  );
}

const LeftPane = ({
  activePanel,
  onActivatePanel,
  onDragStart,
  catalog,
  groups,
  pageType,
  page,
  sections,
  selectedLayoutId,
  selectedCompId,
  onSelectLayout,
  onSelectComp,
}: LeftPaneProps) => {
  const intl = useIntl();
  const displayString = useLocalizedDisplay();
  const [componentSearch, setComponentSearch] = useState('');
  const [outlineSearch, setOutlineSearch] = useState('');

  const visibleCatalog = pageType
    ? catalog.filter((c) => {
        const pts = c.pageTypes ?? ['all'];
        return pts.includes('all') || pts.includes(pageType);
      })
    : catalog;

  const filteredComponents = visibleCatalog.filter((c) =>
    displayString(c.name).toLowerCase().includes(componentSearch.toLowerCase())
  );

  const visibleSections = useMemo(
    () =>
      sections.filter(
        (s) =>
          s.pageTypes.includes('all') ||
          (pageType && s.pageTypes.includes(pageType))
      ),
    [sections, pageType]
  );

  const outline = useMemo(
    () => buildOutline(page, visibleSections),
    [page, visibleSections]
  );

  const outlineQuery = outlineSearch.trim().toLowerCase();
  const matchesOutlineQuery = (name: LocalizedString, type?: string) =>
    !outlineQuery ||
    displayString(name).toLowerCase().includes(outlineQuery) ||
    (type ?? '').toLowerCase().includes(outlineQuery);

  const iconForType = (type: string) =>
    catalog.find((c) => c.type === type)?.icon ?? 'Widgets';

  // Collapsed: a narrow rail exposing both panels; clicking either opens that specific panel.
  if (!activePanel) {
    return (
      <Flex
        direction="column"
        align="center"
        pt={200}
        gap={100}
        width={COLLAPSED_WIDTH}
        flexShrink={0}
        bg={'bg'}
        borderRight="solid-25"
        borderRightColor="neutral.6"
      >
        <IconButton
          aria-label={intl.formatMessage(messages.leftPaneShowComponents)}
          variant="ghost"
          size="xs"
          onPress={() => onActivatePanel('components')}
        >
          <Icon name={PANEL_ICON.components} size={20} color="neutral.11" />
        </IconButton>
        <IconButton
          aria-label={intl.formatMessage(messages.leftPaneShowOutline)}
          variant="ghost"
          size="xs"
          onPress={() => onActivatePanel('outline')}
        >
          <Icon name={PANEL_ICON.outline} size={20} color="neutral.11" />
        </IconButton>
      </Flex>
    );
  }

  const componentsBody = (
    <LeftPaneComponents
      catalog={catalog}
      filteredComponents={filteredComponents}
      visibleCatalog={visibleCatalog}
      groups={groups}
      componentSearch={componentSearch}
      onDragStart={onDragStart}
    />
  );

  const outlineBody = (
    <Box flex={1} overflow="auto" px={200} pb={200}>
      <Accordion.Root
        allowsMultipleExpanded
        defaultExpandedKeys={outline.map((s) => s.sectionId)}
        size={'sm'}
      >
        {outline.map((section) => {
          const filteredLayouts = outlineQuery
            ? section.layouts
                .map((layout) => ({
                  ...layout,
                  components: layout.components.filter((c) =>
                    matchesOutlineQuery(c.name, c.type)
                  ),
                }))
                .filter(
                  (layout) =>
                    matchesOutlineQuery(layout.name) ||
                    layout.components.length > 0
                )
            : section.layouts;

          return (
            <Accordion.Item key={section.sectionId} value={section.sectionId}>
              <AccordionHeader name={displayString(section.sectionName)} />
              <Accordion.Content p={0}>
                {filteredLayouts.length === 0 ? (
                  <Box
                    py={200}
                    px={100}
                    fontSize={11}
                    color="neutral.9"
                    textAlign="center"
                  >
                    {intl.formatMessage(messages.outlinePaneEmptySection)}
                  </Box>
                ) : (
                  <Flex direction="column" gap={50} pt={100} pb={150}>
                    {filteredLayouts.map((layout) => {
                      const layoutSelected =
                        selectedLayoutId === layout.id && !selectedCompId;
                      return (
                        <Box key={layout.id}>
                          <Flex
                            align="center"
                            gap={150}
                            px={150}
                            py={100}
                            borderRadius={150}
                            cursor="pointer"
                            bg={layoutSelected ? 'primary.3' : 'transparent'}
                            _hover={{
                              background: layoutSelected
                                ? undefined
                                : 'var(--nimbus-colors-neutral-2)',
                            }}
                            onClick={() => onSelectLayout(layout.id)}
                          >
                            <Icon
                              name="Dashboard"
                              size={14}
                              color="neutral.9"
                            />
                            <Box
                              as="span"
                              flex={1}
                              fontSize={12}
                              color="neutral.12"
                              whiteSpace="nowrap"
                              overflow="hidden"
                              textOverflow="ellipsis"
                            >
                              {displayString(layout.name)}
                            </Box>
                            <Badge colorPalette="neutral" size="2xs">
                              {widthLabel(layout.width)}
                            </Badge>
                          </Flex>
                          {layout.components.map((comp) => {
                            const compSelected = selectedCompId === comp.id;
                            return (
                              <Flex
                                key={comp.id}
                                align="center"
                                gap={150}
                                pl={500}
                                pr={150}
                                py={100}
                                borderRadius={150}
                                cursor="pointer"
                                bg={compSelected ? 'primary.3' : 'transparent'}
                                _hover={{
                                  background: compSelected
                                    ? undefined
                                    : 'var(--nimbus-colors-neutral-2)',
                                }}
                                onClick={() => onSelectComp(layout.id, comp.id)}
                              >
                                <Icon
                                  name={iconForType(comp.type)}
                                  size={13}
                                  color="primary.10"
                                />
                                <Box
                                  as="span"
                                  flex={1}
                                  fontSize={11.5}
                                  color="neutral.12"
                                  whiteSpace="nowrap"
                                  overflow="hidden"
                                  textOverflow="ellipsis"
                                >
                                  {displayString(comp.name)}
                                </Box>
                              </Flex>
                            );
                          })}
                        </Box>
                      );
                    })}
                  </Flex>
                )}
              </Accordion.Content>
            </Accordion.Item>
          );
        })}
      </Accordion.Root>
    </Box>
  );

  return (
    <Flex
      direction="column"
      width={EXPANDED_WIDTH}
      flexShrink={0}
      bg={'bg'}
      borderRight="solid-25"
      borderRightColor="neutral.6"
      minHeight={0}
      overflow="hidden"
    >
      {activePanel === 'components' ? (
        <PanelChrome
          title={intl.formatMessage(messages.componentsPaneTitle)}
          otherPanel="outline"
          onActivatePanel={onActivatePanel}
          searchValue={componentSearch}
          onSearchChange={setComponentSearch}
          searchPlaceholder={intl.formatMessage(messages.componentsPaneSearch)}
        >
          {componentsBody}
        </PanelChrome>
      ) : (
        <PanelChrome
          title={intl.formatMessage(messages.outlinePaneTitle)}
          otherPanel="components"
          onActivatePanel={onActivatePanel}
          searchValue={outlineSearch}
          onSearchChange={setOutlineSearch}
          searchPlaceholder={intl.formatMessage(messages.outlinePaneSearch)}
        >
          {outlineBody}
        </PanelChrome>
      )}
    </Flex>
  );
};

export default LeftPane;
