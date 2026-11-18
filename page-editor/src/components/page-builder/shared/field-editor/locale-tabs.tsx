import { Button, Flex } from '@commercetools/nimbus';

export function LocaleTabs({
  locales,
  activeLocale,
  onSelect,
}: {
  locales: string[];
  activeLocale: string;
  onSelect: (locale: string) => void;
}) {
  return (
    <Flex gap={100}>
      {locales.map((locale) =>
        activeLocale === locale ? (
          <Button
            key={locale}
            variant="solid"
            colorPalette="primary"
            size="xs"
            onPress={() => onSelect(locale)}
          >
            {locale}
          </Button>
        ) : (
          <Button
            key={locale}
            variant="outline"
            size="xs"
            onPress={() => onSelect(locale)}
          >
            {locale}
          </Button>
        )
      )}
    </Flex>
  );
}
