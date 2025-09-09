import { assert, describe, it } from 'vitest';

import * as markdown from './markdown.js';

function testMarkdownQuestion(question: string, expected: string) {
  const actual = markdown.processQuestion(question);
  assert.equal(actual.trim(), expected);
}

describe('Markdown processing', () => {
  it('renders basic markdown correctly', () => {
    const question = '<markdown>\n# Hello, world!\nThis **works**.\n</markdown>';
    const expected = '<h1>Hello, world!</h1>\n<p>This <strong>works</strong>.</p>';
    testMarkdownQuestion(question, expected);
  });

  it('handles multiple <markdown> tags', () => {
    const question = '<markdown>`nice`</markdown><markdown>`also nice`</markdown>';
    const expected = '<p><code>nice</code></p>\n<p><code>also nice</code></p>';
    testMarkdownQuestion(question, expected);
  });

  it('handles code blocks', () => {
    const question = '<markdown>\n```\nint a = 12;\n```\n</markdown>';
    const expected = '<pl-code >int a = 12;</pl-code>';
    testMarkdownQuestion(question, expected);
  });

  it('handles code blocks with language', () => {
    const question = '<markdown>\n```cpp\nint a = 12;\n```\n</markdown>';
    const expected = '<pl-code language="cpp">int a = 12;</pl-code>';
    testMarkdownQuestion(question, expected);
  });

  it('handles code blocks with highlighted lines', () => {
    const question = '<markdown>\n```{1,2-3}\nint a = 12;\n```\n</markdown>';
    const expected = '<pl-code highlight-lines="1,2-3">int a = 12;</pl-code>';
    testMarkdownQuestion(question, expected);
  });

  it('handles code blocks with language and highlighted lines', () => {
    const question = '<markdown>\n```cpp{1,2-3}\nint a = 12;\n```\n</markdown>';
    const expected = '<pl-code language="cpp" highlight-lines="1,2-3">int a = 12;</pl-code>';
    testMarkdownQuestion(question, expected);
  });

  it('handles escaped dollar-sign symbols', () => {
    const question =
      '<markdown>You need \\$2.00 for a muffin, \\\\$1.50 for a coffee, and \\\\\\$5.00 for a sandwich.</markdown>';
    const expected =
      '<p>You need <span class="mathjax_ignore">$</span>2.00 for a muffin, <span class="mathjax_ignore">$</span>1.50 for a coffee, and <span class="mathjax_ignore">$</span>5.00 for a sandwich.</p>';
    testMarkdownQuestion(question, expected);
  });

  it('handles escaped <markdown> tags', () => {
    const question = '<markdown>```html\n<markdown#></markdown#>\n```</markdown>';
    const expected = '<pl-code language="html">&lt;markdown&gt;&lt;/markdown&gt;</pl-code>';
    testMarkdownQuestion(question, expected);
  });

  it('handles weird escaped <markdown> tags', () => {
    const question = '<markdown>```html\n<markdown###></markdown###>\n```</markdown>';
    const expected = '<pl-code language="html">&lt;markdown##&gt;&lt;/markdown##&gt;</pl-code>';
    testMarkdownQuestion(question, expected);
  });

  it('handles empty <markdown> tags', () => {
    const question = 'before\n<markdown></markdown>\n*between*\n<markdown>`second`</markdown>';
    const expected = 'before\n\n*between*\n<p><code>second</code></p>';
    testMarkdownQuestion(question, expected);
  });
});
