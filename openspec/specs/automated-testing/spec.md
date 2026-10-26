# Automated Testing

## Purpose

How this repository is tested, and how that testing is enforced. Covers what coverage is measured
over, which files may be excluded from it, the levels each testable unit must hold, the runner every
unit exposes, the shared harness application tests render through, the rule that commercetools traffic
is always mocked, and the continuous-integration gate that keeps the floor from slipping. Implemented
by `page-editor/jest.test.config.js` and `page-editor/src/test-utils/` for the application's Jest
suite and shared rendering harness, `packages/page-builder/vitest.config.mts` for the
SDK package suite, and `.github/workflows/ci.yml` for
the gate.

## Requirements

### Requirement: Coverage is measured against the whole source tree

Each testable unit SHALL compute coverage over every source file it owns, not only the files a test
happens to import. A file with no test MUST count against the reported percentage.

#### Scenario: A source file has no test

- **WHEN** a coverage run completes and some source file is imported by no test
- **THEN** that file appears in the report at 0% and is included in the denominator of the totals

#### Scenario: A new untested file is added

- **WHEN** a source file is added and merged without an accompanying test
- **THEN** the reported coverage percentage falls, rather than staying unchanged

### Requirement: Coverage exclusions are explicit and narrow

The set of files excluded from coverage SHALL be declared in configuration, and MUST be limited to
files that carry no hand-written behaviour: generated GraphQL types, i18n message catalogues and
extracted translation data, type-only declaration modules, re-export barrel files, and the test
utilities themselves.

#### Scenario: Generated code is excluded

- **WHEN** coverage is computed for the application
- **THEN** the generated commercetools type module and the i18n data files are absent from the report

#### Scenario: Behaviour-bearing code is not excluded

- **WHEN** a module containing branching logic, data transformation or a React component is proposed
  for exclusion
- **THEN** the exclusion is rejected and the module is tested instead

### Requirement: Coverage meets the agreed levels

Statement coverage and line coverage SHALL each be at least 85% for every testable unit. Branch
coverage and function coverage SHALL each be tracked and held at a declared floor, which MAY be below
85%, and which MUST NOT be lowered.

#### Scenario: Statements or lines fall below the target

- **WHEN** a coverage run reports statement or line coverage below 85% for any unit
- **THEN** the run fails and reports which unit and which metric fell short

#### Scenario: Branches fall below their declared floor

- **WHEN** a coverage run reports branch or function coverage below that unit's declared floor
- **THEN** the run fails, even though the floor is below 85%

### Requirement: Every unit has a working test runner

Each of the application and the page-builder SDK package SHALL expose a
`test` script that runs its suite and a way to run that suite with coverage. A contributor MUST be
able to run the tests for any unit without additional setup beyond installing dependencies.

#### Scenario: Running tests in a package that previously had none

- **WHEN** a contributor runs the test script in the page-builder SDK package
- **THEN** the suite executes and reports pass/fail and coverage, rather than failing with a missing
  script or missing runner

### Requirement: Application tests have a shared rendering harness

The application SHALL provide a single test utility that renders a component with the providers it
needs — the Nimbus/Chakra system provider, `react-intl` with the application's messages, an Apollo
client, and a router — so that individual tests do not each assemble provider trees.

#### Scenario: Rendering a component that uses design-system and i18n

- **WHEN** a test renders a component through the shared harness
- **THEN** the component renders with translations resolved and design-system context available,
  without the test declaring providers itself

#### Scenario: A test needs a non-default context

- **WHEN** a test needs a specific locale, route or Apollo mock set
- **THEN** the harness accepts those as options rather than requiring the test to bypass it

### Requirement: Commercetools requests are mocked, never live

Tests SHALL NOT make network calls to commercetools. Requests to the
commercetools GraphQL endpoints MUST be served by declared request handlers, and an unhandled request
MUST fail the test rather than pass silently.

#### Scenario: A connector hook issues a query

- **WHEN** a test exercises a hook that queries or mutates a commercetools custom object
- **THEN** the request is served from a declared mock handler and the assertion runs against that
  response

#### Scenario: A request has no handler

- **WHEN** code under test issues a request no handler matches
- **THEN** the test fails and names the unhandled request

#### Scenario: Tests are re-run

- **WHEN** the suite is run repeatedly on unchanged code
- **THEN** the result is identical each time, with no dependence on wall-clock time, random values,
  network availability or test execution order

### Requirement: Tests assert behaviour

A test SHALL make at least one assertion about observable behaviour — a returned value, rendered
output, or a call made to a mocked collaborator. Rendering or invoking a module purely to raise its
coverage percentage MUST NOT be accepted as covering it.

#### Scenario: A component test is added

- **WHEN** a test renders a component
- **THEN** it asserts on what the user sees or on an interaction's effect, rather than only asserting
  that rendering did not throw

#### Scenario: An error path exists

- **WHEN** a module has a distinct failure or empty-state path
- **THEN** that path has its own test asserting the resulting behaviour

### Requirement: Continuous integration enforces the gate

A CI job SHALL run, on every pull request and every push to the default and active development
branches, the test suite with coverage for both units, and MUST fail the check when a suite
fails or a coverage floor is not met.

#### Scenario: A pull request lowers coverage below the floor

- **WHEN** a pull request is opened whose changes bring a unit's coverage below its declared floor
- **THEN** the CI check fails and the shortfall is visible in the job output

#### Scenario: A test fails

- **WHEN** any unit's suite has a failing test
- **THEN** the CI check fails regardless of the coverage numbers

### Requirement: The coverage floor ratchets and never regresses

The configured floor SHALL be raised as coverage improves, and MUST NOT be lowered to accommodate a
change. The floor is what CI enforces, so it MUST always be a level the repository currently meets.

#### Scenario: An area of the codebase becomes covered

- **WHEN** a body of tests lands that raises a unit's measured coverage above its current floor
- **THEN** the floor is raised in the same change to the new sustained level

#### Scenario: A change would breach the floor

- **WHEN** a change cannot meet the current floor
- **THEN** the change adds the missing tests, rather than lowering the floor
