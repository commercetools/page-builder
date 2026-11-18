import { useIntl } from 'react-intl';
import { Box, Button, Menu, SplitButton } from '@commercetools/nimbus';
import Icon from './shared/icon';
import messages from './messages';

/**
 * The save / publish cluster of the menu bar, plus the workflow advance and
 * reject buttons that replace Publish while a workflow governs the page.
 */
export const MenuBarActions = ({
  saveOptions,
  canSave,
  canPublish,
  publishLoading,
  onSave,
  onSaveAndPublish,
  onPublish,
  workflowActive,
  workflowAtFinish,
  workflowNextLabel,
  onAdvance,
  canAdvance,
  onReject,
  canReject,
}: {
  saveOptions: Array<{ key: string; labelKey: keyof typeof messages }>;
  canSave: boolean;
  canPublish: boolean;
  publishLoading?: boolean;
  onSave: () => void;
  onSaveAndPublish: () => void;
  onPublish: () => void;
  workflowActive: boolean;
  workflowAtFinish: boolean;
  workflowNextLabel: string;
  onAdvance: () => void;
  canAdvance: boolean;
  onReject: () => void;
  canReject: boolean;
}) => {
  const intl = useIntl();
  return (
    <>
      {/* Save split button */}
      <SplitButton
        aria-label={intl.formatMessage(messages.menuBarSave)}
        onAction={(id) => (id === 'live' ? onSaveAndPublish() : onSave())}
        isDisabled={!canSave}
        variant="outline"
        colorPalette="primary"
        size="sm"
      >
        <Menu.Item id="save">
          {intl.formatMessage(messages.menuBarSave)}
        </Menu.Item>
        {saveOptions.map((o) => (
          <Menu.Item key={o.key} id={o.key}>
            {intl.formatMessage(messages[o.labelKey])}
          </Menu.Item>
        ))}
      </SplitButton>

      {workflowActive && canReject && (
        <Button
          variant="outline"
          colorPalette="critical"
          size="sm"
          onPress={onReject}
        >
          Reject
        </Button>
      )}

      {workflowActive && !workflowAtFinish ? (
        <Button
          variant="solid"
          colorPalette="primary"
          size="sm"
          isDisabled={!canAdvance}
          onPress={onAdvance}
        >
          {workflowNextLabel}
        </Button>
      ) : (
        <Button
          variant="solid"
          colorPalette="primary"
          size="sm"
          isDisabled={publishLoading || !canPublish}
          onPress={onPublish}
        >
          {publishLoading && (
            <Box
              as="span"
              animation="pb-spin 0.9s linear infinite"
              flexShrink={0}
            >
              <Icon name="Autorenew" size={14} />
            </Box>
          )}
          {intl.formatMessage(messages.menuBarPublish)}
        </Button>
      )}
    </>
  );
};
