import { useCallback, useState } from 'react';
import type { PreviewEnvUrl, PreviewSettings } from '../types';

/**
 * Preview environment support. `production`/`staging` base URLs live in the
 * settings custom object; the `local` URL and the operator's active-environment
 * choice are per-browser (localStorage) so a developer previewing against their
 * own machine never leaks that config to the shared project.
 */
export type PreviewEnv = 'production' | 'staging' | 'local';

export const PREVIEW_ENVS: PreviewEnv[] = ['production', 'staging', 'local'];

const ENV_KEY = 'pb:preview:env';
const LOCAL_URL_KEY = 'pb:preview:local';

const readLS = (key: string): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeLS = (key: string, value: string): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore quota / disabled storage */
  }
};

/** The active preview environment, persisted per-browser. Defaults to production. */
export function useActivePreviewEnv(): [PreviewEnv, (env: PreviewEnv) => void] {
  const [env, setEnv] = useState<PreviewEnv>(() => {
    const v = readLS(ENV_KEY);
    return v === 'staging' || v === 'local' ? v : 'production';
  });
  const set = useCallback((next: PreviewEnv) => {
    setEnv(next);
    writeLS(ENV_KEY, next);
  }, []);
  return [env, set];
}

/** The `local` environment's base URL + token, kept only in the browser. */
export function useLocalPreviewUrl(): [
  PreviewEnvUrl,
  (v: PreviewEnvUrl) => void
] {
  const [value, setValue] = useState<PreviewEnvUrl>(() => {
    const raw = readLS(LOCAL_URL_KEY);
    if (!raw) return { baseUrl: '' };
    try {
      const parsed = JSON.parse(raw) as PreviewEnvUrl;
      return {
        baseUrl: parsed.baseUrl ?? '',
        token: parsed.token || undefined,
      };
    } catch {
      return { baseUrl: '' };
    }
  });
  const set = useCallback((next: PreviewEnvUrl) => {
    setValue(next);
    writeLS(LOCAL_URL_KEY, JSON.stringify(next));
  }, []);
  return [value, set];
}

/**
 * Resolve the base URL + token for the active environment, falling back to the
 * legacy single `baseUrl`/`token` when an environment has none configured.
 */
export function resolveActiveEnv(
  settings:
    | Pick<PreviewSettings, 'environments' | 'baseUrl' | 'token'>
    | null
    | undefined,
  localUrl: PreviewEnvUrl,
  activeEnv: PreviewEnv
): PreviewEnvUrl {
  if (activeEnv === 'local') return localUrl;
  const fromEnvs = settings?.environments?.[activeEnv];
  if (fromEnvs?.baseUrl) return fromEnvs;
  return { baseUrl: settings?.baseUrl ?? '', token: settings?.token };
}
