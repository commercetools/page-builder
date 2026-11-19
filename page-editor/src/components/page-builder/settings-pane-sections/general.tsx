import { useIntl } from 'react-intl';
import { Accordion, Stack } from '@commercetools/nimbus';
import AccordionHeader from '../shared/accordion-header';
import messages from '../messages';
import { FormField, LocalizedField, Select } from '@commercetools/nimbus';
import type {
  ElementStyle,
  LayoutElement,
  ComponentElement,
  LocalizedString,
} from '../types';
import { WIDTH_OPTIONS } from '../page-tree';
import { ELEMENT_STYLE_OPTIONS } from '../element-styles';

type Props = {
  isLayout: boolean;
  element: LayoutElement | ComponentElement;
  layout: LayoutElement;
  selectedComp?: ComponentElement | null;
  normalizedName: LocalizedString;
  defaultLocale: string;
  handleNameChange: (locale: string, value: string) => void;
  handleLayoutChange: (updated: LayoutElement) => void;
  handleCompChange: (updated: ComponentElement) => void;
};

/** Name, layout width and element style. */
export const SettingsGeneralSection = ({
  isLayout,
  element,
  layout,
  selectedComp,
  normalizedName,
  defaultLocale,
  handleNameChange,
  handleLayoutChange,
  handleCompChange,
}: Props) => {
  const intl = useIntl();
  return (
    <Accordion.Item value="general">
      <AccordionHeader
        name={intl.formatMessage(messages.settingsPaneGeneralSettings)}
      />
      <Accordion.Content paddingRight={800}>
        <Stack>
          <LocalizedField
            label="Name"
            defaultLocaleOrCurrency={defaultLocale}
            valuesByLocaleOrCurrency={normalizedName}
            onChange={(e) =>
              handleNameChange(e.target.locale!, e.target.value as string)
            }
            size="sm"
            width="full"
          />

          {isLayout && (
            <FormField.Root size={'sm'} alignContent="start">
              <FormField.Label>
                {intl.formatMessage(messages.settingsPaneLayoutWidth)}
              </FormField.Label>
              <FormField.Input>
                <Select.Root
                  value={layout.width}
                  onChange={(key) =>
                    handleLayoutChange({
                      ...layout,
                      width: key as LayoutElement['width'],
                    })
                  }
                  placeholder={intl.formatMessage(
                    messages.settingsPaneWidthPlaceholder
                  )}
                  width={'full'}
                  size={'sm'}
                >
                  <Select.Options>
                    {WIDTH_OPTIONS.map((opt) => (
                      <Select.Option key={opt.v} id={opt.v}>
                        {opt.label}
                      </Select.Option>
                    ))}
                  </Select.Options>
                </Select.Root>
              </FormField.Input>
            </FormField.Root>
          )}

          <FormField.Root size={'sm'} alignContent="start">
            <FormField.Label>
              {intl.formatMessage(messages.settingsPaneStyle)}
            </FormField.Label>
            <FormField.Input>
              <Select.Root
                value={element.style ?? ''}
                onChange={(key) => {
                  const s = (key ?? '') as ElementStyle;
                  if (selectedComp) {
                    handleCompChange({ ...selectedComp, style: s });
                  } else {
                    handleLayoutChange({ ...layout, style: s });
                  }
                }}
                placeholder={intl.formatMessage(
                  messages.settingsPaneInheritFromPage
                )}
                width={'full'}
                size={'sm'}
              >
                <Select.Options>
                  {ELEMENT_STYLE_OPTIONS.map((opt) => (
                    <Select.Option key={opt.id} id={opt.id}>
                      {opt.label[defaultLocale] ?? opt.label['en-US']}
                    </Select.Option>
                  ))}
                </Select.Options>
              </Select.Root>
            </FormField.Input>
            <FormField.Description>
              {intl.formatMessage(messages.settingsPaneStyleDescription)}
            </FormField.Description>
          </FormField.Root>
        </Stack>
      </Accordion.Content>
    </Accordion.Item>
  );
};
