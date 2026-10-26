import { useIntl } from 'react-intl';
import Icon from '../../page-builder/shared/icon';
import messages from '../messages';
import { Box, Card, Flex, Text } from '@commercetools/nimbus';

type Props = {
  recentVersions: Array<{
    appVersion: number;
    savedAt: string;
    publishedAt: string | null;
  }>;
  formatDate: (iso: string) => string;
};

/** The last few saved versions of this page. */
export const PageDetailVersionHistory = ({
  recentVersions,
  formatDate,
}: Props) => {
  const intl = useIntl();
  return (
    <Card.Root variant="outlined">
      <Card.Header>
        <Text fontWeight={600} textStyle="sm" textTransform="uppercase">
          {intl.formatMessage(messages.recentActivity)}
        </Text>
      </Card.Header>
      <Card.Body>
        {recentVersions.map((v, i) => (
          <Flex
            key={v.appVersion}
            align="center"
            gap={12}
            padding="10px 0"
            borderTop={i ? 'solid-25' : 'none'}
            borderTopColor={i ? 'neutral.6' : undefined}
            fontSize="12.5px"
          >
            <Flex
              align="center"
              justify="center"
              width="28px"
              height="28px"
              borderRadius={100}
              bg={v.publishedAt ? 'positive.3' : 'neutral.3'}
              flexShrink={0}
            >
              <Icon
                name={v.publishedAt ? 'Publish' : 'Edit'}
                size={14}
                color={v.publishedAt ? 'positive.11' : 'neutral.9'}
              />
            </Flex>
            <Box flex={1} color="neutral.11">
              {v.publishedAt
                ? intl.formatMessage(messages.versionPublished)
                : intl.formatMessage(messages.versionDraftSaved)}
            </Box>
            <Box as="span" fontFamily="mono" fontSize={11} color="neutral.9">
              v{v.appVersion}
            </Box>
            <Box
              as="span"
              color="neutral.9"
              fontSize="11.5px"
              minWidth={80}
              textAlign="right"
            >
              {formatDate(v.savedAt)}
            </Box>
          </Flex>
        ))}
      </Card.Body>
    </Card.Root>
  );
};
