const markdown = require('../lib/markdown');
const assert = require('chai').assert;

const testMarkdown = (question, expected) => {
  const actual = markdown.processQuestion(question);
  assert.equal(actual, expected);
};

describe('Markdown processing', () => {
  it('renders basic markdown correctly', () => {
    const question = '<markdown>\n# Hello, world!\nThis **works**.\n</markdown>';
    const expected = '<h1>Hello, world!</h1>\n<p>This <strong>works</strong>.</p>';
    testMarkdown(question, expected);
  });

  it('handles multiple <markdown> tags', () => {
    const question = '<markdown>`nice`</markdown><markdown>`also nice`</markdown>';
    const expected = '<p><code>nice</code></p><p><code>also nice</code></p>';
    testMarkdown(question, expected);
  });

  it('handles code blocks', () => {
    const question = '<markdown>\n```\nint a = 12;\n```\n</markdown>';
    const expected = '<pl-code no-highlight="true">int a = 12;</pl-code>';
    testMarkdown(question, expected);
  });

  it('handles code blocks with language', () => {
    const question = '<markdown>\n```cpp\nint a = 12;\n```\n</markdown>';
    const expected = '<pl-code language="cpp">int a = 12;</pl-code>';
    testMarkdown(question, expected);
  });

  it('handles code blocks with highlighted lines', () => {
    const question = '<markdown>\n```{1,2-3}\nint a = 12;\n```\n</markdown>';
    const expected = '<pl-code no-highlight="true" highlight-lines="1,2-3">int a = 12;</pl-code>';
    testMarkdown(question, expected);
  });

  it('handles code blocks with language and highlighted lines', () => {
    const question = '<markdown>\n```cpp{1,2-3}\nint a = 12;\n```\n</markdown>';
    const expected = '<pl-code language="cpp" highlight-lines="1,2-3">int a = 12;</pl-code>';
    testMarkdown(question, expected);
  });

  it('handles escaped <markdown> tags', () => {
    const question = '<markdown>```html\n<markdown#></markdown#>\n```</markdown>';
    const expected = '<pl-code language="html">&#x3C;markdown>&#x3C;/markdown></pl-code>';
    testMarkdown(question, expected);
  });

  it('handles weird escaped <markdown> tags', () => {
    const question = '<markdown>```html\n<markdown###></markdown###>\n```</markdown>';
    const expected = '<pl-code language="html">&#x3C;markdown##>&#x3C;/markdown##></pl-code>';
    testMarkdown(question, expected);
  });

  it('handles inline latex with underscores', () => {
    const question = '<markdown>$a _{1_ 2}$</markdown>';
    const expected = '<p>$a _{1_ 2}$</p>';
    testMarkdown(question, expected);
  });

  it('handles inline latex', () => {
    const question = '<markdown>$a_1 + a_2 = a_3$</markdown>';
    const expected = '<p>$a_1 + a_2 = a_3$</p>';
    testMarkdown(question, expected);
  });

  it('handles multiple lines of inline latex', () => {
    const question = '<markdown>$a_{ 1 } = 3$ and\n$a_{ 2 } = 4$</markdown>';
    const expected = '<p>$a_{ 1 } = 3$ and\n$a_{ 2 } = 4$</p>';
    testMarkdown(question, expected);
  });

  it('handles block latex', () => {
    const question = '<markdown>\n$$\na^2 + b^2 = c^2\n$$</markdown>';
    const expected = '$$\na^2 + b^2 = c^2\n$$';
    testMarkdown(question, expected);
  });

  it('handles block latex with asterisks', () => {
    const question = '<markdown>$$\na **b** c\n$$</markdown>';
    const expected = '$$\na **b** c\n$$';
    testMarkdown(question, expected);
  });

  it('handles two consecutive latex blocks', () => {
    const question = '<markdown>$$\na **b** c\n$$\n$$\na+b=c\n$$</markdown>';
    const expected = '$$\na **b** c\n$$\n$$\na+b=c\n$$';
    testMarkdown(question, expected);
  });

  it('handles block latex with asterisks and surrouding text', () => {
    const question = '<markdown>testing\n$$\na **b** c\n$$\ntesting</markdown>';
    const expected = '<p>testing</p>\n$$\na **b** c\n$$\n<p>testing</p>';
    testMarkdown(question, expected);
  });
});
