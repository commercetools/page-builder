/**
 * Opens the browser's file chooser and resolves with the chosen file, or `null` if it was dismissed.
 *
 * The input is created here, never rendered: Nimbus 3.2 has no file trigger, and a hidden `<input>`
 * in the tree would be one more thing for a screen reader to find. Must be called from a user
 * gesture (a press handler) or the browser will not open the chooser.
 */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), {
      once: true,
    });
    // Fired when the chooser is dismissed (supported by current browsers); without it the promise
    // simply never settles, which nothing here waits on.
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}
