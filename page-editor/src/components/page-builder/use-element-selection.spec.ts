import { useElementSelection } from './use-element-selection';
import { act, renderHookWithProviders } from '../../test-utils/render';

const render = (search = '') =>
  renderHookWithProviders(() => useElementSelection(), {
    route: `/builder/home${search}`,
  });

describe('useElementSelection initial state', () => {
  it('starts with nothing selected', () => {
    const { result } = render();
    expect(result.current.layoutId).toBeNull();
    expect(result.current.compId).toBeNull();
    expect(result.current.elementId).toBeNull();
  });

  it('restores a layout selection from the URL, so it survives a reload', () => {
    const { result } = render('?layout=layout-1');
    expect(result.current.layoutId).toBe('layout-1');
    expect(result.current.elementId).toBe('layout-1');
  });

  it('restores a component selection from the URL', () => {
    const { result } = render('?layout=layout-1&comp=c1');
    expect(result.current.layoutId).toBe('layout-1');
    expect(result.current.compId).toBe('c1');
  });

  it('prefers the component as the selected element', () => {
    const { result } = render('?layout=layout-1&comp=c1');
    expect(result.current.elementId).toBe('c1');
  });
});

describe('selectLayout', () => {
  it('selects a layout and writes it to the URL', () => {
    const { result, history } = render();
    act(() => result.current.selectLayout('layout-1'));

    expect(result.current.layoutId).toBe('layout-1');
    expect(history.location.search).toContain('layout=layout-1');
  });

  it('clears any component selection', () => {
    const { result } = render('?layout=layout-1&comp=c1');
    act(() => result.current.selectLayout('layout-2'));

    expect(result.current.compId).toBeNull();
    expect(result.current.elementId).toBe('layout-2');
  });

  it('clears the selection entirely for null', () => {
    const { result, history } = render('?layout=layout-1&comp=c1');
    act(() => result.current.selectLayout(null));

    expect(result.current.layoutId).toBeNull();
    expect(result.current.compId).toBeNull();
    expect(history.location.search).not.toContain('layout=');
    expect(history.location.search).not.toContain('comp=');
  });

  it('asks the preview to scroll by default', () => {
    const { result } = render();
    act(() => result.current.selectLayout('layout-1'));
    expect(result.current.scrollOnSelect.current).toBe(true);
  });

  it('suppresses scrolling when the click came from inside the iframe', () => {
    const { result } = render();
    act(() => result.current.selectLayout('layout-1', { scroll: false }));
    expect(result.current.scrollOnSelect.current).toBe(false);
  });

  it('replaces rather than pushes, so selection does not fill the back stack', () => {
    const { result, history } = render();
    const before = history.length;
    act(() => result.current.selectLayout('layout-1'));
    expect(history.length).toBe(before);
  });

  it('preserves unrelated query parameters', () => {
    const { result, history } = render('?device=mobile');
    act(() => result.current.selectLayout('layout-1'));
    expect(history.location.search).toContain('device=mobile');
  });
});

describe('selectComp', () => {
  it('selects a component and keeps its parent layout', () => {
    const { result, history } = render();
    act(() => result.current.selectComp('layout-1', 'c1'));

    expect(result.current.layoutId).toBe('layout-1');
    expect(result.current.compId).toBe('c1');
    expect(history.location.search).toContain('layout=layout-1');
    expect(history.location.search).toContain('comp=c1');
  });

  it('asks the preview to scroll by default', () => {
    const { result } = render();
    act(() => result.current.selectComp('layout-1', 'c1'));
    expect(result.current.scrollOnSelect.current).toBe(true);
  });

  it('suppresses scrolling for a selection made inside the iframe', () => {
    const { result } = render();
    act(() => result.current.selectComp('layout-1', 'c1', { scroll: false }));
    expect(result.current.scrollOnSelect.current).toBe(false);
  });

  it('moves the selection between components', () => {
    const { result } = render('?layout=layout-1&comp=c1');
    act(() => result.current.selectComp('layout-2', 'c2'));

    expect(result.current.layoutId).toBe('layout-2');
    expect(result.current.compId).toBe('c2');
  });
});
