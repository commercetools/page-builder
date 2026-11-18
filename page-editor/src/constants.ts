// Make sure to import the helper functions from the `ssr` entry point.
import { entryPointUriPathToPermissionKeys } from '@commercetools-frontend/application-shell/ssr';

declare const window: Window &
  typeof globalThis & {
    app: { entryPointUriPath: string };
  };

export const entryPointUriPath =
  typeof window === 'undefined'
    ? process.env.ENTRY_POINT_URI_PATH || 'page-editor-us'
    : window.app.entryPointUriPath || 'page-editor-us';

/**
 * Additional permission groups, one per editor area. Each group name is fed to
 * both `entryPointUriPathToPermissionKeys` (below) and the matching
 * `additionalOAuthScopes` entry in `custom-application-config.mjs`. The
 * framework derives a "read" (`View…`) and a "manage" (`Manage…`) permission
 * key from every group, e.g. `component-editor` yields
 * `PERMISSIONS.ViewComponentEditor` (`ViewPageEditorComponentEditor`) and
 * `PERMISSIONS.ManageComponentEditor` (`ManagePageEditorComponentEditor`).
 *
 * Names must be lowercase and may contain non-leading/trailing/adjacent
 * hyphens (per the custom-application-config schema).
 */
export const PERMISSION_GROUP_NAMES = {
  componentEditor: 'component-editor',
  dataSources: 'data-sources',
  sectionsEditor: 'sections-editor',
} as const;

export const PERMISSIONS = entryPointUriPathToPermissionKeys(
  entryPointUriPath,
  [
    PERMISSION_GROUP_NAMES.componentEditor,
    PERMISSION_GROUP_NAMES.dataSources,
    PERMISSION_GROUP_NAMES.sectionsEditor,
  ]
);
