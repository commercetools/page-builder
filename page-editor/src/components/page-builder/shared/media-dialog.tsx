import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useIntl, type IntlShape } from 'react-intl';
import {
  Box,
  Button,
  Dialog,
  Flex,
  Grid,
  Image,
  LoadingSpinner,
} from '@commercetools/nimbus';
import { useMediaLibrary } from '../../../hooks/use-media-library';
import { useMediaUpload } from '../../../hooks/use-media-upload';
import type { MediaFailure, MediaFile } from '../../../service/media';
import Icon from './icon';
import { displayNameOfFile } from './media-name';
import { pickFile } from './pick-file';
import messages from '../messages';

export type MediaDialogKind = 'image' | 'video';

/**
 * What each kind of field offers to the chooser and drop zone. A convenience for the editor only:
 * the service is the authority on what it stores, and refuses the rest.
 */
const ACCEPTED: Record<MediaDialogKind, readonly string[]> = {
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'],
  video: ['video/mp4', 'video/webm'],
};

const failureMessage = (intl: IntlShape, failure: MediaFailure): string => {
  switch (failure.code) {
    case 'type_not_allowed':
      return intl.formatMessage(messages.mediaErrorTypeNotAllowed);
    case 'type_mismatch':
      return intl.formatMessage(messages.mediaErrorTypeMismatch);
    case 'file_too_large':
      return intl.formatMessage(messages.mediaErrorTooLarge);
    case 'storage_unavailable':
      return intl.formatMessage(messages.mediaErrorUnavailable);
    case 'media_not_configured':
      return intl.formatMessage(messages.mediaDialogNotConfigured);
    default:
      return intl.formatMessage(messages.mediaErrorOther, {
        message: failure.message,
      });
  }
};

type Props = {
  isOpen: boolean;
  kind: MediaDialogKind;
  onClose: () => void;
  onSelect: (file: MediaFile) => void;
};

/**
 * Pick media for a field: upload a new file (drop it, or choose it), or take one that was uploaded
 * before. An upload is selected the moment it is stored; an existing file is selected and confirmed.
 */
export default function MediaDialog({
  isOpen,
  kind,
  onClose,
  onSelect,
}: Props) {
  const intl = useIntl();
  const library = useMediaLibrary(kind, isOpen);
  const {
    upload,
    uploading,
    error: uploadError,
    clearError,
  } = useMediaUpload();

  const [selected, setSelected] = useState<MediaFile | null>(null);
  const [uploadingName, setUploadingName] = useState('');
  const [refusal, setRefusal] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // An upload finishing after the dialog was closed must not reach into the field behind it.
  const open = useRef(isOpen);

  useEffect(() => {
    open.current = isOpen;
    if (!isOpen) {
      setSelected(null);
      setRefusal(null);
      setDragging(false);
      clearError();
    }
  }, [isOpen, clearError]);

  const accepted = ACCEPTED[kind];

  const start = async (file: File) => {
    setRefusal(null);
    if (!accepted.includes(file.type)) {
      setRefusal(intl.formatMessage(messages.mediaErrorTypeNotAllowed));
      return;
    }
    setUploadingName(file.name);
    const stored = await upload(file);
    if (stored && open.current) onSelect(stored);
  };

  const choose = async () => {
    const file = await pickFile(accepted.join(','));
    if (file) await start(file);
  };

  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && !uploading) void start(file);
  };

  const problem =
    refusal ?? (uploadError ? failureMessage(intl, uploadError) : null);
  const libraryProblem = library.error
    ? failureMessage(intl, library.error)
    : null;

  return (
    <Dialog.Root
      isOpen={isOpen}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      isDismissable
      scrollBehavior="inside"
    >
      <Dialog.Content width="640px">
        <Dialog.Header>
          <Dialog.Title>
            {intl.formatMessage(
              kind === 'image'
                ? messages.mediaDialogTitleImage
                : messages.mediaDialogTitleVideo
            )}
          </Dialog.Title>
          <Dialog.CloseTrigger />
        </Dialog.Header>
        <Dialog.Body>
          <Flex direction="column" gap={300}>
            {!library.notConfigured && (
              <Flex
                role="group"
                aria-label={intl.formatMessage(messages.mediaDialogDropZone)}
                direction="column"
                align="center"
                justify="center"
                // Keeps the zone the same height while uploading, so the library below does not jump.
                minHeight="124px"
                gap={150}
                py={400}
                px={300}
                border="1px dashed"
                borderColor={dragging ? 'primary.9' : 'neutral.7'}
                borderRadius={200}
                bg={dragging ? 'primary.2' : 'neutral.2'}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (!uploading) setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={drop}
              >
                {uploading ? (
                  <>
                    <LoadingSpinner
                      aria-label={intl.formatMessage(
                        messages.mediaDialogLoading
                      )}
                    />
                    <Box fontSize={13} color="neutral.11">
                      {intl.formatMessage(messages.mediaDialogUploading, {
                        name: uploadingName,
                      })}
                    </Box>
                  </>
                ) : (
                  <>
                    <Icon name="UploadFile" size={24} color="neutral.9" />
                    <Box fontSize={13} color="neutral.11">
                      {intl.formatMessage(messages.mediaDialogDropHint)}
                    </Box>
                    <Button
                      variant="outline"
                      size="sm"
                      onPress={() => void choose()}
                    >
                      {intl.formatMessage(messages.mediaDialogChooseFile)}
                    </Button>
                    <Box fontSize={12} color="neutral.9">
                      {intl.formatMessage(
                        kind === 'image'
                          ? messages.mediaDialogAcceptsImage
                          : messages.mediaDialogAcceptsVideo
                      )}
                    </Box>
                  </>
                )}
              </Flex>
            )}

            {problem && (
              <Box role="alert" fontSize={13} color="critical.11">
                {problem}
              </Box>
            )}

            <Library
              kind={kind}
              library={library}
              problem={libraryProblem}
              selected={selected}
              onPick={setSelected}
              onConfirm={onSelect}
            />
          </Flex>
        </Dialog.Body>
        <Dialog.Footer>
          <Button slot="close" variant="outline" isDisabled={uploading}>
            {intl.formatMessage(messages.mediaDialogCancel)}
          </Button>
          <Button
            variant="solid"
            colorPalette="primary"
            isDisabled={!selected || uploading}
            onPress={() => selected && onSelect(selected)}
          >
            {intl.formatMessage(messages.mediaDialogSelect)}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
}

function Library({
  kind,
  library,
  problem,
  selected,
  onPick,
  onConfirm,
}: {
  kind: MediaDialogKind;
  library: ReturnType<typeof useMediaLibrary>;
  problem: string | null;
  selected: MediaFile | null;
  onPick: (file: MediaFile) => void;
  onConfirm: (file: MediaFile) => void;
}) {
  const intl = useIntl();
  const { files, loading, loadingMore, hasMore, notConfigured, loadMore } =
    library;

  return (
    <Flex direction="column" gap={200}>
      <Box
        fontSize={11}
        fontWeight={600}
        color="neutral.9"
        textTransform="uppercase"
        letterSpacing="0.06em"
      >
        {intl.formatMessage(messages.mediaDialogLibraryHeading)}
      </Box>

      {notConfigured ? (
        <Box fontSize={13} color="neutral.11">
          {intl.formatMessage(messages.mediaDialogNotConfigured)}
        </Box>
      ) : loading ? (
        <Flex justify="center" py={400}>
          <LoadingSpinner
            aria-label={intl.formatMessage(messages.mediaDialogLoading)}
          />
        </Flex>
      ) : (
        <>
          {problem && (
            <Box role="alert" fontSize={13} color="critical.11">
              {problem}
            </Box>
          )}
          {files.length === 0 && !problem ? (
            <Box fontSize={13} color="neutral.11">
              {intl.formatMessage(messages.mediaDialogEmpty)}
            </Box>
          ) : (
            <Grid
              gridTemplateColumns="repeat(auto-fill, minmax(120px, 1fr))"
              gap={200}
            >
              {files.map((file) => (
                <Tile
                  key={file.key}
                  file={file}
                  kind={kind}
                  isSelected={selected?.key === file.key}
                  onPick={() => onPick(file)}
                  onConfirm={() => onConfirm(file)}
                />
              ))}
            </Grid>
          )}
        </>
      )}

      {hasMore && (
        <Flex justify="center">
          <Button
            variant="outline"
            size="sm"
            isDisabled={loadingMore}
            onPress={loadMore}
          >
            {intl.formatMessage(messages.mediaDialogLoadMore)}
          </Button>
        </Flex>
      )}
    </Flex>
  );
}

function Tile({
  file,
  kind,
  isSelected,
  onPick,
  onConfirm,
}: {
  file: MediaFile;
  kind: MediaDialogKind;
  isSelected: boolean;
  onPick: () => void;
  onConfirm: () => void;
}) {
  const name = displayNameOfFile(file.name);
  return (
    <Box
      as="button"
      aria-pressed={isSelected}
      aria-label={name}
      onClick={onPick}
      onDoubleClick={onConfirm}
      border="solid-50"
      borderColor={isSelected ? 'primary.9' : 'neutral.4'}
      borderRadius={200}
      p={100}
      bg={isSelected ? 'primary.2' : 'neutral.1'}
      cursor="pointer"
      textAlign="left"
      width="100%"
      minWidth={0}
      _hover={{ borderColor: isSelected ? 'primary.9' : 'primary.6' }}
    >
      {kind === 'image' ? (
        <Image
          src={file.url}
          alt={name}
          fit="cover"
          width="100%"
          aspectRatio={1}
          borderRadius={100}
          bg="neutral.3"
        />
      ) : (
        <Flex
          align="center"
          justify="center"
          width="100%"
          aspectRatio={1}
          borderRadius={100}
          bg="neutral.3"
        >
          <Icon name="OndemandVideo" size={28} color="neutral.9" />
        </Flex>
      )}
      <Box
        as="span"
        display="block"
        mt={100}
        fontSize={11.5}
        color="neutral.11"
        whiteSpace="nowrap"
        overflow="hidden"
        textOverflow="ellipsis"
      >
        {name}
      </Box>
    </Box>
  );
}
