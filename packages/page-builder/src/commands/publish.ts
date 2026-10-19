/**
 * `publish` — copy the latest DRAFT head into `published` for each catalog key.
 *
 * The separate go-live step (replaces the MC publish button). Reads the current object,
 * promotes the draft head, and PUTs with optimistic concurrency.
 */

import { type CatalogKey, type CombinedCatalog } from '../contract.js';
import { getCustomObject, putCustomObject } from '../core/ct-client.js';
import { copyDraftToPublished, draftHead } from '../catalog/envelope.js';
import { ALL_KEYS, type SyncContext } from './context.js';

export type PublishAction = 'published' | 'nothing-to-publish' | 'skipped';

export type PublishOptions = {
  ctx: SyncContext;
  only?: CatalogKey[];
  dryRun?: boolean;
  now: string;
};

export type PublishResult = {
  perKey: Array<{ key: CatalogKey; action: PublishAction; appVersion?: number }>;
};

export async function runPublish(opts: PublishOptions): Promise<PublishResult> {
  const { ctx, dryRun, now } = opts;
  const keys = opts.only?.length ? opts.only : ALL_KEYS;

  // Each key is its own custom object with its own version, so no iteration
  // depends on another and they can all run together; `Promise.all` keeps
  // `perKey` in `keys` order. Note this is not transactional either way — a
  // failure part-way through leaves the keys that already succeeded published,
  // exactly as the previous sequential loop did.
  const perKey = await Promise.all(
    keys.map(async (key): Promise<PublishResult['perKey'][number]> => {
      const existing = (await getCustomObject<CombinedCatalog<unknown>>(
        ctx.env,
        ctx.token,
        key
      )) as { version: number; value: CombinedCatalog<unknown> } | null;

      const head = existing ? draftHead(existing.value) : null;
      if (!existing || !head) return { key, action: 'nothing-to-publish' };
      if (dryRun) return { key, action: 'skipped', appVersion: head.appVersion };

      const promoted = copyDraftToPublished(existing.value, now);
      await putCustomObject(ctx.env, ctx.token, key, promoted, existing.version);
      return { key, action: 'published', appVersion: head.appVersion };
    })
  );

  return { perKey };
}
