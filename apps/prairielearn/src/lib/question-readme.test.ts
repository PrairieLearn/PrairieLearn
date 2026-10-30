import * as fs from 'fs/promises';
import * as path from 'path';

import tmp from 'tmp-promise';
import { assert, describe, it } from 'vitest';

import { renderQuestionReadme } from './question-readme.js';

async function withQuestionDir(
  files: Record<string, string>,
  fn: (questionPath: string) => Promise<void>,
) {
  await tmp.withDir(
    async ({ path: tmpDir }) => {
      for (const [filename, contents] of Object.entries(files)) {
        await fs.writeFile(path.join(tmpDir, filename), contents);
      }
      await fn(tmpDir);
    },
    { unsafeCleanup: true },
  );
}

describe('renderQuestionReadme', () => {
  it('returns null when there is no README', async () => {
    await withQuestionDir({ 'info.json': '{}' }, async (questionPath) => {
      assert.isNull(await renderQuestionReadme(questionPath));
    });
  });

  it('renders README.md as Markdown', async () => {
    await withQuestionDir({ 'README.md': '# Notes' }, async (questionPath) => {
      const readmeHtml = await renderQuestionReadme(questionPath);
      assert.include(readmeHtml, '<h1>Notes</h1>');
    });
  });

  it('renders README.txt as plain text', async () => {
    await withQuestionDir({ 'README.txt': '# Not a heading' }, async (questionPath) => {
      const readmeHtml = await renderQuestionReadme(questionPath);
      assert.include(readmeHtml, '<pre');
      assert.include(readmeHtml, '# Not a heading</pre>');
    });
  });

  it('renders README as plain text', async () => {
    await withQuestionDir({ README: 'Plain notes' }, async (questionPath) => {
      const readmeHtml = await renderQuestionReadme(questionPath);
      assert.include(readmeHtml, 'Plain notes</pre>');
    });
  });

  it('escapes HTML in plain-text READMEs', async () => {
    await withQuestionDir({ 'README.txt': '<script>alert(1)</script>' }, async (questionPath) => {
      const readmeHtml = await renderQuestionReadme(questionPath);
      assert.include(readmeHtml, '&lt;script&gt;alert(1)&lt;/script&gt;');
      assert.notInclude(readmeHtml, '<script>');
    });
  });

  it('prefers README.md over README.txt over README', async () => {
    await withQuestionDir(
      { 'README.md': 'from md', 'README.txt': 'from txt', README: 'from plain' },
      async (questionPath) => {
        assert.include(await renderQuestionReadme(questionPath), 'from md');
      },
    );
    await withQuestionDir(
      { 'README.txt': 'from txt', README: 'from plain' },
      async (questionPath) => {
        assert.include(await renderQuestionReadme(questionPath), 'from txt');
      },
    );
  });
});
