/**
 * Config for `@commercetools-frontend/jest-preset-mc-app` (read via cosmiconfig
 * from `setup-test-framework.js`).
 *
 * `fail-on-console` turns any console.error into a test failure, which is what we
 * want — except for failures a test deliberately simulated. MSW's
 * `res.networkError(...)` is reported by the fetch interceptor as an unhandled
 * console.error *after* the assertion has already run, so a per-test `jest.spyOn`
 * restores too early to catch it. Several hooks (e.g. the image-picker token)
 * exist specifically to swallow transport failures, and those paths need testing.
 *
 * Scoped as narrowly as possible: each pattern matches one specific third-party
 * message, never a class of them.
 *
 *  - `net::ERR_FAILED` — the MSW fetch interceptor reporting a deliberately
 *    simulated network error, logged after the assertion has already run so a
 *    per-test `jest.spyOn` restores too early to catch it.
 *  - the empty-`href` warning — `@commercetools/nimbus`'s own `Tabs` renders
 *    every tab as an anchor with `href=""`, once per tab. Not ours to fix.
 */
module.exports = {
  silenceConsoleWarnings: [
    /net::ERR_FAILED/,
    /An empty string \(""\) was passed to the href attribute/,
  ],
};
