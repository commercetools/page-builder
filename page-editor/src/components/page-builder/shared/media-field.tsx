import { useState } from 'react';
import { useIntl } from 'react-intl';
import { Box, Button, Flex, Image } from '@commercetools/nimbus';
import { useMediaClient } from '../../../service/use-media-client';
import Icon from './icon';
import MediaDialog, { type MediaDialogKind } from './media-dialog';
import { displayNameOfUrl } from './media-name';
import messages from '../messages';

const note = (message: string) => (
  <Box fontSize={12} color="neutral.9">
    {message}
  </Box>
);

/**
 * Editor for `kind: 'image'` and `kind: 'video'` fields: upload to, or choose from, the media
 * bucket of the page-builder service. The stored value is the plain file URL, exactly as when
 * `image` was a free-text URL box, so nothing downstream (the transform, the storefront hosts)
 * cares, and a URL typed or pasted into an older page keeps working and previewing.
 *
 * Rendered inside the `FormField.Input` slot its callers already provide, so it emits no label of
 * its own.
 */
export default function MediaField({
  value,
  onChange,
  kind = 'image',
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  kind?: MediaDialogKind;
}) {
  const intl = useIntl();
  const client = useMediaClient();
  const [open, setOpen] = useState(false);
  // The URL whose thumbnail failed to load. Keyed on the URL so choosing another file tries again.
  const [brokenUrl, setBrokenUrl] = useState('');
  const url = typeof value === 'string' ? value : '';
  const name = displayNameOfUrl(url);

  // Without a service URL there is nowhere to upload to or list from.
  if (!client) {
    return note(intl.formatMessage(messages.mediaFieldNotConfigured));
  }

  const selectLabel = intl.formatMessage(
    kind === 'image'
      ? messages.mediaFieldSelectImage
      : messages.mediaFieldSelectVideo
  );

  return (
    <Flex direction="column" gap={100} width="full" minWidth={0}>
      {url ? (
        <Flex
          align="center"
          gap={150}
          py={150}
          px={200}
          borderRadius={150}
          bg="neutral.3"
          border="solid-25"
          borderColor="neutral.6"
          minWidth={0}
        >
          {kind === 'image' && brokenUrl !== url ? (
            <Image
              src={url}
              alt={name}
              fit="cover"
              width={40}
              height={40}
              borderRadius={100}
              flexShrink={0}
              onError={() => setBrokenUrl(url)}
            />
          ) : (
            // A video has no thumbnail, and a dead or stale image URL should not spill its alt text.
            <Icon
              name={kind === 'image' ? 'BrokenImage' : 'OndemandVideo'}
              size={20}
              color="neutral.9"
            />
          )}
          <Box
            flex={1}
            minWidth={0}
            fontSize={12.5}
            color="neutral.12"
            whiteSpace="nowrap"
            overflow="hidden"
            textOverflow="ellipsis"
          >
            {name ||
              intl.formatMessage(
                kind === 'image'
                  ? messages.mediaFieldImageSelected
                  : messages.mediaFieldVideoSelected
              )}
          </Box>
        </Flex>
      ) : (
        note(intl.formatMessage(messages.mediaFieldNothingSelected))
      )}

      <Flex gap={100}>
        <Button variant="outline" size="xs" onPress={() => setOpen(true)}>
          {url ? intl.formatMessage(messages.mediaFieldReplace) : selectLabel}
        </Button>
        {url && (
          <Button
            variant="ghost"
            size="xs"
            colorPalette="critical"
            onPress={() => onChange('')}
          >
            {intl.formatMessage(messages.mediaFieldRemove)}
          </Button>
        )}
      </Flex>

      <MediaDialog
        isOpen={open}
        kind={kind}
        onClose={() => setOpen(false)}
        onSelect={(file) => {
          onChange(file.url);
          setOpen(false);
        }}
      />
    </Flex>
  );
}
