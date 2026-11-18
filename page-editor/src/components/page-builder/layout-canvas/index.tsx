import { useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { Box, Button } from '@commercetools/nimbus';
import type { Page, ComponentType, PageTypeId, Section } from '../types';
import { useProjectLocales } from '../shared/locales';
import messages from '../messages';
import SectionTitle from './section-title';
import LayoutBlock from './layout-block';
import { usePageMutations } from './use-page-mutations';

type LayoutCanvasProps = {
  page: Page;
  sections: Section[];
  pageType: PageTypeId;
  onPageChange: (page: Page) => void;
  selectedLayoutId: string | null;
  selectedCompId: string | null;
  onSelectLayout: (id: string | null) => void;
  onSelectComp: (layoutId: string, compId: string) => void;
  draggedComponentType: string | null;
  device: 'desktop' | 'tablet' | 'mobile';
  onAddLayout: (sectionId: string) => void;
  componentCatalog: ComponentType[];
  onCommentElement: (elementId: string) => void;
  commentCounts?: Record<string, number>;
};

const LayoutCanvas = ({
  page,
  sections,
  pageType,
  onPageChange,
  selectedLayoutId,
  selectedCompId,
  onSelectLayout,
  onSelectComp,
  draggedComponentType,
  device,
  onAddLayout,
  componentCatalog,
  onCommentElement,
  commentCounts,
}: LayoutCanvasProps) => {
  const intl = useIntl();
  const { defaultLocale } = useProjectLocales();
  const {
    collapsedSections,
    toggleSection,
    reorderLayout,
    duplicateLayout,
    duplicateComp,
    deleteLayout,
    deleteComp,
    updateComponents,
    dropNewComp,
    dropNewComponentIntoEmptySection,
  } = usePageMutations({
    page,
    onPageChange,
    componentCatalog,
    draggedComponentType,
    selectedLayoutId,
    onSelectLayout,
    defaultLocale,
  });
  // Set on dragstart and read back inside dragover/drop; it drives no visuals of
  // its own (that is `emptyDropActive`), so it does not need to be state.
  const draggedLayoutIdRef = useRef<string | null>(null);
  const [emptyDropActive, setEmptyDropActive] = useState<string | null>(null);

  const maxWidth = device === 'mobile' ? 390 : device === 'tablet' ? 820 : 1240;

  return (
    <Box
      flex={1}
      overflow="auto"
      bg="neutral.2"
      px={600}
      pb={2000}
      minWidth={360}
      overflowY="auto"
      minHeight={0}
    >
      <Box
        pt={350}
        margin="0 auto"
        maxWidth={maxWidth}
        transition="max-width 200ms"
      >
        {sections
          .filter(
            (s) => s.pageTypes.includes('all') || s.pageTypes.includes(pageType)
          )
          .map((section) => {
            const sectionLayouts = page[section.id] ?? [];
            const collapsed = !!collapsedSections[section.id];
            return (
              <Box
                as="section"
                key={section.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectLayout(null);
                }}
              >
                <SectionTitle
                  section={section}
                  collapsed={collapsed}
                  onToggle={() => toggleSection(section.id)}
                />

                {!collapsed && (
                  <>
                    <Box
                      gap={250}
                      display="grid"
                      gridTemplateColumns="repeat(12, 1fr)"
                      alignItems="start"
                    >
                      {sectionLayouts.length === 0 && (
                        <Box
                          borderRadius={200}
                          p={600}
                          gridColumn="1 / -1"
                          border="2px dashed"
                          borderColor={
                            emptyDropActive === section.id
                              ? 'primary.9'
                              : 'neutral.8'
                          }
                          textAlign="center"
                          color="neutral.9"
                          bg={
                            emptyDropActive === section.id
                              ? 'primary.2'
                              : 'transparent'
                          }
                          fontSize={300}
                          transition="all 120ms"
                          onDragOver={(e) => {
                            if (!draggedComponentType) return;
                            e.preventDefault();
                            e.stopPropagation();
                            setEmptyDropActive(section.id);
                          }}
                          onDragLeave={(e) => {
                            if (
                              !(e.currentTarget as HTMLElement).contains(
                                e.relatedTarget as Node
                              )
                            ) {
                              setEmptyDropActive((cur) =>
                                cur === section.id ? null : cur
                              );
                            }
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setEmptyDropActive(null);
                            dropNewComponentIntoEmptySection(section.id);
                          }}
                        >
                          {intl.formatMessage(
                            messages.layoutCanvasEmptySection
                          )}
                        </Box>
                      )}
                      {sectionLayouts.map((layout) => (
                        <LayoutBlock
                          key={layout.id}
                          layout={layout}
                          selected={
                            selectedLayoutId === layout.id && !selectedCompId
                          }
                          selectedCompId={selectedCompId}
                          onSelectLayout={() => onSelectLayout(layout.id)}
                          onSelectComp={(compId) =>
                            onSelectComp(layout.id, compId)
                          }
                          onDuplicateLayout={() =>
                            duplicateLayout(section.id, layout.id)
                          }
                          onDeleteLayout={() =>
                            deleteLayout(section.id, layout.id)
                          }
                          onDuplicateComp={(compId) =>
                            duplicateComp(section.id, layout.id, compId)
                          }
                          onDeleteComp={(compId) =>
                            deleteComp(section.id, layout.id, compId)
                          }
                          onDropNewComp={(lId) => dropNewComp(section.id, lId)}
                          onUpdateComponents={(comps) =>
                            updateComponents(section.id, layout.id, comps)
                          }
                          onLayoutDragStart={() =>
                            (draggedLayoutIdRef.current = layout.id)
                          }
                          onLayoutDragOver={() => {
                            if (
                              draggedLayoutIdRef.current &&
                              draggedLayoutIdRef.current !== layout.id
                            )
                              reorderLayout(
                                section.id,
                                draggedLayoutIdRef.current,
                                layout.id
                              );
                          }}
                          onLayoutDrop={() =>
                            (draggedLayoutIdRef.current = null)
                          }
                          draggedComponentType={draggedComponentType}
                          onCommentLayout={() => onCommentElement(layout.id)}
                          onCommentComp={(compId) => onCommentElement(compId)}
                          commentCounts={commentCounts}
                        />
                      ))}
                    </Box>

                    <Box mt={350} textAlign="center">
                      <Button
                        variant="outline"
                        size="xs"
                        onPress={() => onAddLayout(section.id)}
                        borderStyle={'dashed'}
                        borderWidth={1}
                        borderColor={'neutral.8'}
                        backgroundColor={'bg'}
                        fontSize={'300'}
                      >
                        {intl.formatMessage(
                          messages.layoutCanvasAddLayoutElement
                        )}
                      </Button>
                    </Box>
                  </>
                )}
              </Box>
            );
          })}
      </Box>
    </Box>
  );
};

export default LayoutCanvas;
