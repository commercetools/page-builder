import { Box } from '@commercetools/nimbus';
import { tokenizeBody } from './mention';

type Props = {
  body: string;
  /** When set, mentions of this email are emphasized (it's "you"). */
  currentUserEmail?: string;
};

/** Renders a comment body with `@email` mentions highlighted as inline chips. */
export const MentionText = ({ body, currentUserEmail }: Props) => {
  const tokens = tokenizeBody(body);
  const me = currentUserEmail?.toLowerCase();
  return (
    <Box
      as="span"
      fontSize="12.5px"
      color="neutral.12"
      whiteSpace="pre-wrap"
      wordBreak="break-word"
      lineHeight={1.5}
    >
      {tokens.map((t) => {
        if (!t.isMention) {
          return (
            <Box as="span" key={t.start}>
              {t.text}
            </Box>
          );
        }
        const isMe = t.email?.toLowerCase() === me;
        return (
          <Box
            as="span"
            key={t.start}
            bg={isMe ? 'warning.3' : 'primary.3'}
            color={isMe ? 'warning.11' : 'primary.11'}
            borderRadius={100}
            px={100}
            fontWeight={500}
          >
            {t.text}
          </Box>
        );
      })}
    </Box>
  );
};

export default MentionText;
