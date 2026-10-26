import { FC } from 'react';
import { Accordion, Text } from '@commercetools/nimbus';

export type Props = { name: string; rightContent?: string | number };

const AccordionHeader: FC<Props> = ({ name, rightContent }) => {
  return (
    <Accordion.Header>
      <Text fontSize={'300'} fontWeight={'600'}>
        {name}
      </Text>
      {rightContent && (
        <Accordion.HeaderRightContent>
          <Text as="span" fontSize="10.5px" color={'neutral.9'}>
            {rightContent}
          </Text>
        </Accordion.HeaderRightContent>
      )}
    </Accordion.Header>
  );
};

export default AccordionHeader;
