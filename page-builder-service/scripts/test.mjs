// `commercetools connect validate` appends jest-style coverage flags to the test script;
// vitest rejects them, so translate the ones it has an equivalent for and drop the rest.
import { spawnSync } from 'node:child_process';

const args = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  const [flag, inline] = arg.split(/=(.*)/s);
  const value = () => (inline !== undefined ? inline : argv[++i]);
  if (flag === '--coverageReporters') args.push(`--coverage.reporter=${value()}`);
  else if (flag === '--collectCoverageFrom') value();
  else args.push(arg);
}

const result = spawnSync('npx', ['vitest', 'run', ...args], { stdio: 'inherit' });
process.exit(result.status ?? 1);
