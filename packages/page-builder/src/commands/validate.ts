/**
 * `validate` — lint a CatalogBundle for referential integrity. No CT access.
 */

import type { CatalogBundle } from '../contract.js';
import { validateBundle } from '../catalog/validate.js';

export type ValidateResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

export function runValidate(bundle: CatalogBundle): ValidateResult {
  const report = validateBundle(bundle);
  return {
    ok: report.errors.length === 0,
    errors: report.errors,
    warnings: report.warnings,
  };
}
