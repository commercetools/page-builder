import { useIntl } from 'react-intl';
import { Flex, Text } from '@commercetools/nimbus';
import { ImagePickerField } from '@commercetools-demo/puck-image-picker';
import { useImagePickerStatus } from './image-picker-host';
import messages from '../messages';

const note = (message: string) => (
  <Text fontSize={300} color="neutral.9">
    {message}
  </Text>
);

/**
 * Editor for `kind: 'image'` and `kind: 'video'` fields: pick from, or upload to, the
 * contentools media library. The stored value is the plain asset URL, unchanged from when
 * `image` was a free-text URL box, so nothing downstream (the transform, the storefront
 * hosts) cares. `imagesOnly` toggles the underlying picker between images and any file.
 *
 * Rendered inside the `FormField.Input` slot its callers already provide, so it emits no
 * label of its own.
 */
export default function MediaField({
  value,
  onChange,
  imagesOnly = true,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  imagesOnly?: boolean;
}) {
  const intl = useIntl();
  const { configured, hasToken, loading, locale } = useImagePickerStatus();

  // `ImagePickerField` reads a context that throws when `ImagePickerHost` did not mount
  // the provider, so never render it unconfigured.
  if (!configured) {
    return note(intl.formatMessage(messages.mediaFieldNotConfigured));
  }

  // The picker exposes no props for its internals, so its selected-asset preview is
  // reached by structure: in that row an `<img>` is immediately followed by the `<div>`
  // wrapping the name `<p>` (`img + div > p`). That pattern is unique to the preview —
  // library-modal tiles caption in a plain `<div>` (no `<p>`) and the upload modal has no
  // `<img>` — and both modals render in-tree under this wrapper, so the scoping matters.
  // Emotion classes on those elements are beaten by a descendant selector without
  // `!important`.
  const previewCss = imagesOnly
    ? // Image: the thumbnail is the useful preview; the file name is a raw storage id, hide it.
      { '& img + div > p': { display: 'none' } }
    : // Video: the picker can only preview a URL as `<img>`, which renders broken for a
      // video, so hide that thumbnail and keep the (truncated) file name as the indicator.
      { '& img:has(+ div > p)': { display: 'none' } };

  return (
    <Flex
      direction="column"
      gap={100}
      width="full"
      minWidth={0}
      css={previewCss}
    >
      <ImagePickerField
        value={typeof value === 'string' ? value : ''}
        onChange={onChange}
        imagesOnly={imagesOnly}
        locale={locale}
      />
      {/* Suppressed while loading so the note doesn't flash before the token arrives. */}
      {!hasToken &&
        !loading &&
        note(intl.formatMessage(messages.mediaFieldNoToken))}
    </Flex>
  );
}
