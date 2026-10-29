import { useEffect, useRef } from 'react';
import { useIntl } from 'react-intl';
import { useFormik, type FormikErrors } from 'formik';
import {
  Alert,
  Box,
  Button,
  CollapsibleMotion,
  Dialog,
  Flex,
  FormField,
  LoadingSpinner,
  MultilineTextInput,
  Switch,
  TextInput,
} from '@commercetools/nimbus';
import { KeyboardArrowDown } from '@commercetools/nimbus-icons';
import type { PreviewSettings, PreviewEnvUrl } from '../types';
import { DEFAULT_PREVIEW_SETTINGS } from '../../../hooks/use-preview-settings-connector';
import { useLocalPreviewUrl } from './use-preview-environment';
import messages from '../messages';
import { PreviewSettingsRoutes } from './preview-settings-routes';
import type {
  PreviewSettingsBind,
  PreviewSettingsDraft,
} from './preview-settings-draft';

type PreviewSettingsDialogProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  settings: PreviewSettings | null;
  /**
   * Set (to the reason, possibly empty) when the saved settings could not be
   * read. `settings` is then null for want of data, not because nothing is
   * configured, so saving the defaults would overwrite what is really stored.
   */
  loadError?: string | null;
  saving: boolean;
  /** Rejects when the save fails; the dialog then stays open with the edits intact. */
  onSave: (next: PreviewSettings) => Promise<void>;
};

const parseLocales = (text: string): string[] =>
  text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const parseVars = (text: string): Record<string, string> => {
  const out: Record<string, string> = {};
  text.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const eq = trimmed.indexOf('=');
    if (eq === -1) return;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key) out[key] = value;
  });
  return out;
};

const serializeVars = (vars?: Record<string, string>): string =>
  vars
    ? Object.entries(vars)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n')
    : '';

const fromSettings = (
  settings: PreviewSettings,
  local: PreviewEnvUrl
): PreviewSettingsDraft => {
  const envs = settings.environments;
  return {
    enabled: settings.enabled,
    prodBaseUrl: envs?.production.baseUrl ?? settings.baseUrl ?? '',
    prodToken: envs?.production.token ?? settings.token ?? '',
    stagingBaseUrl: envs?.staging.baseUrl ?? '',
    stagingToken: envs?.staging.token ?? '',
    localBaseUrl: local.baseUrl ?? '',
    localToken: local.token ?? '',
    localesText: (settings.locales ?? []).join(', '),
    defaultLocale: settings.defaultLocale ?? '',
    routeHome: settings.routes?.home ?? '',
    routeCategory: settings.routes?.category ?? '',
    routePdp: settings.routes?.pdp ?? '',
    routeContent: settings.routes?.content ?? '',
    pdpSku: settings.samples?.pdp?.sku ?? '',
    pdpSlug: settings.samples?.pdp?.slug ?? '',
    varsText: serializeVars(settings.vars),
  };
};

const toSettings = (
  draft: PreviewSettingsDraft,
  base: PreviewSettings
): PreviewSettings => {
  const locales = parseLocales(draft.localesText);
  return {
    enabled: draft.enabled,
    // Keep the legacy top-level baseUrl/token in sync with production for
    // back-compat with any reader that predates `environments`.
    baseUrl: draft.prodBaseUrl.trim(),
    token: draft.prodToken.trim() || undefined,
    environments: {
      production: {
        baseUrl: draft.prodBaseUrl.trim(),
        token: draft.prodToken.trim() || undefined,
      },
      staging: {
        baseUrl: draft.stagingBaseUrl.trim(),
        token: draft.stagingToken.trim() || undefined,
      },
    },
    defaultLocale:
      draft.defaultLocale.trim() ||
      locales[0] ||
      DEFAULT_PREVIEW_SETTINGS.defaultLocale,
    locales: locales.length ? locales : DEFAULT_PREVIEW_SETTINGS.locales,
    // An empty template means "this host has no route for this page type" —
    // buildPreviewUrl treats a falsy template as unconfigured and returns
    // null, which PreviewFrame shows as a friendly empty state. Don't coerce
    // a deliberately-cleared field back to a default that may not exist on
    // this host.
    routes: {
      home: draft.routeHome.trim(),
      category: draft.routeCategory.trim(),
      pdp: draft.routePdp.trim(),
      content: draft.routeContent.trim(),
    },
    samples: { pdp: { sku: draft.pdpSku.trim(), slug: draft.pdpSlug.trim() } },
    vars: parseVars(draft.varsText),
    homePageId: base.homePageId || DEFAULT_PREVIEW_SETTINGS.homePageId,
  };
};

/** Whether at least one environment (production, staging or local) has a base URL. */
const hasAnyBaseUrl = (draft: PreviewSettingsDraft): boolean =>
  [draft.prodBaseUrl, draft.stagingBaseUrl, draft.localBaseUrl].some((s) =>
    s.trim()
  );

/**
 * Formik errors are display strings, but nothing renders this one: the form
 * signals it by disabling Save and marking the production URL as required.
 */
const MISSING_BASE_URL: FormikErrors<PreviewSettingsDraft> = {
  prodBaseUrl: 'A base URL is required for at least one environment.',
};

const PreviewSettingsDialog = ({
  isOpen,
  onOpenChange,
  settings,
  loadError = null,
  saving,
  onSave,
}: PreviewSettingsDialogProps) => {
  const intl = useIntl();
  const base = settings ?? DEFAULT_PREVIEW_SETTINGS;
  const [localUrl, setLocalUrl] = useLocalPreviewUrl();

  const form = useFormik<PreviewSettingsDraft>({
    initialValues: fromSettings(base, localUrl),
    // Validity is derived synchronously from the values (`hasBaseUrl` below),
    // which is what the Save button and the required marker read, so Formik
    // only needs to re-check it as the final guard on submit.
    validate: (values) => (hasAnyBaseUrl(values) ? {} : MISSING_BASE_URL),
    validateOnChange: false,
    validateOnBlur: false,
    onSubmit: async (values) => {
      try {
        await onSave(toSettings(values, base));
        // Local env is per-browser — persist it to localStorage, not the CO.
        // Only once the shared settings are saved, so a failed save changes
        // nothing.
        setLocalUrl({
          baseUrl: values.localBaseUrl.trim(),
          token: values.localToken.trim() || undefined,
        });
        onOpenChange(false);
      } catch {
        // `onSave` has already told the user why (the parent toasts); keep the
        // dialog open so the edits survive for a retry.
      }
    },
  });
  const { values, dirty, resetForm } = form;

  // Seed the form from the saved settings whenever the dialog is (re)opened.
  // While it stays open, a fresh `settings` (the first load finishing late, a
  // refetch) re-seeds only a pristine form: it must never replace what the
  // user is in the middle of typing.
  const wasOpen = useRef(false);
  useEffect(() => {
    const opening = isOpen && !wasOpen.current;
    wasOpen.current = isOpen;
    if (isOpen && (opening || !dirty)) {
      resetForm({
        values: fromSettings(settings ?? DEFAULT_PREVIEW_SETTINGS, localUrl),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, settings]);

  const set = <K extends keyof PreviewSettingsDraft>(
    key: K,
    value: PreviewSettingsDraft[K]
  ) => {
    void form.setFieldValue(key, value);
  };
  const bind: PreviewSettingsBind = (key) => ({
    value: values[key],
    onChange: (value) => set(key, value),
  });

  const label = (key: keyof typeof messages) =>
    intl.formatMessage(messages[key]);

  const hasBaseUrl = hasAnyBaseUrl(values);

  const renderEnvGroup = (opts: {
    labelKey: keyof typeof messages;
    baseUrlKey: 'prodBaseUrl' | 'stagingBaseUrl' | 'localBaseUrl';
    tokenKey: 'prodToken' | 'stagingToken' | 'localToken';
    baseUrlPlaceholder: string;
    isRequired?: boolean;
    description?: string;
    defaultExpanded?: boolean;
  }) => (
    <CollapsibleMotion.Root defaultExpanded={opts.defaultExpanded}>
      <CollapsibleMotion.Trigger asChild>
        <Button
          size="xs"
          width="full"
          justifyContent="space-between"
          px={10}
          fontSize={300}
          fontWeight={600}
          color="neutral.11"
        >
          {label(opts.labelKey)}
          <KeyboardArrowDown />
        </Button>
      </CollapsibleMotion.Trigger>
      <CollapsibleMotion.Content>
        <Flex direction="column" gap={300} pt={200} px={10}>
          <FormField.Root isRequired={opts.isRequired}>
            <FormField.Label>{label('previewSettingsBaseUrl')}</FormField.Label>
            <FormField.Input>
              <TextInput
                {...bind(opts.baseUrlKey)}
                placeholder={opts.baseUrlPlaceholder}
              />
            </FormField.Input>
            {opts.description && (
              <FormField.Description>{opts.description}</FormField.Description>
            )}
          </FormField.Root>
          <FormField.Root>
            <FormField.Label>{label('previewSettingsToken')}</FormField.Label>
            <FormField.Input>
              <TextInput {...bind(opts.tokenKey)} />
            </FormField.Input>
          </FormField.Root>
        </Flex>
      </CollapsibleMotion.Content>
    </CollapsibleMotion.Root>
  );
  return (
    <Dialog.Root
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable={!saving}
      scrollBehavior="inside"
      aria-label={label('previewSettingsDialogTitle')}
    >
      <Dialog.Content>
        <Dialog.Header>
          <Dialog.Title>{label('previewSettingsDialogTitle')}</Dialog.Title>
          <Dialog.CloseTrigger isDisabled={saving} />
        </Dialog.Header>
        <Dialog.Body>
          <Flex direction="column" gap={500}>
            {loadError !== null && (
              <Alert.Root colorPalette="critical">
                <Alert.Title>{label('previewSettingsLoadFailed')}</Alert.Title>
                {loadError && (
                  <Alert.Description>{loadError}</Alert.Description>
                )}
              </Alert.Root>
            )}
            <Flex direction="column" gap={100}>
              <Switch
                isSelected={values.enabled}
                onChange={(v) => set('enabled', v)}
              >
                {label('previewSettingsEnabled')}
              </Switch>
              <Box as="span" fontSize={300} color="neutral.11">
                {label('previewSettingsEnabledHelp')}
              </Box>
            </Flex>

            <Flex direction="column" gap={300}>
              <Box as="span" fontSize={350} fontWeight={600} color="neutral.12">
                {label('previewSettingsEnvsSection')}
              </Box>
              <Box as="span" fontSize={300} color="neutral.11">
                {label('previewSettingsEnvsHelp')}
              </Box>
              <Flex as="div" direction="column" gap={300} px={10}>
                {renderEnvGroup({
                  labelKey: 'previewEnvProduction',
                  baseUrlKey: 'prodBaseUrl',
                  tokenKey: 'prodToken',
                  baseUrlPlaceholder: 'https://store.example.com',
                  isRequired: !hasBaseUrl,
                  defaultExpanded: true,
                })}
                {renderEnvGroup({
                  labelKey: 'previewEnvStaging',
                  baseUrlKey: 'stagingBaseUrl',
                  tokenKey: 'stagingToken',
                  baseUrlPlaceholder: 'https://staging.example.com',
                  defaultExpanded: Boolean(values.stagingBaseUrl),
                })}
                {renderEnvGroup({
                  labelKey: 'previewEnvLocal',
                  baseUrlKey: 'localBaseUrl',
                  tokenKey: 'localToken',
                  baseUrlPlaceholder: 'http://localhost:3000',
                  description: label('previewSettingsLocalHelp'),
                  defaultExpanded: Boolean(values.localBaseUrl),
                })}
              </Flex>
            </Flex>

            <FormField.Root>
              <FormField.Label>
                {label('previewSettingsLocales')}
              </FormField.Label>
              <FormField.Input>
                <TextInput
                  {...bind('localesText')}
                  placeholder="en-us, en-gb, de-de"
                />
              </FormField.Input>
              <FormField.Description>
                {label('previewSettingsLocalesHelp')}
              </FormField.Description>
            </FormField.Root>

            <FormField.Root>
              <FormField.Label>
                {label('previewSettingsDefaultLocale')}
              </FormField.Label>
              <FormField.Input>
                <TextInput {...bind('defaultLocale')} placeholder="en-us" />
              </FormField.Input>
            </FormField.Root>

            <PreviewSettingsRoutes bind={bind} label={label} />

            <Flex direction="column" gap={300}>
              <Box as="span" fontSize={350} fontWeight={600} color="neutral.12">
                {label('previewSettingsSectionSamples')}
              </Box>
              <FormField.Root>
                <FormField.Label>
                  {label('previewSettingsPdpSku')}
                </FormField.Label>
                <FormField.Input>
                  <TextInput {...bind('pdpSku')} />
                </FormField.Input>
              </FormField.Root>
              <FormField.Root>
                <FormField.Label>
                  {label('previewSettingsPdpSlug')}
                </FormField.Label>
                <FormField.Input>
                  <TextInput {...bind('pdpSlug')} />
                </FormField.Input>
              </FormField.Root>
            </Flex>

            <FormField.Root>
              <FormField.Label>
                {label('previewSettingsSectionVars')}
              </FormField.Label>
              <FormField.Input>
                <MultilineTextInput
                  {...bind('varsText')}
                  placeholder="brand=gap"
                />
              </FormField.Input>
              <FormField.Description>
                {label('previewSettingsVarsHelp')}
              </FormField.Description>
            </FormField.Root>
          </Flex>
        </Dialog.Body>
        <Dialog.Footer>
          <Button
            variant="outline"
            onPress={() => onOpenChange(false)}
            isDisabled={saving}
          >
            {intl.formatMessage(messages.previewSettingsCancel)}
          </Button>
          <Button
            variant="solid"
            colorPalette="primary"
            onPress={() => void form.submitForm()}
            isDisabled={
              saving || form.isSubmitting || !hasBaseUrl || loadError !== null
            }
          >
            {saving && (
              <LoadingSpinner
                size="2xs"
                colorPalette="white"
                aria-label={intl.formatMessage(messages.menuBarSave)}
              />
            )}
            {intl.formatMessage(messages.menuBarSave)}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
};

export default PreviewSettingsDialog;
