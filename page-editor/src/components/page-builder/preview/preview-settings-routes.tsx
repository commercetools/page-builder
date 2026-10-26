import { Box, Flex, FormField, TextInput } from '@commercetools/nimbus';
import type {
  PreviewSettingsDraft,
  PreviewSettingsLabel,
} from './preview-settings-draft';

/**
 * The per-page-type route templates (home, category, PDP, content). Split out of
 * PreviewSettingsDialog, which is otherwise one long form.
 */
export const PreviewSettingsRoutes = ({
  draft,
  set,
  label,
}: {
  draft: PreviewSettingsDraft;
  set: <K extends keyof PreviewSettingsDraft>(
    key: K,
    value: PreviewSettingsDraft[K]
  ) => void;
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
        <TextInput
          value={draft.routeHome}
          onChange={(v) => set('routeHome', v)}
          placeholder="/{locale}"
        />
      </FormField.Input>
    </FormField.Root>
    <FormField.Root>
      <FormField.Label>{label('previewSettingsRouteCategory')}</FormField.Label>
      <FormField.Input>
        <TextInput
          value={draft.routeCategory}
          onChange={(v) => set('routeCategory', v)}
          placeholder="/{locale}/category/{slug}"
        />
      </FormField.Input>
    </FormField.Root>
    <FormField.Root>
      <FormField.Label>{label('previewSettingsRoutePdp')}</FormField.Label>
      <FormField.Input>
        <TextInput
          value={draft.routePdp}
          onChange={(v) => set('routePdp', v)}
          placeholder="/{locale}/{slug}/p/{sku}"
        />
      </FormField.Input>
    </FormField.Root>
    <FormField.Root>
      <FormField.Label>{label('previewSettingsRouteContent')}</FormField.Label>
      <FormField.Input>
        <TextInput
          value={draft.routeContent}
          onChange={(v) => set('routeContent', v)}
          placeholder="/{locale}/{slug}"
        />
      </FormField.Input>
    </FormField.Root>
  </Flex>
);
