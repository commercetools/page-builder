import { useCommentAuthor } from './use-comment-author';
import { renderHookWithProviders } from '../../../test-utils/render';

/**
 * The harness supplies a default MC user, and `renderApp` merges rather than
 * replaces — so every case states each field explicitly, including the absent
 * ones, or "no first name" silently inherits one.
 */
const author = (user: Record<string, unknown>) =>
  renderHookWithProviders(() => useCommentAuthor(), {
    user: { firstName: null, lastName: null, ...user } as never,
  }).result.current;

describe('useCommentAuthor', () => {
  it('builds a full name from first and last', () => {
    expect(
      author({
        id: 'u1',
        email: 'tess@example.test',
        firstName: 'Tess',
        lastName: 'Tester',
      })
    ).toEqual({
      id: 'u1',
      email: 'tess@example.test',
      name: 'Tess Tester',
      firstName: 'Tess',
      lastName: 'Tester',
    });
  });

  it('uses whichever name part exists', () => {
    expect(
      author({ id: 'u1', email: 'x@e.test', firstName: 'Tess' }).name
    ).toBe('Tess');
    expect(
      author({ id: 'u1', email: 'x@e.test', lastName: 'Tester' }).name
    ).toBe('Tester');
  });

  it('falls back to the email when there is no name', () => {
    expect(author({ id: 'u1', email: 'x@e.test' }).name).toBe('x@e.test');
  });

  it('falls back to Unknown when there is nothing at all', () => {
    expect(author({ id: 'u1', email: '' }).name).toBe('Unknown');
  });

  it('keeps the name parts it was given alongside the composed name', () => {
    const result = author({ id: 'u1', email: 'x@e.test', firstName: 'Tess' });
    expect(result.firstName).toBe('Tess');
    expect(result.lastName).toBeUndefined();
  });

  it('normalizes a missing id and email to empty strings', () => {
    const result = author({ id: null, email: null });
    expect(result.id).toBe('');
    expect(result.email).toBe('');
    expect(result.name).toBe('Unknown');
  });
});
