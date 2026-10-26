import { useIntl } from 'react-intl';
import { ToggleButtonGroup } from '@commercetools/nimbus';
import Icon from './shared/icon';
import messages from './messages';
type Device = 'desktop' | 'tablet' | 'mobile';

type DeviceConfig = {
  k: Device;
  icon: string;
  labelKey: keyof typeof messages;
};

const DEVICES: DeviceConfig[] = [
  { k: 'desktop', icon: 'Computer', labelKey: 'menuBarDeviceDesktop' },
  { k: 'tablet', icon: 'TabletMac', labelKey: 'menuBarDeviceTablet' },
  { k: 'mobile', icon: 'Smartphone', labelKey: 'menuBarDeviceMobile' },
];

/** Desktop / tablet / mobile preview-width switcher. */
export const MenuBarDevices = ({
  device,
  onDeviceChange,
}: {
  device: Device;
  onDeviceChange: (d: Device) => void;
}) => {
  const intl = useIntl();
  return (
    <ToggleButtonGroup.Root
      aria-label="Device preview"
      size="xs"
      colorPalette="info"
      selectedKeys={new Set([device])}
      onSelectionChange={(keys) => {
        const next = Array.from(keys)[0] as Device;
        if (next) onDeviceChange(next);
      }}
      gap={0}
    >
      {DEVICES.map((d) => (
        <ToggleButtonGroup.Button
          key={d.k}
          id={d.k}
          aria-label={intl.formatMessage(messages[d.labelKey])}
        >
          <Icon name={d.icon} size={16} />
        </ToggleButtonGroup.Button>
      ))}
    </ToggleButtonGroup.Root>
  );
};
