import { Switch } from '@commercetools/nimbus';
import Icon from '../icon';

export function Toggle({
  value,
  onChange,
  label,
  icon,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
  icon?: string;
}) {
  return (
    <Switch isSelected={value} onChange={onChange} size="sm">
      {icon && <Icon name={icon} size={16} color="neutral.11" />}
      {label}
    </Switch>
  );
}
