import { assert, describe, it } from 'vitest';

import { markdownToHtml } from './index.js';

function testMarkdown(
  original: string,
  expected: string,
  options: { inline?: boolean; allowHtml?: boolean; interpretMath?: boolean } = {},
) {
  const actual = markdownToHtml(original, options);
  assert.equal(actual.toString().trim(), expected);
}

describe('Markdown processing', () => {
  it('renders basic markdown correctly', () => {
    const question = '# Hello, world!\nThis **works**.';
    const expected = '<h1>Hello, world!</h1>\n<p>This <strong>works</strong>.</p>';
    testMarkdown(question, expected);
  });

  it('handles inline latex with underscores', () => {
    const question = '$a _{1_ 2}$';
    const expected = '<p>$a _{1_ 2}$</p>';
    testMarkdown(question, expected);
  });

  it('handles inline latex', () => {
    const question = '$a_1 + a_2 = a_3$';
    const expected = '<p>$a_1 + a_2 = a_3$</p>';
    testMarkdown(question, expected);
  });

  it('handles multiple lines of inline latex', () => {
    const question = '$a_{ 1 } = 3$ and\n$a_{ 2 } = 4$';
    const expected = '<p>$a_{ 1 } = 3$ and\n$a_{ 2 } = 4$</p>';
    testMarkdown(question, expected);
  });

  it('handles block latex', () => {
    const question = '$$\na^2 + b^2 = c^2\n$$';
    const expected = '<p>$$\na^2 + b^2 = c^2\n$$</p>';
    testMarkdown(question, expected);
  });

  it('handles block latex with asterisks', () => {
    const question = '$$\na **b** c\n$$';
    const expected = '<p>$$\na **b** c\n$$</p>';
    testMarkdown(question, expected);
  });

  it('handles two consecutive latex blocks', () => {
    const question = '$$\na **b** c\n$$\n$$\na+b=c\n$$';
    const expected = '<p>$$\na **b** c\n$$\n$$\na+b=c\n$$</p>';
    testMarkdown(question, expected);
  });

  it('handles block latex with asterisks and surrounding text', () => {
    const question = 'testing\n$$\na **b** c\n$$\ntesting';
    const expected = '<p>testing\n$$\na **b** c\n$$\ntesting</p>';
    testMarkdown(question, expected);
  });

  it('handles GFM extension for tables', () => {
    const question = '| foo | bar |\n| --- | --- |\n| baz | bim |';
    const expected =
      '<table>\n<thead>\n<tr>\n<th>foo</th>\n<th>bar</th>\n</tr>\n</thead>\n<tbody><tr>\n<td>baz</td>\n<td>bim</td>\n</tr>\n</tbody></table>';
    testMarkdown(question, expected);
  });

  it('handles HTML tags', () => {
    const question = 'testing with <strong>bold</strong> and <em>italics</em> words';
    const expected = '<p>testing with <strong>bold</strong> and <em>italics</em> words</p>';
    testMarkdown(question, expected);
  });

  it('handles HTML tags that do not close properly', () => {
    const question = 'testing with <strong>bold</strong> and <em>italics words';
    const expected =
      '<p>testing with <strong>bold</strong> and <em>italics words</em></p><em>\n</em>';
    testMarkdown(question, expected);
  });

  it('handles HTML paragraphs that do not close properly', () => {
    const question = 'first paragraph<p>second paragraph<p>third paragraph';
    const expected = '<p>first paragraph</p><p>second paragraph</p><p>third paragraph</p>';
    testMarkdown(question, expected);
  });

  it('handles HTML closing tags that do not open properly', () => {
    const question = 'testing with </div><p>new line';
    const expected = '<p>testing with </p><p>new line</p>';
    testMarkdown(question, expected);
  });

  it('handles HTML closing tags that do not open properly', () => {
    const question = 'testing with </div><p>new line';
    const expected = '<p>testing with </p><p>new line</p>';
    testMarkdown(question, expected);
  });

  it('removes p tag if content fits a single paragraph', () => {
    const question = 'test with **bold** and *italic* words';
    const expected = 'test with <strong>bold</strong> and <em>italic</em> words';
    testMarkdown(question, expected, { inline: true });
  });

  it('ignores paragraphs in inline parsing', () => {
    const question = 'test with **bold** and *italic* words\n\nand a new line';
    const expected = 'test with <strong>bold</strong> and <em>italic</em> words\n\nand a new line';
    testMarkdown(question, expected, { inline: true });
  });

  it('ignores other block constructs in inline parsing', () => {
    const question = '* single _item_';
    const expected = '* single <em>item</em>';
    testMarkdown(question, expected, { inline: true });
  });

  it('sanitizes HTML script tags', () => {
    const question = 'testing<script>alert("XSS")</script>';
    const expected = '<p>testing</p>';
    testMarkdown(question, expected);
  });

  it('sanitizes HTML javascript event tags', () => {
    const question = 'testing<img src="x" onerror="alert(\'XSS\')">';
    const expected = '<p>testing<img src="x"></p>';
    testMarkdown(question, expected);
  });

  it('sanitizes HTML javascript iframes', () => {
    const question = 'testing<iframe src="javascript:alert(\'delta\')"></iframe>';
    const expected = '<p>testing</p>';
    testMarkdown(question, expected);
  });

  it('sanitizes inline HTML tags if allowHtml is false', () => {
    const question = 'testing <em>html</em>';
    const expected = '<p>testing html</p>';
    testMarkdown(question, expected, { allowHtml: false });
  });

  it('sanitizes an HTML block if allowHtml is false', () => {
    const question =
      '_Before_ the block\n\n<div>HTML block to be sanitized</div>\n\n**After** the block';
    const expected = '<p><em>Before</em> the block</p>\n<p><strong>After</strong> the block</p>';
    testMarkdown(question, expected, { allowHtml: false });
  });

  it('renders markdown correctly if allowHtml is false', () => {
    const question = '# testing';
    const expected = '<h1>testing</h1>';
    testMarkdown(question, expected, { allowHtml: false });
  });

  it('does not treat math delimiters as math if interpretMath is false', () => {
    const question = '$a _b=c_ d$';
    const expected = '<p>$a <em>b=c</em> d$</p>';
    testMarkdown(question, expected, { interpretMath: false });
  });
});
