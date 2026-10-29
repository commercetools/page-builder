import type messages from '../messages';

/** Editable, string-based mirror of PreviewSettings for the form. */
export type PreviewSettingsDraft = {
  enabled: boolean;
  prodBaseUrl: string;
  prodToken: string;
  stagingBaseUrl: string;
  stagingToken: string;
  localBaseUrl: string;
  localToken: string;
  localesText: string;
  defaultLocale: string;
  routeHome: string;
  routeCategory: string;
  routePdp: string;
  routeContent: string;
  pdpSku: string;
  pdpSlug: string;
  varsText: string;
};

/** The draft fields that hold text, i.e. the ones a text input edits. */
export type PreviewSettingsTextKey = {
  [K in keyof PreviewSettingsDraft]: PreviewSettingsDraft[K] extends string
    ? K
    : never;
}[keyof PreviewSettingsDraft];

/**
 * Connects a text input to its draft field in the form. Nimbus inputs report
 * the new string rather than a change event, so Formik's `getFieldProps` does
 * not fit them directly.
 */
export type PreviewSettingsBind = (key: PreviewSettingsTextKey) => {
  value: string;
  onChange: (value: string) => void;
};

export type PreviewSettingsLabel = (key: keyof typeof messages) => string;
