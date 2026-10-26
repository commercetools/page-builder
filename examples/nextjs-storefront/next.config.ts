import path from 'node:path';
import type { NextConfig } from 'next';

// In this monorepo the shim is linked from ../../packages/page-builder (a `file:` dependency).
// A published install needs none of this; it only lets the bundler follow the link.
const monorepoRoot = path.join(__dirname, '..', '..');

const config: NextConfig = {
  turbopack: { root: monorepoRoot },
  outputFileTracingRoot: monorepoRoot,
};

export default config;
