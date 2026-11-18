/**
 * Shadows the broken `@types/json-stable-stringify` stub in node_modules.
 *
 * That package is a deprecated stub — it declares `"main": ""` and ships no
 * declaration file, because `json-stable-stringify` provides its own types. But
 * it still sits under a `typeRoot`, so tsc treats it as an implicit type library,
 * fails to find a definition file, and reports TS2688. That error is emitted
 * before semantic analysis, so `tsc --noEmit` was exiting without type-checking
 * any source file at all — the project's `typecheck` script looked clean because
 * it never actually ran.
 *
 * `@types-extensions` is listed ahead of `node_modules/@types` in tsconfig's
 * `typeRoots`, so this empty-but-valid declaration wins and tsc proceeds.
 */

export {};
