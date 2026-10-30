import * as path from 'path';

import fs from 'fs-extra';

import { html } from '@prairielearn/html';
import { markdownToHtml } from '@prairielearn/markdown';

/**
 * README filenames, in order of preference. `README.md` is rendered as
 * Markdown; the others are shown as plain text.
 */
const README_FILENAMES = ['README.md', 'README.txt', 'README'];

/**
 * Renders a question's README as HTML, or returns null if the question has
 * no README.
 */
export async function renderQuestionReadme(questionPath: string): Promise<string | null> {
  for (const filename of README_FILENAMES) {
    const readmePath = path.join(questionPath, filename);
    if (!(await fs.pathExists(readmePath))) continue;

    const readme = await fs.readFile(readmePath, 'utf8');
    if (filename === 'README.md') {
      return markdownToHtml(readme, { allowHtml: false });
    }
    return html`
      <pre class="mb-0 text-break" style="white-space: pre-wrap;">${readme}</pre>
    `.toString();
  }
  return null;
}
