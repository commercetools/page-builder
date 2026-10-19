/**
 * `sync` — push host definitions to CT as a DRAFT.
 *
 * For each catalog key: GET the existing object, append a new draft version unless the
 * payload is unchanged (idempotent), and PUT with optimistic concurrency. `published` is
 * never touched — publishing is the separate `publish` command.
 */

import {
  type CatalogBundle,
  type CatalogKey,
  type CombinedCatalog,
} from '../contract.js';
import { getCustomObject, putCustomObject } from '../core/ct-client.js';
import { appendVersion } from '../catalog/envelope.js';
import { validateBundle } from '../catalog/validate.js';
import { ALL_KEYS, payloadForKey, type SyncContext } from './context.js';

export type SyncAction = 'created' | 'updated' | 'unchanged' | 'skipped';

export type SyncOptions = {
  ctx: SyncContext;
  bundle: CatalogBundle;
  only?: CatalogKey[];
  dryRun?: boolean;
  /** ISO timestamp stamped on new versions. */
  now: string;
};

export type SyncResult = {
  perKey: Array<{ key: CatalogKey; action: SyncAction; versionCount: number }>;
  validation: ReturnType<typeof validateBundle>;
};

export async function runSync(opts: SyncOptions): Promise<SyncResult> {
  const { ctx, bundle, dryRun, now } = opts;
  const keys = opts.only?.length ? opts.only : ALL_KEYS;

  const validation = validateBundle(bundle);
  if (validation.errors.length) {
    throw new Error(
      `catalog validation failed:\n  - ${validation.errors.join('\n  - ')}`
    );
  }

  // Each key is its own custom object with its own version, so no iteration
  // depends on another and they can all run together; `Promise.all` keeps
  // `perKey` in `keys` order. Note this is not transactional either way — a
  // failure part-way through leaves the keys that already succeeded written,
  // exactly as the previous sequential loop did.
  const perKey = await Promise.all(
    keys.map(async (key): Promise<SyncResult['perKey'][number]> => {
      const payload = payloadForKey(bundle, key);
      const existing = (await getCustomObject<CombinedCatalog<unknown>>(
        ctx.env,
        ctx.token,
        key
      )) as { version: number; value: CombinedCatalog<unknown> } | null;

      const { combined, changed } = appendVersion(
        existing?.value ?? null,
        payload,
        now
      );

      let action: SyncAction;
      if (!changed) {
        action = 'unchanged';
      } else if (!existing) {
        action = 'created';
      } else {
        action = 'updated';
      }

      if (changed && !dryRun) {
        await putCustomObject(
          ctx.env,
          ctx.token,
          key,
          combined,
          existing?.version
        );
      } else if (changed && dryRun) {
        action = 'skipped';
      }

      return { key, action, versionCount: combined.draft.versions.length };
    })
  );

  return { perKey, validation };
}
