import { forwardRef } from 'react';
import type { ReactNode } from 'react';
import { useIntl } from 'react-intl';
import { Box, Flex, Button, IconButton, Select } from '@commercetools/nimbus';
import Icon from '../shared/icon';
import messages from '../messages';
import PreviewOverlay from './preview-overlay';
import PreviewDropLayer from './preview-drop-layer';
import type { ElementRect, Dropzone } from './preview-bridge';

type Device = 'desktop' | 'tablet' | 'mobile';

// Shared empty defaults: a fresh `{}`/`[]` per render would hand PreviewOverlay and
// PreviewDropLayer a new prop identity on every parent render.
const NO_RECTS: Record<string, ElementRect> = {};
const NO_DROPZONES: Dropzone[] = [];
const NO_ENV_OPTIONS: { id: string; label: string }[] = [];

type PreviewFrameProps = {
  /** Fully-built preview URL, or null when it cannot be constructed. */
  url: string | null;
  /** Whether preview is configured/enabled for this project. */
  configured: boolean;
  device: Device;
  locales: string[];
  locale: string;
  onLocaleChange: (locale: string) => void;
  onRefresh: () => void;
  onConfigure?: () => void;
  /** Phase 2: element rects reported by the host bridge (id → rect). */
  rects?: Record<string, ElementRect>;
  selectedId?: string | null;
  hoveredId?: string | null;
  /** Phase 3: on-render toolbar actions for the selected element. */
  onComment?: () => void;
  commentCount?: number;
  onDuplicate?: () => void;
  onDelete?: () => void;
  /** Phase 3: palette → render drop support. */
  dropzones?: Dropzone[];
  dragActive?: boolean;
  onPaletteDrop?: (target: {
    section: string;
    layoutId: string | null;
    index: number;
  }) => void;
  /**
   * Fail-loud signal: the host rendered a page whose element ids do not match
   * the page being edited. Shows a warning banner over the iframe.
   */
  idMismatch?: boolean;
  /** Preview environment switcher (production/staging/local). */
  envOptions?: { id: string; label: string }[];
  activeEnv?: string;
  onEnvChange?: (env: string) => void;
};

const DEVICE_MAX_WIDTH: Record<Device, number> = {
  mobile: 390,
  tablet: 820,
  desktop: 1240,
};

const EmptyState = ({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: string;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) => (
  <Flex
    flex={1}
    direction="column"
    align="center"
    justify="center"
    gap={300}
    bg="neutral.2"
    p={800}
    textAlign="center"
  >
    <Icon name={icon} size={40} color="neutral.9" />
    <Box as="span" fontSize={400} fontWeight={600} color="neutral.12">
      {title}
    </Box>
    <Box as="span" fontSize={300} color="neutral.11" maxWidth={9600}>
      {body}
    </Box>
    {actionLabel && onAction && (
      <Button variant="outline" size="sm" onPress={onAction}>
        <Icon name="Settings" size={16} color="neutral.11" />
        {actionLabel}
      </Button>
    )}
  </Flex>
);

const PreviewFrame = forwardRef<HTMLIFrameElement, PreviewFrameProps>(
  (
    {
      url,
      configured,
      device,
      locales,
      locale,
      onLocaleChange,
      onRefresh,
      onConfigure,
      rects = NO_RECTS,
      selectedId = null,
      hoveredId = null,
      onComment,
      commentCount,
      onDuplicate,
      onDelete,
      dropzones = NO_DROPZONES,
      dragActive = false,
      onPaletteDrop,
      idMismatch = false,
      envOptions = NO_ENV_OPTIONS,
      activeEnv,
      onEnvChange,
    },
    ref
  ) => {
    const intl = useIntl();

    if (!configured) {
      return (
        <EmptyState
          icon="visibility_off"
          title={intl.formatMessage(messages.previewNotConfiguredTitle)}
          body={intl.formatMessage(messages.previewNotConfiguredBody)}
          actionLabel={intl.formatMessage(messages.previewConfigureSettings)}
          onAction={onConfigure}
        />
      );
    }

    if (!url) {
      return (
        <EmptyState
          icon="link_off"
          title={intl.formatMessage(messages.previewMissingUrlTitle)}
          body={intl.formatMessage(messages.previewMissingUrlBody)}
          actionLabel={intl.formatMessage(messages.previewConfigureSettings)}
          onAction={onConfigure}
        />
      );
    }

    const maxWidth = DEVICE_MAX_WIDTH[device];

    const toolbarButtons: ReactNode = (
      <>
        <IconButton
          aria-label={intl.formatMessage(messages.previewRefresh)}
          variant="ghost"
          size="xs"
          onPress={onRefresh}
        >
          <Icon name="Refresh" size={18} color="neutral.11" />
        </IconButton>
        <IconButton
          aria-label={intl.formatMessage(messages.previewOpenInNewTab)}
          variant="ghost"
          size="xs"
          onPress={() => window.open(url, '_blank', 'noopener,noreferrer')}
        >
          <Icon name="OpenInNew" size={18} color="neutral.11" />
        </IconButton>
      </>
    );

    return (
      <Flex direction="column" flex={1} minHeight={0} bg="neutral.2">
        <Flex
          align="center"
          gap={200}
          px={400}
          py={200}
          bg="bg"
          borderBottom="solid-25"
          borderBottomColor="neutral.6"
          flexShrink={0}
        >
          {envOptions.length > 0 && onEnvChange && (
            <Box flexShrink={0} minWidth={0}>
              <Select.Root
                aria-label={intl.formatMessage(messages.previewEnvLabel)}
                size="sm"
                selectedKey={activeEnv ?? null}
                onSelectionChange={(key) => {
                  if (key != null) onEnvChange(String(key));
                }}
              >
                <Select.Options>
                  {envOptions.map((o) => (
                    <Select.Option key={o.id} id={o.id}>
                      {o.label}
                    </Select.Option>
                  ))}
                </Select.Options>
              </Select.Root>
            </Box>
          )}
          {locales.length > 1 && (
            <Box flexShrink={0} minWidth={0}>
              <Select.Root
                aria-label={intl.formatMessage(messages.previewLocaleLabel)}
                size="sm"
                selectedKey={locale}
                onSelectionChange={(key) => {
                  if (key != null) onLocaleChange(String(key));
                }}
              >
                <Select.Options>
                  {locales.map((l) => (
                    <Select.Option key={l} id={l}>
                      {l}
                    </Select.Option>
                  ))}
                </Select.Options>
              </Select.Root>
            </Box>
          )}
          <Box flex={1} />
          {toolbarButtons}
        </Flex>

        <Box
          flex={1}
          minHeight={0}
          px={600}
          py={350}
          display="flex"
          justifyContent="center"
          overflow="hidden"
        >
          <Box
            position="relative"
            width="100%"
            maxWidth={maxWidth}
            height="100%"
            transition="max-width 200ms"
          >
            <Box
              asChild
              display="block"
              width="100%"
              height="100%"
              border="solid-25"
              borderColor="neutral.6"
              borderRadius={200}
              bg="neutral.1"
              shadow="2"
              overflow="hidden"
            >
              {/*
                `allow-scripts` + `allow-same-origin` together let a frame remove
                its own sandbox, so this pair is only acceptable because the frame
                loads the merchant's own configured storefront (`settings.baseUrl`),
                never third-party content. Both are required: the visual-editing
                bridge script has to run inside the frame, and dropping
                `allow-same-origin` would give the document an opaque origin, so
                `event.origin` would arrive as "null" and the origin check in
                preview-bridge.ts would reject every message. Naming the tokens
                explicitly still withholds top-navigation, downloads, pointer-lock
                and presentation, which an absent `sandbox` attribute granted.
              */}
              <iframe
                ref={ref}
                src={url}
                title={intl.formatMessage(messages.previewFrameTitle)}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              />
            </Box>
            <PreviewOverlay
              rects={rects}
              selectedId={selectedId}
              hoveredId={hoveredId}
              onComment={onComment}
              commentCount={commentCount}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
            />
            {onPaletteDrop && (
              <PreviewDropLayer
                dropzones={dropzones}
                active={dragActive}
                onDrop={onPaletteDrop}
              />
            )}
            {idMismatch && (
              <Flex
                position="absolute"
                top={0}
                left={0}
                right={0}
                zIndex={20}
                pointerEvents="none"
                align="flex-start"
                gap={200}
                py={300}
                px={400}
                bg="warning.2"
                borderBottom="solid-25"
                borderBottomColor="warning.8"
                borderTopRadius={200}
              >
                <Box flexShrink={0} mt={25}>
                  <Icon name="Warning" size={18} color="warning.11" />
                </Box>
                <Flex direction="column" gap={100} minWidth={0}>
                  <Box
                    as="span"
                    fontSize={350}
                    fontWeight={600}
                    color="warning.11"
                  >
                    {intl.formatMessage(messages.previewIdMismatchTitle)}
                  </Box>
                  <Box as="span" fontSize={300} color="warning.11">
                    {intl.formatMessage(messages.previewIdMismatchBody)}
                  </Box>
                </Flex>
              </Flex>
            )}
          </Box>
        </Box>
      </Flex>
    );
  }
);

PreviewFrame.displayName = 'PreviewFrame';

export default PreviewFrame;
