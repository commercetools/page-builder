# Undo and Redo

## Purpose

Session-scoped undo and redo for canvas edits, so an author can back out of a mistaken structural
change without reloading and losing everything. Deliberately narrow in scope: the stacks live only
in memory for the current page. Implemented by
`page-editor/src/components/page-builder/use-page-document.ts`.

## Requirements

### Requirement: Undo and redo stacks

Every edit that changes the page SHALL push the previous page state onto an undo stack, and undo
and redo MUST move the current page between the undo and redo stacks without losing intermediate
states.

#### Scenario: Undoing an edit

- **WHEN** the author performs an edit and then undoes it
- **THEN** the page returns to its prior state and that state becomes available to redo

#### Scenario: Redoing an undone edit

- **WHEN** the author redoes after an undo
- **THEN** the page returns to the state that was undone and it is pushed back onto the undo stack

#### Scenario: Undo or redo with an empty stack

- **WHEN** undo is invoked with no history, or redo with nothing undone
- **THEN** the page is left unchanged

### Requirement: A new edit discards the redo stack

Making a fresh edit after an undo SHALL clear the redo stack, so redo can never reapply a state
that the new edit has diverged from.

#### Scenario: Diverging after an undo

- **WHEN** the author undoes an edit and then makes a different edit
- **THEN** redo is no longer available

### Requirement: Stacks are per-page and in-memory only

The undo and redo stacks MUST be reset when the builder initializes a page, and MUST NOT be
persisted, so they do not survive a reload or follow the author to another page.

#### Scenario: Switching pages

- **WHEN** the author opens a different page in the builder
- **THEN** both stacks are emptied and the newly loaded page has no undo history

#### Scenario: Reloading the builder

- **WHEN** the author reloads the builder on the same page
- **THEN** no undo history is available, even for edits that were saved

### Requirement: No keyboard shortcut

Undo and redo SHALL be reachable only through their toolbar controls. The application binds no
keyboard shortcut for either.

#### Scenario: Pressing the conventional shortcut

- **WHEN** the author presses the platform undo shortcut on the canvas
- **THEN** the application takes no action
