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

export type PreviewSettingsLabel = (key: keyof typeof messages) => string;
