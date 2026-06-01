import type { Locator, Page } from '@playwright/test';

interface AceEditor {
  setValue: (val: string, pos: number) => void;
  getValue: () => string;
}

interface AceWindow {
  ace: { edit: (el: HTMLElement) => AceEditor };
}

/**
 * Waits until at least `count` ACE editors are present on the page and the ACE
 * runtime is ready to be driven via `window.ace.edit`.
 */
async function waitForAceReady(page: Page, count = 1): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page
    .locator('.ace_editor')
    .nth(count - 1)
    .waitFor({ timeout: 60_000 });
  await page.waitForFunction((expected) => {
    const w = window as unknown as Partial<AceWindow>;
    return Boolean(w.ace?.edit) && document.querySelectorAll('.ace_editor').length >= expected;
  }, count);
}

/**
 * Sets the contents of the `index`-th ACE editor on the page (0-based). Most
 * pages have a single editor; the file editor's conflict view has two.
 */
export async function setAceEditorContent(page: Page, content: string, index = 0): Promise<void> {
  await waitForAceReady(page, index + 1);
  await page.evaluate(
    ({ newContent, editorIndex }) => {
      const el = document.querySelectorAll<HTMLElement>('.ace_editor')[editorIndex];
      (window as unknown as AceWindow).ace.edit(el).setValue(newContent, -1);
    },
    { newContent: content, editorIndex: index },
  );
}

/**
 * Sets the contents of the ACE editor at `editor` (its `.ace_editor` element).
 * Use this to target one editor on a page that has several.
 */
export async function setAceEditorContentAt(editor: Locator, content: string): Promise<void> {
  await editor.waitFor();
  await editor
    .page()
    .waitForFunction(() => Boolean((window as unknown as Partial<AceWindow>).ace?.edit));
  await editor.evaluate((el, newContent) => {
    (window as unknown as AceWindow).ace.edit(el as HTMLElement).setValue(newContent, -1);
  }, content);
}

/** Returns the contents of the `index`-th ACE editor on the page (0-based). */
export async function getAceEditorContent(page: Page, index = 0): Promise<string> {
  await waitForAceReady(page, index + 1);
  return await page.evaluate((editorIndex) => {
    const el = document.querySelectorAll<HTMLElement>('.ace_editor')[editorIndex];
    return (window as unknown as AceWindow).ace.edit(el).getValue();
  }, index);
}
