import { assert } from 'chai';

import * as markdown from './index.js';

async function testMarkdown(
  original: string,
  expected: string,
  options: { inline?: boolean } = {},
) {
  const actual = await markdown.markdownToHtml(original, options);
  assert.equal(actual.toString().trim(), expected);
}

describe('Markdown processing', () => {
  it('renders basic markdown correctly', async () => {
    const question = '# Hello, world!\nThis **works**.';
    const expected = '<h1>Hello, world!</h1>\n<p>This <strong>works</strong>.</p>';
    await testMarkdown(question, expected);
  });

  it('handles inline latex with underscores', async () => {
    const question = '$a _{1_ 2}$';
    const expected = '<p>$a _{1_ 2}$</p>';
    await testMarkdown(question, expected);
  });

  it('handles inline latex', async () => {
    const question = '$a_1 + a_2 = a_3$';
    const expected = '<p>$a_1 + a_2 = a_3$</p>';
    await testMarkdown(question, expected);
  });

  it('handles multiple lines of inline latex', async () => {
    const question = '$a_{ 1 } = 3$ and\n$a_{ 2 } = 4$';
    const expected = '<p>$a_{ 1 } = 3$ and\n$a_{ 2 } = 4$</p>';
    await testMarkdown(question, expected);
  });

  it('handles block latex', async () => {
    const question = '$$\na^2 + b^2 = c^2\n$$';
    const expected = '$$\na^2 + b^2 = c^2\n$$';
    await testMarkdown(question, expected);
  });

  it('handles block latex with asterisks', async () => {
    const question = '$$\na **b** c\n$$';
    const expected = '$$\na **b** c\n$$';
    await testMarkdown(question, expected);
  });

  it('handles two consecutive latex blocks', async () => {
    const question = '$$\na **b** c\n$$\n$$\na+b=c\n$$';
    const expected = '$$\na **b** c\n$$\n$$\na+b=c\n$$';
    await testMarkdown(question, expected);
  });

  it('handles block latex with asterisks and surrounding text', async () => {
    const question = 'testing\n$$\na **b** c\n$$\ntesting';
    const expected = '<p>testing</p>\n$$\na **b** c\n$$\n<p>testing</p>';
    await testMarkdown(question, expected);
  });

  it('handles GFM extension for tables', async () => {
    const question = '| foo | bar |\n| --- | --- |\n| baz | bim |';
    const expected =
      '<table><thead><tr><th>foo</th><th>bar</th></tr></thead><tbody><tr><td>baz</td><td>bim</td></tr></tbody></table>';
    await testMarkdown(question, expected);
  });

  it('handles HTML tags', async () => {
    const question = 'testing with <strong>bold</strong> and <em>italics</em> words';
    const expected = '<p>testing with <strong>bold</strong> and <em>italics</em> words</p>';
    await testMarkdown(question, expected);
  });

  it('handles HTML tags that do not close properly', async () => {
    const question = 'testing with <strong>bold</strong> and <em>italics words';
    const expected = '<p>testing with <strong>bold</strong> and <em>italics words</em></p>';
    await testMarkdown(question, expected);
  });

  it('handles HTML paragraphs that do not close properly', async () => {
    const question = 'first paragraph<p>second paragraph<p>third paragraph';
    const expected = '<p>first paragraph</p><p>second paragraph</p><p>third paragraph</p>';
    await testMarkdown(question, expected);
  });

  it('handles HTML closing tags that do not open properly', async () => {
    const question = 'testing with </div><p>new line';
    const expected = '<p>testing with </p><p>new line</p>';
    await testMarkdown(question, expected);
  });

  it('handles HTML closing tags that do not open properly', async () => {
    const question = 'testing with </div><p>new line';
    const expected = '<p>testing with </p><p>new line</p>';
    await testMarkdown(question, expected);
  });

  it('removes p tag if content fits a single paragraph', async () => {
    const question = 'test with **bold** and *italic* words';
    const expected = 'test with <strong>bold</strong> and <em>italic</em> words';
    await testMarkdown(question, expected, { inline: true });
  });

  it('keeps p tag if content has more than one paragraph', async () => {
    const question = 'test with **bold** and *italic* words\n\nand a new paragraph';
    const expected =
      '<p>test with <strong>bold</strong> and <em>italic</em> words</p>\n<p>and a new paragraph</p>';
    await testMarkdown(question, expected, { inline: true });
  });

  it('keeps external tag if it is not a paragraph', async () => {
    const question = '* single item';
    const expected = '<ul>\n<li>single item</li>\n</ul>';
    await testMarkdown(question, expected, { inline: true });
  });

  it('sanitizes HTML script tags', async () => {
    const question = 'testing<script>alert("XSS")</script>';
    const expected = '<p>testing</p>';
    await testMarkdown(question, expected);
  });

  it('sanitizes HTML javascript event tags', async () => {
    const question = 'testing<img src="x" onerror="alert(\'XSS\')">';
    const expected = '<p>testing<img src="x"></p>';
    await testMarkdown(question, expected);
  });

  it('sanitizes HTML javascript iframes', async () => {
    const question = 'testing<iframe src="javascript:alert(\'delta\')"></iframe>';
    const expected = '<p>testing</p>';
    await testMarkdown(question, expected);
  });
});
