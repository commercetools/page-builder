# Approval Workflows

## Purpose

Optional review gates before a page can go live. An administrator defines a named workflow bound to
a page type as an ordered chain of review steps, each assigned to a Merchant Center team; the Page
Builder then runs that workflow per page and withholds publishing until it completes. Implemented by
`page-editor/src/components/workflows/` and
`page-editor/src/components/page-builder/use-workflow-runtime.ts`, `reject-dialog.tsx`,
`workflow-history-drawer.tsx`, with persistence in `hooks/use-workflows-connector` and
`hooks/use-page-workflow-connector`.

## Requirements

### Requirement: Workflow definitions

An administrator SHALL be able to create, edit and delete named workflow definitions at the
`/workflows` route. A definition MUST bind to exactly one page type and MUST hold an ordered list of
review steps, each with a title and an assigned Merchant Center team. Start and finish are implicit
bookends, not authored steps.

#### Scenario: Building a definition

- **WHEN** an administrator edits a workflow
- **THEN** the steps are presented as a linear chain from a start node to a publish node
- **AND** each step's title and assigned team can be edited in place

#### Scenario: Listing definitions

- **WHEN** an administrator opens the workflows route
- **THEN** each workflow is listed with its name, the page type it is bound to, and its step count

### Requirement: Selecting the governing workflow

A page SHALL be governed by the workflow bound to its own page type, falling back to a workflow
bound to all page types. A definition with no steps MUST NOT govern anything.

#### Scenario: Wildcard fallback

- **WHEN** no workflow is bound to the page's specific type but one is bound to all types
- **THEN** that wildcard workflow governs the page

#### Scenario: Empty definition

- **WHEN** the matching definition declares zero steps
- **THEN** no workflow governs the page and publishing behaves as ungoverned

### Requirement: Steps are snapshotted on entry

When a page first enters a workflow, the definition's steps SHALL be copied into that page's runtime
state, so a later edit to the definition cannot corrupt a page already in flight.

#### Scenario: Definition edited mid-flight

- **WHEN** a page is partway through a workflow and an administrator then changes the definition's
  steps
- **THEN** the in-flight page continues against the steps it captured on entry

### Requirement: Position and stage labelling

The runtime SHALL track an integer position where zero is draft, k means k steps approved, and a
position equal to the step count means every step is approved and the page is ready to publish. The
menu bar MUST label the current stage from that position.

#### Scenario: Awaiting a review team

- **WHEN** the page sits at a position with a pending step
- **THEN** the stage is labelled as awaiting that step's assigned team

#### Scenario: Ready to publish

- **WHEN** every step has been approved
- **THEN** the stage is labelled as ready to publish and the publish action becomes the next step

### Requirement: Advancing

Advancing SHALL save the page draft first and then move the position forward by one, appending a
transition to an append-only history that records the actor, the timestamp, and denormalized labels
for the nodes moved between.

#### Scenario: First advance starts the workflow

- **WHEN** the page is advanced from the draft position
- **THEN** the transition is recorded as a start rather than an ordinary advance

#### Scenario: Advance failure

- **WHEN** the save or the state write fails while advancing
- **THEN** the position is unchanged and the failure is reported as an inability to advance

### Requirement: Rejecting

Rejecting SHALL require a comment, MUST move the position back exactly one step, and MUST mirror the
comment into the page's comment threads as a workflow-anchored thread so it surfaces in the messages
drawer.

#### Scenario: Rejecting with a comment

- **WHEN** a reviewer rejects the current step and supplies a comment
- **THEN** the position moves back one, a reject transition carrying the comment is appended to the
  history, and the comment also appears as a workflow comment thread

#### Scenario: Rejecting at the draft position

- **WHEN** the page is already at the draft position
- **THEN** rejecting is unavailable, since there is nothing to send back

### Requirement: Team-based gating with safe degradation

Only a member of the current step's assigned team SHALL be able to advance, reject, or publish.
Where team membership cannot be determined because the organisation directory is unavailable, the
system MUST degrade to attribution-only rather than locking every user out.

#### Scenario: Member of the assigned team

- **WHEN** the acting user belongs to the team assigned to the current step
- **THEN** advance, reject and publish are available as the position allows

#### Scenario: Not a member

- **WHEN** the acting user does not belong to that team and the directory is available
- **THEN** advance, reject and publish are all withheld

#### Scenario: Directory unavailable

- **WHEN** the organisation directory cannot be read
- **THEN** the actions remain available and the acting user is still recorded on the transition

### Requirement: Publishing completes a cycle

Publishing under a workflow SHALL be available only at the finish, and MUST record a publish
transition and reset the position to draft so the page can go round again for its next change.

#### Scenario: Publishing at the finish

- **WHEN** an authorized user publishes a page whose workflow has reached the finish
- **THEN** the page is published, a publish transition is appended, and the position returns to draft

### Requirement: Transition history

The runtime SHALL expose the complete append-only transition history, including reject comments, and
MUST render stably even if the underlying definition has since changed.

#### Scenario: Reading the history

- **WHEN** a user opens the workflow history
- **THEN** every transition is listed with its actor, its time, and the labels captured when it
  happened rather than labels re-derived from the current definition

### Requirement: Enforcement is presentational only

Workflow gating SHALL be understood as a user-interface control, not a security boundary: the
underlying custom objects remain directly writable through the commercetools API by anyone holding
the project credentials.

#### Scenario: Bypassing through the API

- **WHEN** a user with API access writes the published page object directly
- **THEN** the workflow does not prevent it, because no server-side enforcement exists
