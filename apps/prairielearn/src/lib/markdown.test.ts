import { assert } from 'chai';

import * as markdown from './markdown.js';

function testMarkdownQuestion(question: string, expected: string) {
  const actual = markdown.processQuestion(question);
  assert.equal(actual?.trim(), expected);
}

describe('Markdown processing', () => {
  it('renders basic markdown correctly', async () => {
    const question = '<markdown>\n# Hello, world!\nThis **works**.\n</markdown>';
    const expected = '<h1>Hello, world!</h1>\n<p>This <strong>works</strong>.</p>';
    testMarkdownQuestion(question, expected);
  });

  it('handles multiple <markdown> tags', async () => {
    const question = '<markdown>`nice`</markdown><markdown>`also nice`</markdown>';
    const expected = '<p><code>nice</code></p><p><code>also nice</code></p>';
    testMarkdownQuestion(question, expected);
  });

  it('handles code blocks', async () => {
    const question = '<markdown>\n```\nint a = 12;\n```\n</markdown>';
    const expected = '<pl-code>int a = 12;</pl-code>';
    testMarkdownQuestion(question, expected);
  });

  it('handles code blocks with language', async () => {
    const question = '<markdown>\n```cpp\nint a = 12;\n```\n</markdown>';
    const expected = '<pl-code language="cpp">int a = 12;</pl-code>';
    testMarkdownQuestion(question, expected);
  });

  it('handles code blocks with highlighted lines', async () => {
    const question = '<markdown>\n```{1,2-3}\nint a = 12;\n```\n</markdown>';
    const expected = '<pl-code highlight-lines="1,2-3">int a = 12;</pl-code>';
    testMarkdownQuestion(question, expected);
  });

  it('handles code blocks with language and highlighted lines', async () => {
    const question = '<markdown>\n```cpp{1,2-3}\nint a = 12;\n```\n</markdown>';
    const expected = '<pl-code language="cpp" highlight-lines="1,2-3">int a = 12;</pl-code>';
    testMarkdownQuestion(question, expected);
  });

  it('handles escaped <markdown> tags', async () => {
    const question = '<markdown>```html\n<markdown#></markdown#>\n```</markdown>';
    const expected = '<pl-code language="html">&#x3C;markdown>&#x3C;/markdown></pl-code>';
    testMarkdownQuestion(question, expected);
  });

  it('handles weird escaped <markdown> tags', async () => {
    const question = '<markdown>```html\n<markdown###></markdown###>\n```</markdown>';
    const expected = '<pl-code language="html">&#x3C;markdown##>&#x3C;/markdown##></pl-code>';
    testMarkdownQuestion(question, expected);
  });

  it('handles empty <markdown> tags', async () => {
    const question = 'before\n<markdown></markdown>\n*between*\n<markdown>`second`</markdown>';
    const expected = 'before\n\n*between*\n<p><code>second</code></p>';
    testMarkdownQuestion(question, expected);
  });
});
