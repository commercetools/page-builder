import { useIntl } from 'react-intl';
import { Accordion, Stack } from '@commercetools/nimbus';
import AccordionHeader from '../shared/accordion-header';
import messages from '../messages';
import { FormField, Select, TextInput } from '@commercetools/nimbus';

/** Advanced element options; collapsed by default. */
export const SettingsAdvancedSection = () => {
  const intl = useIntl();
  return (
    <Accordion.Item value="advanced">
      <AccordionHeader
        name={intl.formatMessage(messages.settingsPaneAdvanced)}
      />
      <Accordion.Content paddingRight={800}>
        <Stack>
          <FormField.Root size={'sm'} alignContent="start">
            <FormField.Label>
              {intl.formatMessage(messages.settingsPaneCssId)}
            </FormField.Label>
            <FormField.Input>
              <TextInput
                value=""
                onChange={() => {}}
                placeholder={intl.formatMessage(
                  messages.settingsPaneCssIdPlaceholder
                )}
                size="sm"
                width="full"
              />
            </FormField.Input>
            <FormField.Description>
              {intl.formatMessage(messages.settingsPaneCssIdDescription)}
            </FormField.Description>
          </FormField.Root>

          <FormField.Root size={'sm'} alignContent="start">
            <FormField.Label>
              {intl.formatMessage(messages.settingsPaneMarketPermissions)}
            </FormField.Label>
            <FormField.Input>
              <Select.Root
                value=""
                onChange={() => {}}
                placeholder={intl.formatMessage(
                  messages.settingsPaneAllMarkets
                )}
                width="full"
                size="sm"
              >
                <Select.Options>
                  <Select.Option id="">
                    {intl.formatMessage(messages.settingsPaneAllMarkets)}
                  </Select.Option>
                  <Select.Option id="us">
                    {intl.formatMessage(messages.settingsPaneUsOnly)}
                  </Select.Option>
                  <Select.Option id="eu">
                    {intl.formatMessage(messages.settingsPaneEuOnly)}
                  </Select.Option>
                  <Select.Option id="apac">
                    {intl.formatMessage(messages.settingsPaneApacOnly)}
                  </Select.Option>
                </Select.Options>
              </Select.Root>
            </FormField.Input>
            <FormField.Description>
              {intl.formatMessage(
                messages.settingsPaneMarketPermissionsDescription
              )}
            </FormField.Description>
          </FormField.Root>
        </Stack>
      </Accordion.Content>
    </Accordion.Item>
  );
};
