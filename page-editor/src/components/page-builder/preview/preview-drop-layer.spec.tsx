import PreviewDropLayer from './preview-drop-layer';
import type { Dropzone } from './preview-bridge';
import {
  fireEvent,
  renderWithProviders,
  screen,
} from '../../../test-utils/render';

const zone = (
  section: string,
  layoutId: string | null,
  index: number,
  rect: { top: number; left: number; width: number; height: number }
): Dropzone => ({ section, layoutId, index, rect });

const ZONES = [
  zone('MAIN', 'layout-1', 0, { top: 0, left: 0, width: 100, height: 100 }),
  zone('MAIN', 'layout-2', 1, { top: 200, left: 0, width: 100, height: 100 }),
];

const setup = (over: Partial<Parameters<typeof PreviewDropLayer>[0]> = {}) => {
  const onDrop = jest.fn();
  const rendered = renderWithProviders(
    <div data-testid="host">
      <PreviewDropLayer dropzones={ZONES} active onDrop={onDrop} {...over} />
    </div>
  );
  return { onDrop, ...rendered };
};

/**
 * jsdom reports a zero-size box for every element, so pin the layer's own
 * rect — the hit test measures the cursor relative to it.
 */
const layerOf = async () => {
  const layer = (await screen.findByTestId('host'))
    .firstElementChild as HTMLElement;
  jest.spyOn(layer, 'getBoundingClientRect').mockReturnValue({
    top: 0,
    left: 0,
    width: 300,
    height: 400,
    right: 300,
    bottom: 400,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
  return layer;
};

/**
 * jsdom's `DragEvent` drops `clientX`/`clientY` from its init, and the hit test
 * needs them — so dispatch a MouseEvent carrying the coordinates under the drag
 * event's name, with a stub dataTransfer attached.
 */
const dragAt = (
  el: HTMLElement,
  type: 'dragover' | 'drop',
  clientX: number,
  clientY: number
) => {
  const event = new MouseEvent(type, { bubbles: true, clientX, clientY });
  Object.defineProperty(event, 'dataTransfer', {
    value: { dropEffect: 'none', types: [] },
  });
  fireEvent(el, event);
};

describe('PreviewDropLayer', () => {
  it('is not rendered unless a palette drag is in flight', async () => {
    setup({ active: false });
    const host = await screen.findByTestId('host');
    expect(host).toBeEmptyDOMElement();
  });

  it('covers the iframe while a drag is in flight', async () => {
    setup();
    const host = await screen.findByTestId('host');
    expect(host.firstElementChild).toBeInTheDocument();
  });

  it('shows no indicator before the cursor moves over it', async () => {
    setup();
    const layer = await layerOf();
    expect(layer.children).toHaveLength(0);
  });

  it('previews the dropzone nearest the cursor', async () => {
    setup();
    const layer = await layerOf();

    dragAt(layer, 'dragover', 50, 50);
    expect(layer.children).toHaveLength(1);
  });

  it('moves the preview to a different zone as the cursor moves', async () => {
    setup();
    const layer = await layerOf();

    // Chakra compiles the indicator's position into a class rather than an
    // inline style, so compare the rendered element rather than `style.top`.
    dragAt(layer, 'dragover', 50, 50);
    const first = (layer.children[0] as HTMLElement).outerHTML;

    dragAt(layer, 'dragover', 50, 250);
    expect((layer.children[0] as HTMLElement).outerHTML).not.toBe(first);
  });

  it('clears the preview when the cursor leaves', async () => {
    setup();
    const layer = await layerOf();

    dragAt(layer, 'dragover', 50, 50);
    fireEvent.dragLeave(layer);
    expect(layer.children).toHaveLength(0);
  });

  it('commits to the nearest zone on drop', async () => {
    const { onDrop } = setup();
    const layer = await layerOf();

    dragAt(layer, 'drop', 50, 50);
    expect(onDrop).toHaveBeenCalledWith({
      section: 'MAIN',
      layoutId: 'layout-1',
      index: 0,
    });
  });

  it('picks the far zone when the cursor is nearer to it', async () => {
    const { onDrop } = setup();
    const layer = await layerOf();

    dragAt(layer, 'drop', 50, 250);
    expect(onDrop).toHaveBeenCalledWith({
      section: 'MAIN',
      layoutId: 'layout-2',
      index: 1,
    });
  });

  it('clears the preview after dropping', async () => {
    setup();
    const layer = await layerOf();

    dragAt(layer, 'dragover', 50, 50);
    dragAt(layer, 'drop', 50, 50);
    expect(layer.children).toHaveLength(0);
  });

  it('drops nothing when the host reported no zones', async () => {
    const { onDrop } = setup({ dropzones: [] });
    const layer = await layerOf();

    dragAt(layer, 'drop', 50, 50);
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('shows no indicator when the host reported no zones', async () => {
    setup({ dropzones: [] });
    const layer = await layerOf();

    dragAt(layer, 'dragover', 50, 50);
    expect(layer.children).toHaveLength(0);
  });
});
