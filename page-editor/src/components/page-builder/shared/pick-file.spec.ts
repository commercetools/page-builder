import { pickFile } from './pick-file';

/** Stand in for the OS chooser: `choose` runs when the input is "clicked". */
const chooser = (choose: (input: HTMLInputElement) => void) =>
  jest
    .spyOn(HTMLInputElement.prototype, 'click')
    .mockImplementation(function (this: HTMLInputElement) {
      choose(this);
    });

afterEach(() => jest.restoreAllMocks());

describe('pickFile', () => {
  it('asks the chooser for the accepted types and resolves with the chosen file', async () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    let seen: HTMLInputElement | undefined;
    chooser((input) => {
      seen = input;
      Object.defineProperty(input, 'files', { value: [file] });
      input.dispatchEvent(new Event('change'));
    });

    await expect(pickFile('image/png,image/webp')).resolves.toBe(file);
    expect(seen?.type).toBe('file');
    expect(seen?.accept).toBe('image/png,image/webp');
  });

  it('resolves null when the chooser is dismissed', async () => {
    chooser((input) => input.dispatchEvent(new Event('cancel')));
    await expect(pickFile('image/png')).resolves.toBeNull();
  });

  it('resolves null when the change carries no file', async () => {
    chooser((input) => {
      Object.defineProperty(input, 'files', { value: [] });
      input.dispatchEvent(new Event('change'));
    });
    await expect(pickFile('image/png')).resolves.toBeNull();
  });

  it('never puts the input in the document', async () => {
    chooser((input) => input.dispatchEvent(new Event('cancel')));
    await pickFile('image/png');
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });
});
