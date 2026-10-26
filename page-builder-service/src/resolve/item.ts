/**
 * Per-item resolution: localize the stored settings, swap saved-data-source ids for their
 * resolved data, resolve picker fields from the component's schema, then merge the component's
 * route-driven fill. Failures are isolated to the piece that failed: the page still renders,
 * with that data omitted.
 */

import { localizeFields, type ResolveItem } from '../domain/transform.js';
import type { PageComponent } from '../domain/types.js';
import type { RenderEnv } from './env.js';
import { resolveFields } from './fields.js';
import { resolveFill } from './fills.js';
import { KIND_RESOLVERS } from './kinds.js';

async function resolveInstance(id: string, env: RenderEnv): Promise<unknown> {
  const instance = env.instances.get(id);
  if (!instance) return id;
  const config = localizeFields(instance.config, env.ctx.locale, env.defaultLocale);
  const kind = env.dataSources.get(instance.type)?.resolver?.kind;
  // A type with no resolver kind is passed through as its configuration, for hosts that render it.
  if (!kind) return { type: instance.type, ...config };
  try {
    return await KIND_RESOLVERS[kind](config, env);
  } catch (err) {
    env.log.warn({ instance: id, kind, err }, 'data source resolution failed; omitting its data');
    return null;
  }
}

/** Replace any string equal to a saved data-source id (at any depth) with its resolved data. */
async function resolveInstances(value: unknown, env: RenderEnv): Promise<unknown> {
  if (typeof value === 'string') return env.instances.has(value) ? resolveInstance(value, env) : value;
  if (Array.isArray(value)) return Promise.all(value.map((v) => resolveInstances(v, env)));
  if (value && typeof value === 'object') {
    const entries = await Promise.all(
      Object.entries(value).map(async ([k, v]) => [k, await resolveInstances(v, env)] as const)
    );
    return Object.fromEntries(entries);
  }
  return value;
}

export function createItemResolver(env: RenderEnv): ResolveItem {
  return async (child: PageComponent) => {
    const component = env.components.get(child.type);
    const localized = localizeFields(child.settings ?? {}, env.ctx.locale, env.defaultLocale);
    let settings = (await resolveInstances(localized, env)) as Record<string, unknown>;
    if (component) settings = await resolveFields(settings, component.schema, env);

    if (component?.fill) {
      try {
        settings = { ...settings, ...(await resolveFill(component.fill, env)) };
      } catch (err) {
        env.log.warn({ type: child.type, fill: component.fill, err }, 'fill resolution failed; omitting its data');
      }
    }
    return settings;
  };
}
