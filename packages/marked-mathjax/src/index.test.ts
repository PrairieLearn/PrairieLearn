import { Marked } from 'marked';
// @ts-expect-error MathJax does not include types
import mathjax from 'mathjax';
import { assert, beforeAll, describe, it } from 'vitest';

import { addMathjaxExtension } from './index.js';

const marked = new Marked();

async function testMarkdown(original: string, expected: string) {
  const actual = await marked.parse(original);
  assert.equal(actual.toString().trim(), expected);
}

describe('Markdown processing', () => {
  beforeAll(async () => {
    const MathJax = await mathjax.init({
      options: { ignoreHtmlClass: 'mathjax_ignore|tex2jax_ignore' },
      tex: {
        inlineMath: [
          ['$', '$'],
          ['\\(', '\\)'],
        ],
      },
      loader: { load: ['input/tex'] },
    });
    addMathjaxExtension(marked, MathJax);
  });

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

  it('handles math inside em tags', async () => {
    const question = '_before $a_ 1 = b _2$ after_';
    const expected = '<p><em>before $a_ 1 = b _2$ after</em></p>';
    await testMarkdown(question, expected);
  });

  it('handles math inside strong tags', async () => {
    const question = '**before $a** 1 **2$ after**';
    const expected = '<p><strong>before $a** 1 **2$ after</strong></p>';
    await testMarkdown(question, expected);
  });

  it('handles inline latex', async () => {
    const question = '$a_1 + a_2 = a_3$';
    const expected = '<p>$a_1 + a_2 = a_3$</p>';
    await testMarkdown(question, expected);
  });

  it('handles multiple lines of inline latex', async () => {
    const question = '$a_{ 1 } = 3$ and\n\\(a_{ 2 } = 4\\)';
    const expected = '<p>$a_{ 1 } = 3$ and\n\\(a_{ 2 } = 4\\)</p>';
    await testMarkdown(question, expected);
  });

  it('handles block latex', async () => {
    const question = '$$\na^2 + b^2 = c^2\n$$';
    const expected = '<p>$$\na^2 + b^2 = c^2\n$$</p>';
    await testMarkdown(question, expected);
  });

  it('handles block latex with asterisks', async () => {
    const question = '$$\na **b** c\n$$';
    const expected = '<p>$$\na **b** c\n$$</p>';
    await testMarkdown(question, expected);
  });

  it('handles block latex with HTML', async () => {
    const question = '$$\na <b> c\n$$';
    const expected = '<p>$$\na &lt;b&gt; c\n$$</p>';
    await testMarkdown(question, expected);
  });

  it('handles two consecutive latex blocks', async () => {
    const question = '$$\na **b** c\n$$\n$$\na+b=c\n$$';
    const expected = '<p>$$\na **b** c\n$$\n$$\na+b=c\n$$</p>';
    await testMarkdown(question, expected);
  });

  it('handles block latex with asterisks and surrounding text', async () => {
    const question = 'testing\n\\[\na **b** c\n\\]\ntesting';
    const expected = '<p>testing\n\\[\na **b** c\n\\]\ntesting</p>';
    await testMarkdown(question, expected);
  });

  it('handles escapes', async () => {
    const question =
      'This line has a \\$ dollar sign \\$, a \\\\ single backslash and \\\\\\\\ double backslash. It also has a \\\\( escaped bracket \\\\) and a \\\\[ escaped square bracket \\\\].';
    const expected =
      '<p>This line has a <span class="mathjax_ignore">$</span> dollar sign <span class="mathjax_ignore">$</span>, a <span class="mathjax_ignore">\\</span> single backslash and <span class="mathjax_ignore">\\</span><span class="mathjax_ignore">\\</span> double backslash. It also has a <span class="mathjax_ignore">\\</span>( escaped bracket <span class="mathjax_ignore">\\</span>) and a <span class="mathjax_ignore">\\</span>[ escaped square bracket <span class="mathjax_ignore">\\</span>].</p>';
    await testMarkdown(question, expected);
  });

  it('handles lists', async () => {
    const question =
      '* first line with $e=mc^2$\n* second line with $a+b=c$\n* third line with **bold** and a $ dollar sign';
    const expected =
      '<ul>\n<li>first line with $e=mc^2$</li>\n<li>second line with $a+b=c$</li>\n<li>third line with <strong>bold</strong><span class="mathjax_ignore"> and a $ dollar sign</span></li>\n</ul>';
    await testMarkdown(question, expected);
  });

  it('handles GFM extension for tables', async () => {
    const question = '| foo | bar |\n| --- | --- |\n| \\$baz | $bim$ |';
    const expected =
      '<table>\n<thead>\n<tr>\n<th>foo</th>\n<th>bar</th>\n</tr>\n</thead>\n<tbody><tr>\n<td><span class="mathjax_ignore">$</span>baz</td>\n<td>$bim$</td>\n</tr>\n</tbody></table>';
    await testMarkdown(question, expected);
  });

  it('handles HTML tags', async () => {
    const question =
      'testing with <strong>bold and $m^a_th$</strong> and <em>italics with $ dollar sign</em> words';
    const expected =
      '<p>testing with <strong>bold and $m^a_th$</strong> and <em><span class="mathjax_ignore">italics with $ dollar sign</span></em> words</p>';
    await testMarkdown(question, expected);
  });
});
