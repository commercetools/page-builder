import { useIntl } from 'react-intl';
import { Box, Dialog, Flex, Grid } from '@commercetools/nimbus';
import type { LayoutElement } from './types';
import { useProjectLocales } from './shared/locales';
import { newLayoutId } from './ids';
import messages from './messages';

const LAYOUT_PIECES: Record<LayoutElement['width'], number[]> = {
  '1/1': [12],
  '1/2': [6, 6],
  '1/3': [4, 4, 4],
  '2/3': [8, 4],
  '1/4': [3, 3, 3, 3],
  '3/4': [9, 3],
};

type LayoutPickerDialogProps = {
  open: boolean;
  onAdd: (layout: LayoutElement) => void;
  onClose: () => void;
  section: string;
};

const LayoutPickerDialog = ({
  open,
  onAdd,
  onClose,
  section,
}: LayoutPickerDialogProps) => {
  const intl = useIntl();
  const { defaultLocale } = useProjectLocales();

  const layoutOptions: {
    v: LayoutElement['width'];
    label: string;
    hint: string;
  }[] = [
    {
      v: '1/1',
      label: intl.formatMessage(messages.layoutOptionFullWidthLabel),
      hint: intl.formatMessage(messages.layoutOptionFullWidthHint),
    },
    {
      v: '1/2',
      label: intl.formatMessage(messages.layoutOptionHalfLabel),
      hint: intl.formatMessage(messages.layoutOptionHalfHint),
    },
    {
      v: '1/3',
      label: intl.formatMessage(messages.layoutOptionThirdLabel),
      hint: intl.formatMessage(messages.layoutOptionThirdHint),
    },
    {
      v: '2/3',
      label: intl.formatMessage(messages.layoutOptionTwoThirdsLabel),
      hint: intl.formatMessage(messages.layoutOptionTwoThirdsHint),
    },
    {
      v: '1/4',
      label: intl.formatMessage(messages.layoutOptionQuarterLabel),
      hint: intl.formatMessage(messages.layoutOptionQuarterHint),
    },
    {
      v: '3/4',
      label: intl.formatMessage(messages.layoutOptionThreeQuartersLabel),
      hint: intl.formatMessage(messages.layoutOptionThreeQuartersHint),
    },
  ];

  const handlePick = (width: LayoutElement['width']) => {
    const id = newLayoutId(section.toLowerCase());
    const layout: LayoutElement = {
      id,
      kind: 'layout',
      width,
      name: { [defaultLocale]: `New ${width} layout` },
      visibility: { mobile: true, tablet: true, desktop: true },
      children: [],
    };
    onAdd(layout);
    onClose();
  };

  return (
    <Dialog.Root
      isOpen={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      isDismissable
    >
      <Dialog.Content width="620px">
        <Dialog.Header>
          <Dialog.Title>
            {intl.formatMessage(messages.layoutPickerTitle, { section })}
          </Dialog.Title>
          <Dialog.CloseTrigger />
        </Dialog.Header>
        <Dialog.Body>
          <Box
            fontSize={11}
            fontWeight={600}
            color="neutral.9"
            textTransform="uppercase"
            letterSpacing="0.06em"
            marginBottom={200}
          >
            {intl.formatMessage(messages.layoutPickerSectionLabel)}
          </Box>
          <Grid gridTemplateColumns="1fr 1fr 1fr" gap={200}>
            {layoutOptions.map((opt) => (
              <Box
                key={opt.v}
                as="button"
                onClick={() => handlePick(opt.v)}
                border="solid-25"
                borderColor="neutral.6"
                borderRadius={200}
                padding={300}
                bg="neutral.1"
                cursor="pointer"
                textAlign="left"
                width="100%"
                _hover={{
                  borderColor: 'var(--nimbus-colors-primary-6)',
                  background: 'var(--nimbus-colors-primary-1)',
                }}
              >
                <Flex gap={100} marginBottom={200}>
                  {LAYOUT_PIECES[opt.v].map((w, i) => (
                    <Box
                      key={i}
                      flex={w}
                      height="20px"
                      bg="primary.2"
                      border="solid-25"
                      borderColor="primary.5"
                      borderRadius={50}
                    />
                  ))}
                </Flex>
                <Flex align="baseline" gap={100} marginBottom={50}>
                  <Box
                    as="span"
                    fontSize={13}
                    fontWeight={500}
                    color="neutral.12"
                  >
                    {opt.label}
                  </Box>
                  <Box
                    as="span"
                    fontFamily="mono"
                    fontSize={11}
                    color="neutral.9"
                  >
                    {opt.v}
                  </Box>
                </Flex>
                <Box fontSize={11} color="neutral.9" lineHeight={1.4}>
                  {opt.hint}
                </Box>
              </Box>
            ))}
          </Grid>
        </Dialog.Body>
      </Dialog.Content>
    </Dialog.Root>
  );
};

export default LayoutPickerDialog;
