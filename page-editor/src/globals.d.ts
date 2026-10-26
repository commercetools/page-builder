declare module '*.graphql' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any;
  export default content;
}

// The MC jest preset ships no types. We only read `setupFilesAfterEnv` off it,
// in the spec that guards against re-clobbering it.
declare module '@commercetools-frontend/jest-preset-mc-app/typescript/jest-preset' {
  const preset: { setupFilesAfterEnv?: string[] };
  export default preset;
}

declare module '*/jest.test.config' {
  const config: { setupFilesAfterEnv?: string[] };
  export default config;
}

// `setup-test-framework.js` hangs these off the global console so a test can
// opt a specific warning out of fail-on-console.
interface Console {
  config?: {
    addSilencedWarning: (pattern: RegExp) => void;
    addNonThrowingWarning: (pattern: RegExp) => void;
  };
}
