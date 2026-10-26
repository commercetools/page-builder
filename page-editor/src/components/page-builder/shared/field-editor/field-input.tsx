import {
  TextInput,
  NumberInput,
  Select,
  RichTextInput,
  type RichTextInputProps,
} from '@commercetools/nimbus';
import type { SelectOption } from '../../types';
import MediaField from '../media-field';
import { Toggle } from './toggle';

export function FieldInput({
  fieldKey,
  value,
  kind,
  options,
  onChange,
}: {
  fieldKey: string;
  value: unknown;
  kind: string;
  options?: SelectOption[];
  onChange: (v: unknown) => void;
}) {
  if (kind === 'boolean') {
    return <Toggle value={!!value} onChange={onChange} label={fieldKey} />;
  }
  if (kind === 'number') {
    return (
      <NumberInput
        value={typeof value === 'number' ? value : 0}
        onChange={(v: number) => onChange(v)}
        width="full"
        size="sm"
      />
    );
  }
  if (kind === 'select' && options) {
    return (
      <Select.Root
        value={String(value ?? '')}
        onChange={(key) => onChange(String(key))}
        placeholder="Select..."
        width="full"
        size="sm"
      >
        <Select.Options>
          {options.map((opt) => (
            <Select.Option key={opt.key} id={opt.key}>
              {typeof opt.label === 'string'
                ? opt.label
                : Object.values(opt.label)[0] ?? opt.key}
            </Select.Option>
          ))}
        </Select.Options>
      </Select.Root>
    );
  }
  if (kind === 'richtext') {
    return (
      <RichTextInput
        value={String(value ?? '')}
        onChange={(v) => onChange(v)}
        width={'full' as RichTextInputProps['width']}
      />
    );
  }
  if (kind === 'image') {
    return <MediaField value={value} onChange={onChange} />;
  }
  if (kind === 'video') {
    return <MediaField value={value} onChange={onChange} imagesOnly={false} />;
  }
  return (
    <TextInput
      value={String(value ?? '')}
      onChange={(v: string) => onChange(v)}
      aria-label={fieldKey}
      placeholder={fieldKey}
      size="sm"
      width="full"
    />
  );
}
