import { useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { toast } from '@commercetools/nimbus';
import {
  usePreviewSettingsFetcher,
  usePreviewSettingsUpdater,
} from '../../hooks/use-preview-settings-connector';
import type { PreviewSettings } from '../page-builder/types';
import messages from './messages';

/** `saveSettings` throws whatever the GraphQL layer produced: an Error or a list of them. */
const errorMessage = (error: unknown): string | undefined => {
  const first = Array.isArray(error) ? error[0] : error;
  const message = (first as { message?: unknown } | undefined)?.message;
  return typeof message === 'string' && message ? message : undefined;
};

/**
 * The dashboard's copy of the preview settings. They live here rather than in
 * the builder, which only reads them.
 *
 * The CT version is a ref: written after each round-trip, read by the next
 * save, never rendered.
 */
export const usePreviewSettingsState = () => {
  const intl = useIntl();
  const fetcher = usePreviewSettingsFetcher();
  const { loading: saving, saveSettings } = usePreviewSettingsUpdater();
  const [settings, setSettings] = useState<PreviewSettings | null>(null);
  const ctVersionRef = useRef<number | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (fetcher.loading) return;
    if (fetcher.ctVersion !== null) ctVersionRef.current = fetcher.ctVersion;
    if (fetcher.settings) setSettings(fetcher.settings);
  }, [fetcher.loading, fetcher.ctVersion, fetcher.settings]);

  // A failed read is not "nothing configured". Without this the dialog would
  // open on the defaults, and saving them would overwrite the real settings as
  // soon as the service is reachable again.
  const loadError = settings ? null : fetcher.error ?? null;

  const save = async (next: PreviewSettings) => {
    try {
      const result = await saveSettings(next, ctVersionRef.current);
      if (result.ctVersion !== null) ctVersionRef.current = result.ctVersion;
      setSettings(next);
      toast.success({
        title: intl.formatMessage(messages.previewSettingsSaved),
      });
    } catch (error) {
      toast.error({
        title: intl.formatMessage(messages.previewSettingsSaveFailed),
        description: errorMessage(error),
      });
      // The dialog stays open on a rejection, so the edits are not lost.
      throw error;
    }
  };

  return {
    settings,
    loadError: loadError ? errorMessage(loadError) ?? '' : null,
    saving,
    isOpen,
    setIsOpen,
    save,
  };
};
