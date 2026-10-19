import { useIntl } from 'react-intl';
import { Accordion, Stack } from '@commercetools/nimbus';
import AccordionHeader from '../shared/accordion-header';
import messages from '../messages';
import type { LayoutElement, ComponentElement } from '../types';
import { Toggle } from '../shared/field-editor/toggle';

type Props = {
  element: LayoutElement | ComponentElement;
  layout: LayoutElement;
  selectedComp?: ComponentElement | null;
  handleLayoutChange: (updated: LayoutElement) => void;
  handleCompChange: (updated: ComponentElement) => void;
};

/** Per-device visibility switches. */
export const SettingsVisibilitySection = ({
  element,
  layout,
  selectedComp,
  handleLayoutChange,
  handleCompChange,
}: Props) => {
  const intl = useIntl();
  return (
    <Accordion.Item value="visibility">
      <AccordionHeader
        name={intl.formatMessage(messages.settingsPaneVisibility)}
      />
      <Accordion.Content paddingRight={800}>
        <Stack>
          {(['mobile', 'tablet', 'desktop'] as const).map((d) => {
            const icon =
              d === 'desktop'
                ? 'computer'
                : d === 'tablet'
                ? 'tablet_mac'
                : 'smartphone';
            const label =
              d === 'desktop'
                ? intl.formatMessage(messages.settingsPaneShowOnDesktop)
                : d === 'tablet'
                ? intl.formatMessage(messages.settingsPaneShowOnTablet)
                : intl.formatMessage(messages.settingsPaneShowOnMobile);
            return (
              <Toggle
                key={d}
                icon={icon}
                label={label}
                value={element.visibility[d]}
                onChange={(checked) => {
                  if (selectedComp) {
                    handleCompChange({
                      ...selectedComp,
                      visibility: {
                        ...selectedComp.visibility,
                        [d]: checked,
                      },
                    });
                  } else {
                    handleLayoutChange({
                      ...layout,
                      visibility: { ...layout.visibility, [d]: checked },
                    });
                  }
                }}
              />
            );
          })}
        </Stack>
      </Accordion.Content>
    </Accordion.Item>
  );
};
