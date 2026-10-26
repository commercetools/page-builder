import { useEffect, useRef, useState } from 'react';
import {
  usePreviewSettingsFetcher,
  usePreviewSettingsUpdater,
} from '../../hooks/use-preview-settings-connector';
import type { PreviewSettings } from '../page-builder/types';

/**
 * The dashboard's copy of the preview settings. They live here rather than in
 * the builder, which only reads them.
 *
 * The CT version is a ref: written after each round-trip, read by the next
 * save, never rendered.
 */
export const usePreviewSettingsState = () => {
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

  const save = async (next: PreviewSettings) => {
    const result = await saveSettings(next, ctVersionRef.current);
    if (result.ctVersion !== null) ctVersionRef.current = result.ctVersion;
    setSettings(next);
  };

  return { settings, saving, isOpen, setIsOpen, save };
};
