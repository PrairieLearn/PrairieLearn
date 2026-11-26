import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ChatMarkdown } from './ChatMarkdown.js';

const TABLE = ['| Element | Use |', '| --- | --- |', '| `pl-number-input` | **Numbers** |'].join(
  '\n',
);

function render(content: string, { streaming = false, math = true } = {}) {
  return renderToStaticMarkup(<ChatMarkdown content={content} streaming={streaming} math={math} />);
}

/** The TeX source of each expression KaTeX typeset, from its MathML annotation. */
function typesetMath(html: string) {
  return [
    ...html.matchAll(
      /<math[^>]*?(display="block")?>.*?<annotation encoding="application\/x-tex">(.*?)<\/annotation>/gs,
    ),
  ].map(([, display, tex]) => ({ tex: tex.trim(), display: display === 'display="block"' }));
}

describe('ChatMarkdown', () => {
  it('renders a table with Bootstrap classes', () => {
    const html = render(TABLE);

    expect(html).toContain('<div class="table-responsive mb-3"><table class="table ');
    expect(html).toContain('<th>Element</th>');
    expect(html).toContain('<td><code>pl-number-input</code></td>');
    expect(html).toContain('<td><strong>Numbers</strong></td>');
  });

  it('lets inline code break after slashes', () => {
    const html = render('`Cs101/hw01/info.json`');

    expect(html).toContain('<code>Cs101/<wbr/>hw01/<wbr/>info.json</code>');
  });

  it('leaves unmatched brackets and underscores in a finished message', () => {
    const html = render('The interval [0, 1) is half-open.\n\nCall __init for setup.');

    expect(html).toContain('<p>The interval [0, 1) is half-open.</p>');
    expect(html).toContain('<p>Call __init for setup.</p>');
  });

  it('renders code blocks as plain pre and code elements', () => {
    const html = render('Use `x`:\n\n```python\nx = 1\n```\n');

    expect(html).toContain('<p>Use <code>x</code>:</p>');
    expect(html).toContain('<pre><code class="language-python">x = 1\n</code></pre>');
  });

  it('shows HTML tags as text', () => {
    const html = render('Use <pl-number-input answers-name="x"> here.');

    expect(html).toContain('Use &lt;pl-number-input answers-name=&quot;x&quot;&gt; here.');
  });

  it('typesets dollar-sign math instead of parsing it as markdown', () => {
    const html = render('Solve $a_1 + b_1$ and\n\n$$\nx_1 * y_1 * z\n$$\n');

    expect(typesetMath(html)).toEqual([
      { tex: 'a_1 + b_1', display: false },
      { tex: 'x_1 * y_1 * z', display: true },
    ]);
  });

  it('leaves math as text unless math is enabled', () => {
    const html = render('Solve $x^2$ and \\(y\\).', { math: false });

    expect(typesetMath(html)).toEqual([]);
    expect(html).toContain('Solve $x^2$ and (y).');
  });

  it('typesets \\(...\\) inline and \\[...\\] on lines of its own', () => {
    const html = render(
      [
        'So \\(p_1 * q_1\\) is even, and',
        '\\[ x^2 = 2 \\]',
        'while the product is',
        '\\[',
        '\\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\end{bmatrix}',
        '=',
        '\\begin{bmatrix} x \\\\ y \\end{bmatrix}',
        '\\]',
        'Brackets like \\[a, b\\] in a sentence and',
        '\\[0, 1) at the start of a line stay text.',
        '',
        'So does **this** paragraph.',
      ].join('\n'),
    );

    expect(html).not.toContain('<h1');
    expect(typesetMath(html)).toEqual([
      { tex: 'p_1 * q_1', display: false },
      { tex: 'x^2 = 2', display: true },
      {
        tex: '\\begin{bmatrix} 1 &amp; 2 \\\\ 3 &amp; 4 \\end{bmatrix}\n=\n\\begin{bmatrix} x \\\\ y \\end{bmatrix}',
        display: true,
      },
    ]);
    expect(html).toContain('Brackets like [a, b] in a sentence and\n[0, 1) at the start');
    expect(html).toContain('<strong>this</strong>');
  });

  it('typesets math with pipes in a table cell', () => {
    const html = render('| Value | Note |\n| --- | --- |\n| \\(|x|\\) | $|y|$ |');

    expect(typesetMath(html)).toEqual([
      { tex: '\\vert{}x\\vert{}', display: false },
      { tex: '\\vert{}y\\vert{}', display: false },
    ]);
  });

  it('holds back math until it has finished streaming', () => {
    const html = render(
      [
        '1. By linearity, \\(\\mathbb{E}[X]=np\\):',
        '   \\[',
        '   \\operatorname{Var}(X)=\\sum_{i=1}^n\\operatorname{Var}(I_i)=npq',
        '   \\]',
        '',
        'Thus,',
        '\\[',
        'A^{-1} = \\begin{bmatrix}\\frac15&\\frac35\\\\[2',
      ].join('\n'),
      { streaming: true },
    );

    expect(typesetMath(html).map(({ display }) => display)).toEqual([false, true]);
    expect(html).toContain('Thus,');
    expect(html).not.toContain('A^{-1}');

    for (const content of ['So \\(x = \\frac{1', 'So\n\n$$\nx = \\frac{1']) {
      const html = render(content, { streaming: true });
      expect(html).toContain('So');
      expect(html).not.toContain('frac');
    }

    expect(render('Use ``a \\(x`` then continue', { streaming: true })).toContain('then continue');

    // The start of the next heading isn't shown as an empty heading.
    expect(render('Done.\n\n#', { streaming: true })).not.toContain('<h1');
  });

  it('leaves math delimiters in code alone', () => {
    const html = render(
      [
        '``a \\(x\\) b``',
        '',
        '~~~python',
        'pattern = r"\\(x\\)"',
        '~~~',
        '',
        '    indented = "\\[y\\]"',
      ].join('\n'),
    );

    expect(typesetMath(html)).toEqual([]);
    expect(html).toContain('<code>a \\(x\\) b</code>');
    expect(html).toContain('pattern = r&quot;\\(x\\)&quot;');
    expect(html).toContain('indented = &quot;\\[y\\]&quot;');
  });

  it('does not read prices or shell variables as math', () => {
    const html = render(
      'The book costs $5 and the pen costs $10. Set $HOME and $PATH. Costs $5, and $y=2$. Costs $5 and a $ sign. $x$y is text.',
    );

    expect(typesetMath(html)).toEqual([{ tex: 'y=2', display: false }]);
  });

  it('does not let math add links or styles to the page', () => {
    const html = render(
      'A $\\href{javascript:alert(1)}{link}$ and \\(\\htmlStyle{position:fixed}{x}\\).',
    );

    expect(html).not.toMatch(/<a\s/);
    expect(html).not.toMatch(/style="[^"]*position/);
    expect(render('$\\rule{500em}{1em}$')).not.toContain('500em;');
  });

  it('keeps links in the same tab and applies the URL transform', () => {
    const html = renderToStaticMarkup(
      <ChatMarkdown
        content="[info.json](/workspace/info.json)"
        streaming={false}
        urlTransform={(url) => url.replace('/workspace/', '/pl/course/1/file/')}
      />,
    );

    expect(html).toContain('<a href="/pl/course/1/file/info.json">info.json</a>');
  });
});
