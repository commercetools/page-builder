import { useState } from 'react';
import {
  Flex,
  FormField,
  RichTextInput,
  type RichTextInputProps,
} from '@commercetools/nimbus';
import type { LocalizedString } from '../../types';
import { useProjectLocales, ensureAllLocales } from '../locales';
import { LocaleTabs } from './locale-tabs';

export function LocalizedRichText({
  label,
  value,
  onChange,
}: {
  label: string;
  value: LocalizedString;
  onChange: (v: LocalizedString) => void;
}) {
  const { locales, defaultLocale } = useProjectLocales();
  const [activeLocale, setActiveLocale] = useState(defaultLocale);
  const normalized = ensureAllLocales(value, locales);

  return (
    <FormField.Root size="sm" alignContent="start">
      <FormField.Label>{label}</FormField.Label>
      <Flex direction="column" gap={150} width="full">
        <LocaleTabs
          locales={locales}
          activeLocale={activeLocale}
          onSelect={setActiveLocale}
        />
        <RichTextInput
          value={normalized[activeLocale] ?? ''}
          onChange={(v) => onChange({ ...normalized, [activeLocale]: v })}
          width={'full' as RichTextInputProps['width']}
        />
      </Flex>
    </FormField.Root>
  );
}
