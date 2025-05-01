import { assert } from 'chai';
import { Marked } from 'marked';
// @ts-expect-error Mathjax is not a module
import mathjax from 'mathjax';

import { addMathjaxExtension } from './index.js';

const marked = new Marked();

async function testMarkdown(original: string, expected: string) {
  const actual = await marked.parse(original);
  assert.equal(actual.toString().trim(), expected);
}

describe('Markdown processing', () => {
  before(async () => {
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
    const expected =
      '<h1><span class="mathjax_ignore">Hello, world!</span></h1>\n<p><span class="mathjax_ignore">This </span><strong><span class="mathjax_ignore">works</span></strong><span class="mathjax_ignore">.</span></p>';
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
    const question = '$a_{ 1 } = 3$ and\n\\(a_{ 2 } = 4\\)';
    const expected =
      '<p>$a_{ 1 } = 3$<span class="mathjax_ignore"> and\n</span>\\(a_{ 2 } = 4\\)</p>';
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

  it('handles two consecutive latex blocks', async () => {
    const question = '$$\na **b** c\n$$\n$$\na+b=c\n$$';
    const expected = '<p>$$\na **b** c\n$$<span class="mathjax_ignore">\n</span>$$\na+b=c\n$$</p>';
    await testMarkdown(question, expected);
  });

  it('handles block latex with asterisks and surrounding text', async () => {
    const question = 'testing\n\\[\na **b** c\n\\]\ntesting';
    const expected =
      '<p><span class="mathjax_ignore">testing\n</span>\\[\na **b** c\n\\]<span class="mathjax_ignore">\ntesting</span></p>';
    await testMarkdown(question, expected);
  });

  it('handles escapes', async () => {
    const question =
      'This line has a \\$ dollar sign \\$, a \\\\ single backslash and \\\\\\\\ double backslash.';
    const expected =
      '<p><span class="mathjax_ignore">This line has a </span><span class="mathjax_ignore">$</span><span class="mathjax_ignore"> dollar sign </span><span class="mathjax_ignore">$</span><span class="mathjax_ignore">, a </span><span class="mathjax_ignore">\\</span><span class="mathjax_ignore"> single backslash and </span><span class="mathjax_ignore">\\</span><span class="mathjax_ignore">\\</span><span class="mathjax_ignore"> double backslash.</span></p>';
    await testMarkdown(question, expected);
  });

  it('handles lists', async () => {
    const question = '* first line with $e=mc^2$\n* second line with $a+b=c$';
    const expected =
      '<ul>\n<li><span class="mathjax_ignore">first line with </span>$e=mc^2$</li>\n<li><span class="mathjax_ignore">second line with </span>$a+b=c$</li>\n</ul>';
    await testMarkdown(question, expected);
  });

  it('handles GFM extension for tables', async () => {
    const question = '| foo | bar |\n| --- | --- |\n| baz | $bim$ |';
    const expected =
      '<table>\n<thead>\n<tr>\n<th><span class="mathjax_ignore">foo</span></th>\n<th><span class="mathjax_ignore">bar</span></th>\n</tr>\n</thead>\n<tbody><tr>\n<td><span class="mathjax_ignore">baz</span></td>\n<td>$bim$</td>\n</tr>\n</tbody></table>';
    await testMarkdown(question, expected);
  });

  it('handles HTML tags', async () => {
    const question = 'testing with <strong>bold</strong> and <em>italics and $m^a_th$</em> words';
    const expected =
      '<p><span class="mathjax_ignore">testing with </span><strong><span class="mathjax_ignore">bold</span></strong><span class="mathjax_ignore"> and </span><em><span class="mathjax_ignore">italics and </span>$m^a_th$</em><span class="mathjax_ignore"> words</span></p>';
    await testMarkdown(question, expected);
  });
});
