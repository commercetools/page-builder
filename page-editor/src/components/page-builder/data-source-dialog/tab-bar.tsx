import { useIntl } from 'react-intl';
import { Box, Tabs } from '@commercetools/nimbus';
import type { SavedDataSource } from '../types';
import Icon from '../shared/icon';
import messages from '../messages';
import type { DialogTab } from '../data-source-dialog-state';

/** The three-way tab strip: browse saved sources, create one, or edit one. */
export const DataSourceDialogTabBar = ({
  tab,
  matchingSaved,
}: {
  tab: DialogTab;
  matchingSaved: SavedDataSource[];
}) => {
  const intl = useIntl();
  return (
    <Tabs.List>
      <Tabs.Tab id="existing">
        <Icon
          name="Folder"
          size={14}
          color={tab === 'existing' ? 'primary.11' : 'neutral.11'}
        />
        {intl.formatMessage(messages.dataSourceConfigTabUseSaved)}
        <Box
          as="span"
          fontSize={11}
          color="neutral.9"
          fontWeight={500}
          marginLeft={2}
        >
          {matchingSaved.length}
        </Box>
      </Tabs.Tab>
      <Tabs.Tab id="new">
        <Icon
          name="AddCircleOutline"
          size={14}
          color={tab === 'new' ? 'primary.11' : 'neutral.11'}
        />
        {intl.formatMessage(messages.dataSourceConfigTabCreateNew)}
      </Tabs.Tab>
      {tab === 'edit' && (
        <Tabs.Tab id="edit">
          <Icon name="Edit" size={14} color="primary.11" />
          {intl.formatMessage(messages.dataSourceConfigEditConfiguration)}
        </Tabs.Tab>
      )}
    </Tabs.List>
  );
};
