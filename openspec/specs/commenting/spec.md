# Commenting

## Purpose

Threaded discussion attached to the thing being discussed — a specific element on the page, the page
as a whole, or a workflow step — plus @-mentions so a teammate can be pulled in. This is how review
feedback stays next to the content instead of in a chat tool. Implemented by
`page-editor/src/components/page-builder/comments/` and `use-page-comments.ts`, with persistence in
`page-editor/src/hooks/use-comments-connector`.

## Requirements

### Requirement: Comment targets

A thread SHALL be anchored to one of three targets: a specific element on the page, the page itself,
or a step of the page's approval workflow.

#### Scenario: Commenting on an element

- **WHEN** the author opens comments from an element on the canvas or from the preview overlay
- **THEN** the thread is anchored to that element's id and is reachable from it thereafter

#### Scenario: Workflow-anchored thread

- **WHEN** a workflow step is rejected with a comment
- **THEN** a thread anchored to that step and event is created

### Requirement: Thread operations

Users SHALL be able to post a comment, reply within a thread, edit their own comment, delete a
comment, and resolve or reopen a thread.

#### Scenario: Resolving a thread

- **WHEN** a user resolves a thread
- **THEN** it is marked resolved and can be reopened later

### Requirement: Deletion is a soft tombstone

Deleting a comment MUST leave a tombstone rather than removing the record, so that reply ordering
within the thread is preserved.

#### Scenario: Deleting a comment with replies

- **WHEN** a comment that has replies is deleted
- **THEN** it is flagged as deleted and its replies keep their position in the thread

### Requirement: Mention autocomplete

The composer SHALL offer autocomplete for @-mentions from the organisation directory, and MUST fall
back to accepting a typed email address when the directory is unavailable.

#### Scenario: Directory available

- **WHEN** the author types an @-mention and the organisation directory can be read
- **THEN** matching team members are offered by name and email

#### Scenario: Directory unavailable

- **WHEN** the directory cannot be read
- **THEN** the typed value is offered as a mention once it looks like an email address, so mentioning
  still works

### Requirement: Messages drawer

The builder SHALL provide a drawer listing every thread on the page, grouped so that the user's own
mentions are separable from general discussion, and MUST include threads whose anchor element no
longer exists.

#### Scenario: Grouped threads

- **WHEN** the user opens the messages drawer
- **THEN** threads are grouped into mentions of the current user, component comments, page comments,
  and workflow comments

#### Scenario: Orphaned threads

- **WHEN** a thread's anchor element has since been deleted from the page
- **THEN** the thread still appears, grouped as orphaned, so the discussion is not silently lost

#### Scenario: Navigating to the anchor

- **WHEN** the user activates a thread anchored to an element
- **THEN** that element becomes the current selection

### Requirement: Unread indication

The system SHALL show an unread count that counts only comments authored by someone else that
@-mention the current user and postdate the user's last visit to the drawer.

#### Scenario: Someone else mentions the user

- **WHEN** another user posts a comment mentioning the current user after the last time that user
  opened the drawer
- **THEN** the unread count increases

#### Scenario: The user's own comment

- **WHEN** the current user posts a comment mentioning themselves
- **THEN** the unread count does not increase

#### Scenario: Last-seen is per device

- **WHEN** the user reads the drawer on one device and then opens the application on another
- **THEN** the unread state is not shared, because the last-seen marker is stored in browser-local
  storage per project, user and page

### Requirement: Polling cadence

Threads SHALL be refreshed on a poll, at a faster cadence while a comment surface is open and a
slower one otherwise.

#### Scenario: Comment surface open

- **WHEN** the messages drawer or a thread is open
- **THEN** threads are refetched every 10 seconds

#### Scenario: No comment surface open

- **WHEN** no comment surface is open
- **THEN** threads are refetched every 60 seconds

### Requirement: Concurrent commenters merge

Writes MUST be applied as a read-modify-write with retry against the stored version, so that two
users commenting at once do not overwrite each other.

#### Scenario: Simultaneous comments

- **WHEN** two users post to the same page at the same time and one write hits a version conflict
- **THEN** that write is retried against the fresh state, up to three attempts, and both comments
  survive
