import { useIntl } from 'react-intl';
import {
  FormField,
  LocalizedField,
  RichTextInput,
  Select,
  Stack,
  Switch,
  TextInput,
  type RichTextInputProps,
} from '@commercetools/nimbus';
import type { LocalizedString, SchemaField } from '../types';
import {
  useProjectLocales,
  ensureAllLocales,
  useLocalizedDisplay,
} from '../shared/locales';
import CategoryPicker from '../shared/category-picker';
import CategoryPicksField, {
  type CategoryPick,
} from '../shared/category-picks-field';
import CategoryPinsField, {
  type CategoryPin,
} from '../shared/category-pins-field';
import ProductPicker from '../shared/product-picker';
import ProductPicksField, {
  type ProductPick,
} from '../shared/product-picks-field';
import ProductPinsField, {
  type ProductPin,
} from '../shared/product-pins-field';
import MediaField from '../shared/media-field';
import messages from '../messages';

export function ConfigForm({
  schema,
  value,
  onChange,
}: {
  schema: SchemaField[];
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}) {
  const intl = useIntl();
  const { locales, defaultLocale } = useProjectLocales();
  const displayString = useLocalizedDisplay();
  const set = (k: string, v: unknown) => onChange({ ...value, [k]: v });

  return (
    <Stack>
      {schema.map((f) => {
        const v = value[f.key];
        if (f.kind === 'select' && f.options) {
          return (
            <FormField.Root size="sm" isRequired={f.required} key={f.key}>
              <FormField.Label>{displayString(f.label)}</FormField.Label>
              <FormField.Input>
                <Select.Root
                  value={String(v ?? '')}
                  onChange={(key) => set(f.key, String(key))}
                  placeholder={intl.formatMessage(
                    messages.dataSourceConfigSelectPlaceholder
                  )}
                  size="sm"
                  width="full"
                >
                  <Select.Options>
                    {f.options.map((opt) => (
                      <Select.Option key={opt.key} id={opt.key}>
                        {displayString(opt.label)}
                      </Select.Option>
                    ))}
                  </Select.Options>
                </Select.Root>
              </FormField.Input>
            </FormField.Root>
          );
        }
        if (f.localized) {
          const normalized = ensureAllLocales(
            typeof v === 'object' && v !== null ? (v as LocalizedString) : {},
            locales
          );
          return (
            <FormField.Root size="sm" isRequired={f.required} key={f.key}>
              <FormField.Label>{displayString(f.label)}</FormField.Label>
              <FormField.Input>
                <LocalizedField
                  defaultLocaleOrCurrency={defaultLocale}
                  valuesByLocaleOrCurrency={normalized}
                  onChange={(e) =>
                    set(f.key, {
                      ...normalized,
                      [e.target.locale!]: e.target.value as string,
                    })
                  }
                  size="sm"
                  width="full"
                  label={displayString(f.label)}
                />
              </FormField.Input>
            </FormField.Root>
          );
        }
        if (f.kind === 'text' || f.kind === 'richtext') {
          return (
            <FormField.Root size="sm" isRequired={f.required} key={f.key}>
              <FormField.Label>{displayString(f.label)}</FormField.Label>
              <FormField.Input>
                {f.kind === 'richtext' ? (
                  <RichTextInput
                    value={String(v ?? '')}
                    onChange={(val) => set(f.key, val)}
                    width={'full' as RichTextInputProps['width']}
                  />
                ) : (
                  <TextInput
                    value={String(v ?? '')}
                    onChange={(val) => set(f.key, val)}
                    size={'sm'}
                    width={'full'}
                  />
                )}
              </FormField.Input>
            </FormField.Root>
          );
        }
        if (f.kind === 'number') {
          return (
            <FormField.Root size="sm" isRequired={f.required} key={f.key}>
              <FormField.Label>{displayString(f.label)}</FormField.Label>
              <FormField.Input>
                <TextInput
                  type="text"
                  inputMode="numeric"
                  value={v === '' || v == null ? '' : String(v)}
                  onChange={(val) => set(f.key, val === '' ? '' : Number(val))}
                  width={'full'}
                  size={'sm'}
                />
              </FormField.Input>
            </FormField.Root>
          );
        }
        if (f.kind === 'boolean') {
          return (
            <FormField.Root size="sm" isRequired={f.required} key={f.key}>
              <FormField.Label>{displayString(f.label)}</FormField.Label>
              <FormField.Input>
                <Switch
                  key={f.key}
                  isSelected={!!v}
                  onChange={(checked) => set(f.key, checked)}
                  size="sm"
                  isRequired={f.required}
                  mb={200}
                ></Switch>
              </FormField.Input>
            </FormField.Root>
          );
        }
        if (f.kind === 'category') {
          const cv =
            typeof v === 'object' && v !== null
              ? (v as { id?: string; key?: string })
              : {};
          return (
            <FormField.Root size="sm" isRequired={f.required} key={f.key}>
              <FormField.Label>{displayString(f.label)}</FormField.Label>
              <FormField.Input>
                <CategoryPicker
                  value={cv.id ?? ''}
                  valueKey={cv.key}
                  onChange={(cat) => set(f.key, cat)}
                />
              </FormField.Input>
            </FormField.Root>
          );
        }
        if (f.kind === 'categoryPicks') {
          return (
            <FormField.Root size="sm" isRequired={f.required} key={f.key}>
              <FormField.Label>{displayString(f.label)}</FormField.Label>
              <FormField.Input>
                <CategoryPicksField
                  value={Array.isArray(v) ? (v as CategoryPick[]) : []}
                  onChange={(picks) => set(f.key, picks)}
                />
              </FormField.Input>
            </FormField.Root>
          );
        }
        if (f.kind === 'categoryPins') {
          return (
            <FormField.Root size="sm" isRequired={f.required} key={f.key}>
              <FormField.Label>{displayString(f.label)}</FormField.Label>
              <FormField.Input>
                <CategoryPinsField
                  value={Array.isArray(v) ? (v as CategoryPin[]) : []}
                  onChange={(pins) => set(f.key, pins)}
                  limit={Number(value.limit) || 8}
                />
              </FormField.Input>
            </FormField.Root>
          );
        }
        if (f.kind === 'productPicks') {
          return (
            <FormField.Root size="sm" isRequired={f.required} key={f.key}>
              <FormField.Label>{displayString(f.label)}</FormField.Label>
              <FormField.Input>
                <ProductPicksField
                  value={Array.isArray(v) ? (v as ProductPick[]) : []}
                  onChange={(picks) => set(f.key, picks)}
                />
              </FormField.Input>
            </FormField.Root>
          );
        }
        if (f.kind === 'product') {
          const pv =
            typeof v === 'object' && v !== null
              ? (v as { id?: string; key?: string; sku?: string })
              : {};
          return (
            <FormField.Root size="sm" isRequired={f.required} key={f.key}>
              <FormField.Label>{displayString(f.label)}</FormField.Label>
              <FormField.Input>
                <ProductPicker
                  value={pv.id ?? ''}
                  valueSku={pv.sku}
                  onChange={(product) => set(f.key, product ?? '')}
                />
              </FormField.Input>
            </FormField.Root>
          );
        }
        if (f.kind === 'productPins') {
          return (
            <FormField.Root size="sm" isRequired={f.required} key={f.key}>
              <FormField.Label>{displayString(f.label)}</FormField.Label>
              <FormField.Input>
                <ProductPinsField
                  value={Array.isArray(v) ? (v as ProductPin[]) : []}
                  onChange={(pins) => set(f.key, pins)}
                  limit={Number(value.limit) || 8}
                />
              </FormField.Input>
            </FormField.Root>
          );
        }
        if (f.kind === 'image' || f.kind === 'video') {
          return (
            <FormField.Root size="sm" isRequired={f.required} key={f.key}>
              <FormField.Label>{displayString(f.label)}</FormField.Label>
              <FormField.Input>
                <MediaField
                  value={v}
                  onChange={(url) => set(f.key, url)}
                  kind={f.kind}
                />
              </FormField.Input>
            </FormField.Root>
          );
        }
        return null;
      })}
    </Stack>
  );
}
