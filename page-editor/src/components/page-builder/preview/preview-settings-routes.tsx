import { Box, Flex, FormField, TextInput } from '@commercetools/nimbus';
import type {
  PreviewSettingsBind,
  PreviewSettingsLabel,
} from './preview-settings-draft';

/**
 * The per-page-type route templates (home, category, PDP, content). Split out of
 * PreviewSettingsDialog, which is otherwise one long form.
 */
export const PreviewSettingsRoutes = ({
  bind,
  label,
}: {
  bind: PreviewSettingsBind;
  label: PreviewSettingsLabel;
}) => (
  <Flex direction="column" gap={300}>
    <Box as="span" fontSize={350} fontWeight={600} color="neutral.12">
      {label('previewSettingsSectionRoutes')}
    </Box>
    <Box as="span" fontSize={300} color="neutral.11">
      {label('previewSettingsRoutesHelp')}
    </Box>
    <FormField.Root>
      <FormField.Label>{label('previewSettingsRouteHome')}</FormField.Label>
      <FormField.Input>
        <TextInput {...bind('routeHome')} placeholder="/{locale}" />
      </FormField.Input>
    </FormField.Root>
    <FormField.Root>
      <FormField.Label>{label('previewSettingsRouteCategory')}</FormField.Label>
      <FormField.Input>
        <TextInput
          {...bind('routeCategory')}
          placeholder="/{locale}/category/{slug}"
        />
      </FormField.Input>
    </FormField.Root>
    <FormField.Root>
      <FormField.Label>{label('previewSettingsRoutePdp')}</FormField.Label>
      <FormField.Input>
        <TextInput
          {...bind('routePdp')}
          placeholder="/{locale}/{slug}/p/{sku}"
        />
      </FormField.Input>
    </FormField.Root>
    <FormField.Root>
      <FormField.Label>{label('previewSettingsRouteContent')}</FormField.Label>
      <FormField.Input>
        <TextInput {...bind('routeContent')} placeholder="/{locale}/{slug}" />
      </FormField.Input>
    </FormField.Root>
  </Flex>
);
