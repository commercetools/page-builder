import { useRef, useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  Flex,
  MultilineTextInput,
} from '@commercetools/nimbus';
import { applyMention, findActiveMentionQuery } from './mention';
import { useMentionSearch, type MentionCandidate } from './mention-directory';

type Props = {
  onSubmit: (body: string) => void | Promise<void>;
  onCancel?: () => void;
  placeholder?: string;
  submitLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  initialValue?: string;
  autoFocus?: boolean;
};

/**
 * Comment input with caret-anchored @-mention autocomplete. The suggestion list
 * is a lightweight custom overlay (not Nimbus `Menu`) so the textarea keeps
 * focus while typing; keyboard nav is handled on the textarea's onKeyDown.
 */
export const CommentComposer = ({
  onSubmit,
  onCancel,
  placeholder = 'Write a comment…  use @email to mention',
  submitLabel = 'Comment',
  cancelLabel = 'Cancel',
  busy = false,
  initialValue = '',
  autoFocus = false,
}: Props) => {
  const [value, setValue] = useState(initialValue);
  const [candidates, setCandidates] = useState<MentionCandidate[]>([]);
  const [active, setActive] = useState(0);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const search = useMentionSearch();

  const open = candidates.length > 0 && mentionStart !== null;

  const recompute = (nextValue: string) => {
    const caret = ref.current?.selectionStart ?? nextValue.length;
    const m = findActiveMentionQuery(nextValue, caret);
    if (!m) {
      setCandidates([]);
      setMentionStart(null);
      return;
    }
    setCandidates(search(m.query));
    setMentionStart(m.start);
    setActive(0);
  };

  const pick = (c: MentionCandidate) => {
    if (mentionStart === null) return;
    const caret = ref.current?.selectionStart ?? value.length;
    const next = applyMention(value, mentionStart, caret, c.email);
    setValue(next.value);
    setCandidates([]);
    setMentionStart(null);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (el) {
        el.focus();
        el.setSelectionRange(next.caret, next.caret);
      }
    });
  };

  const submit = async () => {
    const body = value.trim();
    if (!body || busy) return;
    await onSubmit(body);
    setValue('');
  };

  return (
    <Box position="relative" width="full">
      <MultilineTextInput
        ref={ref}
        value={value}
        autoFocus={autoFocus}
        rows={3}
        autoGrow
        width="full"
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(v: string) => {
          setValue(v);
          recompute(v);
        }}
        onSelect={() => recompute(value)}
        onKeyDown={(e) => {
          if (open) {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => (a + 1) % candidates.length);
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => (a - 1 + candidates.length) % candidates.length);
              return;
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              pick(candidates[active]);
              return;
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              setCandidates([]);
              setMentionStart(null);
              return;
            }
          }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void submit();
          }
        }}
      />
      {open && (
        <Box
          position="absolute"
          left={0}
          right={0}
          zIndex={20}
          mt={100}
          bg="neutral.1"
          border="solid-25"
          borderColor="neutral.6"
          borderRadius={200}
          shadow="3"
          maxHeight="220px"
          overflowY="auto"
        >
          {candidates.map((c, i) => (
            <Flex
              key={c.email}
              align="center"
              gap={200}
              px={200}
              py={150}
              cursor="pointer"
              bg={i === active ? 'primary.3' : 'transparent'}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(c);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <Avatar
                size="2xs"
                firstName={c.firstName}
                lastName={c.lastName}
              />
              <Box flex={1} minWidth={0}>
                <Box fontSize="12px" fontWeight={500} color="neutral.12">
                  {c.name}
                </Box>
                <Box
                  fontSize="11px"
                  color="neutral.9"
                  whiteSpace="nowrap"
                  overflow="hidden"
                  textOverflow="ellipsis"
                >
                  {c.email}
                </Box>
              </Box>
            </Flex>
          ))}
        </Box>
      )}
      <Flex justify="flex-end" gap={100} mt={200}>
        {onCancel && (
          <Button
            size="xs"
            variant="ghost"
            onPress={onCancel}
            isDisabled={busy}
          >
            {cancelLabel}
          </Button>
        )}
        <Button
          size="xs"
          variant="solid"
          colorPalette="primary"
          onPress={() => void submit()}
          isDisabled={!value.trim() || busy}
        >
          {submitLabel}
        </Button>
      </Flex>
    </Box>
  );
};

export default CommentComposer;
