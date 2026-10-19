import { useIntl } from 'react-intl';
import { useHistory, useRouteMatch } from 'react-router-dom';
import {
  Badge,
  Box,
  Flex,
  IconButton,
  Separator,
  ToggleButtonGroup,
  Toolbar,
} from '@commercetools/nimbus';
import Icon from './shared/icon';
import messages from './messages';
import { MenuBarActions } from './menu-bar-actions';
import { MenuBarDevices } from './menu-bar-devices';

type Device = 'desktop' | 'tablet' | 'mobile';
type ViewMode = 'edit' | 'preview';

type MenuBarProps = {
  pageId: string;
  pageTitle: string;
  version?: string;
  state?: string;
  device: Device;
  onDeviceChange: (d: Device) => void;
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
  previewEnabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  saveState: 'saved' | 'saving' | 'dirty';
  canSave: boolean;
  canPublish: boolean;
  publishLoading?: boolean;
  onSave: () => Promise<void>;
  onPublish: () => Promise<void>;
  onSaveAndPublish: () => Promise<void>;
  onOpenComments: () => void;
  unreadCount: number;
  workflowActive: boolean;
  workflowNextLabel: string;
  workflowAtFinish: boolean;
  onAdvance: () => void;
  canAdvance: boolean;
  onReject: () => void;
  canReject: boolean;
  onOpenHistory: () => void;
  workflowName?: string;
  workflowStageLabel?: string;
};

const MenuBar = ({
  pageId,
  pageTitle,
  version,
  state,
  device,
  onDeviceChange,
  viewMode,
  onViewModeChange,
  previewEnabled,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  saveState,
  canSave,
  canPublish,
  publishLoading,
  onSave,
  onPublish,
  onSaveAndPublish,
  onOpenComments,
  unreadCount,
  workflowActive,
  workflowNextLabel,
  workflowAtFinish,
  onAdvance,
  canAdvance,
  onReject,
  canReject,
  onOpenHistory,
  workflowName,
  workflowStageLabel,
}: MenuBarProps) => {
  const intl = useIntl();
  const history = useHistory();
  const match = useRouteMatch();
  const basePath = match.url.split('/').slice(0, -2).join('/');

  const pill: { colorPalette: string; labelKey: keyof typeof messages } =
    saveState === 'dirty'
      ? { colorPalette: 'warning', labelKey: 'menuBarStateUnsaved' }
      : state === 'published' && !canPublish
      ? { colorPalette: 'positive', labelKey: 'menuBarStatePublished' }
      : state === undefined
      ? { colorPalette: 'neutral', labelKey: 'menuBarStateNoDraft' }
      : { colorPalette: 'info', labelKey: 'menuBarStateSaved' };

  // When a workflow governs the page, remove the direct "Save & make live"
  // bypass so publishing only happens through the workflow's Finish step.
  const saveOptions: Array<{ key: string; labelKey: keyof typeof messages }> =
    workflowActive ? [] : [{ key: 'live', labelKey: 'menuBarSaveAndMakeLive' }];

  return (
    <Toolbar
      variant="outline"
      borderRadius={0}
      mb={'1px'}
      bg={'bg'}
      flexShrink={0}
      px={300}
    >
      {/* Back button */}
      <IconButton
        aria-label={intl.formatMessage(messages.menuBarBackTitle)}
        variant="outline"
        size="xs"
        onPress={() => {
          const isPdpOverride = pageId.startsWith('pdp-');
          const nodeId = isPdpOverride ? pageId.slice(4) : pageId;
          const view = isPdpOverride ? 'pdp' : 'plp';
          history.push(`${basePath}/pages?node=${nodeId}&view=${view}`);
        }}
      >
        <Icon name="ArrowBack" size={16} color="neutral.11" />
      </IconButton>

      <Separator orientation={'vertical'} height={24} />

      {/* Page title cluster */}
      <Flex
        align="center"
        gap={200}
        padding="0 8px"
        height={32}
        minWidth={0}
        flexShrink={0}
      >
        <Flex
          align="center"
          justify="center"
          borderRadius={100}
          width={22}
          height={22}
          bg="primary.3"
          flexShrink={0}
        >
          <Icon name="Web" size={13} color="primary.10" />
        </Flex>
        <Flex direction="column" align="flex-start" lineHeight={1.15}>
          <Box
            as="span"
            fontSize="12.5px"
            fontWeight={500}
            color="neutral.12"
            whiteSpace="nowrap"
            overflow="hidden"
            textOverflow="ellipsis"
            maxWidth={5200}
          >
            {pageTitle}
          </Box>
          <Box as="span" fontSize="10.5px" color="neutral.9">
            {intl.formatMessage(messages.menuBarPageLabel)}
          </Box>
        </Flex>
      </Flex>

      {/* Status pill */}
      <Badge size="2xs" colorPalette={pill.colorPalette}>
        {intl.formatMessage(messages[pill.labelKey])}
        {version && state !== undefined && (
          <>
            <Box as="span" opacity={0.55} mx={100}>
              ·
            </Box>
            <Box as="span" fontFamily="mono">
              {version}
            </Box>
          </>
        )}
      </Badge>

      <MenuBarDevices device={device} onDeviceChange={onDeviceChange} />
      <Separator orientation={'vertical'} height={24} />

      {/* Undo / Redo */}
      <IconButton
        aria-label={intl.formatMessage(messages.menuBarUndo)}
        variant="ghost"
        size="xs"
        isDisabled={!canUndo}
        onPress={onUndo}
      >
        <Icon name="Undo" size={18} color="neutral.11" />
      </IconButton>
      <IconButton
        aria-label={intl.formatMessage(messages.menuBarRedo)}
        variant="ghost"
        size="xs"
        isDisabled={!canRedo}
        onPress={onRedo}
      >
        <Icon name="Redo" size={18} color="neutral.11" />
      </IconButton>

      {/* Save state — centered */}
      <Flex
        align="center"
        justify="center"
        gap={150}
        flex={1}
        fontSize="11.5px"
        color="neutral.9"
      >
        {saveState === 'saving' && (
          <>
            <Box
              as="span"
              animation="pb-spin 0.9s linear infinite"
              flexShrink={0}
            >
              <Icon name="Autorenew" size={14} />
            </Box>
            {intl.formatMessage(messages.menuBarSaving)}
          </>
        )}
        {saveState === 'saved' && (
          <>
            <Icon name="CloudDone" size={14} color="positive.9" />
            {intl.formatMessage(messages.menuBarAllChangesSaved)}
          </>
        )}
        {saveState === 'dirty' && (
          <>
            <Icon name="Edit" size={14} color="neutral.9" />
            {intl.formatMessage(messages.menuBarUnsavedChanges)}
          </>
        )}
      </Flex>

      {/* View mode toggle (edit / preview) */}
      {previewEnabled && (
        <ToggleButtonGroup.Root
          aria-label={intl.formatMessage(messages.menuBarViewMode)}
          size="xs"
          colorPalette="info"
          selectedKeys={new Set([viewMode])}
          onSelectionChange={(keys) => {
            const next = Array.from(keys)[0] as ViewMode;
            if (next) onViewModeChange(next);
          }}
          gap={0}
        >
          <ToggleButtonGroup.Button
            id="edit"
            aria-label={intl.formatMessage(messages.menuBarModeEdit)}
          >
            <Icon name="Edit" size={16} />
          </ToggleButtonGroup.Button>
          <ToggleButtonGroup.Button
            id="preview"
            aria-label={intl.formatMessage(messages.menuBarModePreview)}
          >
            <Icon name="Visibility" size={16} />
          </ToggleButtonGroup.Button>
        </ToggleButtonGroup.Root>
      )}

      {workflowActive && (
        <Badge size="2xs" colorPalette="info">
          {workflowName || 'Workflow'}
          {workflowStageLabel ? ` · ${workflowStageLabel}` : ''}
        </Badge>
      )}

      <MenuBarActions
        saveOptions={saveOptions}
        canSave={canSave}
        canPublish={canPublish}
        publishLoading={publishLoading}
        onSave={onSave}
        onSaveAndPublish={onSaveAndPublish}
        onPublish={onPublish}
        workflowActive={workflowActive}
        workflowAtFinish={workflowAtFinish}
        workflowNextLabel={workflowNextLabel}
        onAdvance={onAdvance}
        canAdvance={canAdvance}
        onReject={onReject}
        canReject={canReject}
      />
      <Separator orientation={'vertical'} height={24} />

      {/* Comments */}
      <IconButton
        aria-label={intl.formatMessage(messages.menuBarComments)}
        variant="ghost"
        size="xs"
        onPress={onOpenComments}
        position="relative"
      >
        <Icon name="ChatBubbleOutline" size={18} color="neutral.11" />
        {unreadCount > 0 && (
          <Box
            as="span"
            borderRadius="full"
            position="absolute"
            top={4}
            right={4}
            width={6}
            height={6}
            bg="critical.9"
          />
        )}
      </IconButton>

      {/* Version / workflow history */}
      <IconButton
        aria-label={intl.formatMessage(messages.menuBarVersionHistory)}
        variant="ghost"
        size="xs"
        onPress={onOpenHistory}
      >
        <Icon name="History" size={18} color="neutral.11" />
      </IconButton>
      {/*</Flex>*/}
    </Toolbar>
  );
};

export default MenuBar;
