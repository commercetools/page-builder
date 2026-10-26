import { useIntl } from 'react-intl';
import { Accordion, Box, Flex } from '@commercetools/nimbus';
import type { ComponentGroup, ComponentType } from './types';
import { ComponentCard } from './shared/component-card';
import AccordionHeader from './shared/accordion-header';
import Icon from './shared/icon';
import { useLocalizedDisplay } from './shared/locales';
import messages from './messages';

/** The palette body of the left pane: every component the page type allows. */
export const LeftPaneComponents = ({
  catalog,
  filteredComponents,
  visibleCatalog,
  groups,
  componentSearch,
  onDragStart,
}: {
  catalog: ComponentType[];
  /** `catalog` narrowed by page type and the search box. */
  filteredComponents: ComponentType[];
  /** `catalog` narrowed by page type only, for the grouped listing. */
  visibleCatalog: ComponentType[];
  groups: ComponentGroup[];
  componentSearch: string;
  onDragStart: (type: string) => void;
}) => {
  const intl = useIntl();
  const displayString = useLocalizedDisplay();
  return (
    <Box flex={1} overflow="auto" px={200} pb={200}>
      {catalog.length === 0 ? (
        <Flex
          direction="column"
          align="center"
          gap={150}
          py={400}
          px={300}
          textAlign="center"
        >
          <Icon name="Widgets" size={28} color="neutral.9" />
          <Box as="span" fontSize={13} fontWeight={600} color="neutral.12">
            {intl.formatMessage(messages.componentsPaneEmptyTitle)}
          </Box>
          <Box as="span" fontSize={11} color="neutral.9" lineHeight={1.3}>
            {intl.formatMessage(messages.componentsPaneEmptyBody)}
          </Box>
        </Flex>
      ) : componentSearch ? (
        <Box gap={150} display="grid" gridTemplateColumns="1fr 1fr" pt={100}>
          {filteredComponents.map((c) => (
            <ComponentCard
              key={c.type}
              comp={c}
              displayString={displayString}
              onDragStart={onDragStart}
            />
          ))}
        </Box>
      ) : (
        <Accordion.Root
          allowsMultipleExpanded
          defaultExpandedKeys={groups.map((g) => g.key)}
          size={'sm'}
        >
          {groups.map((group) => {
            const comps = visibleCatalog.filter(
              (c) => c.groupKey === group.key
            );
            if (!comps.length) return null;
            return (
              <Accordion.Item key={group.key} value={group.key}>
                <AccordionHeader
                  name={displayString(group.name)}
                  rightContent={comps.length}
                />
                <Accordion.Content p={0}>
                  <Box
                    gap={150}
                    display="grid"
                    gridTemplateColumns="1fr 1fr"
                    pt={100}
                  >
                    {comps.map((c) => (
                      <ComponentCard
                        key={c.type}
                        comp={c}
                        displayString={displayString}
                        onDragStart={onDragStart}
                      />
                    ))}
                  </Box>
                </Accordion.Content>
              </Accordion.Item>
            );
          })}
        </Accordion.Root>
      )}
    </Box>
  );
};
