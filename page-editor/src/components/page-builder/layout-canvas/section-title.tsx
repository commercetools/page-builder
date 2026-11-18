import { Box, Flex } from '@commercetools/nimbus';
import Icon from '../shared/icon';
import type { Section } from '../types';
import { useLocalizedDisplay } from '../shared/locales';

type SectionTitleProps = {
  section: Section;
  collapsed: boolean;
  onToggle: () => void;
};

const SectionTitle = ({ section, collapsed, onToggle }: SectionTitleProps) => {
  const displayString = useLocalizedDisplay();

  return (
    <Flex
      align="center"
      gap={250}
      onClick={onToggle}
      pt={450}
      px={100}
      pb={200}
      cursor="pointer"
      userSelect="none"
    >
      <Flex
        align="center"
        justify="center"
        borderRadius={150}
        width={24}
        height={24}
        bg="neutral.3"
        flexShrink={0}
      >
        <Icon name={section.icon} size={16} color="neutral.9" />
      </Flex>
      <Flex direction="column" lineHeight={1.2}>
        <Box
          fontSize={11}
          fontWeight={700}
          letterSpacing="0.12em"
          color="neutral.12"
        >
          {displayString(section.name).toUpperCase()} SECTION
        </Box>
        <Box fontSize={11} color="neutral.9">
          {displayString(section.description)}
        </Box>
      </Flex>
      <Box flex={1} height={1} bg="neutral.6" marginLeft={100} />
      <Flex as="span" align="center" justify="center" flexShrink={0}>
        <Icon
          name={collapsed ? 'ExpandMore' : 'ExpandLess'}
          size={18}
          color="neutral.9"
        />
      </Flex>
    </Flex>
  );
};

export default SectionTitle;
