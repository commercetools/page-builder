import { Select, FormField, LocalizedField } from '@commercetools/nimbus';
import type { SchemaField, LocalizedString } from '../../types';
import { useProjectLocales, ensureAllLocales } from '../locales';
import { Toggle } from './toggle';
import { FieldInput } from './field-input';
import { LocalizedRichText } from './localized-rich-text';

export function SchemaFieldEditor({
  field,
  value,
  onChange,
}: {
  field: SchemaField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const { locales, defaultLocale } = useProjectLocales();
  const label =
    typeof field.label === 'string'
      ? field.label
      : Object.values(field.label)[0] ?? field.key;

  if (field.kind === 'boolean') {
    return <Toggle label={label} value={!!value} onChange={onChange} />;
  }

  if (field.localized) {
    const locValue = (
      typeof value === 'object' && value !== null ? value : {}
    ) as LocalizedString;

    if (field.kind === 'richtext') {
      return (
        <LocalizedRichText label={label} value={locValue} onChange={onChange} />
      );
    }

    if (field.kind === 'select' && field.options) {
      return (
        <FormField.Root
          size="sm"
          isRequired={field.required}
          alignContent="start"
        >
          <FormField.Label>{label}</FormField.Label>
          <FormField.Input>
            <Select.Root
              value={locValue[defaultLocale] ?? ''}
              onChange={(k) =>
                onChange({ ...locValue, [defaultLocale]: String(k) })
              }
              placeholder="Select..."
              width="full"
              size="sm"
            >
              <Select.Options>
                {field.options.map((opt) => (
                  <Select.Option key={opt.key} id={opt.key}>
                    {typeof opt.label === 'object'
                      ? opt.label[defaultLocale] ??
                        Object.values(opt.label)[0] ??
                        opt.key
                      : opt.label}
                  </Select.Option>
                ))}
              </Select.Options>
            </Select.Root>
          </FormField.Input>
        </FormField.Root>
      );
    }

    const normalized = ensureAllLocales(locValue, locales);
    return (
      <LocalizedField
        label={label}
        defaultLocaleOrCurrency={defaultLocale}
        valuesByLocaleOrCurrency={normalized}
        onChange={(e) =>
          onChange({
            ...normalized,
            [e.target.locale!]: e.target.value as string,
          })
        }
        size="sm"
        width="full"
      />
    );
  }

  return (
    <FormField.Root size="sm" isRequired={field.required} alignContent="start">
      <FormField.Label>{label}</FormField.Label>
      <FormField.Input>
        <FieldInput
          fieldKey={field.key}
          value={value}
          kind={field.kind}
          options={field.options}
          onChange={onChange}
        />
      </FormField.Input>
    </FormField.Root>
  );
}
