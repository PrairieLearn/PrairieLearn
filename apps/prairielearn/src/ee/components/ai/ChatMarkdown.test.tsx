import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ChatMarkdown } from './ChatMarkdown.js';

const TABLE = ['| Element | Use |', '| --- | --- |', '| `pl-number-input` | **Numbers** |'].join(
  '\n',
);

describe('ChatMarkdown', () => {
  it('renders a table with Bootstrap classes', () => {
    const html = renderToStaticMarkup(<ChatMarkdown content={TABLE} />);

    expect(html).toContain('<div class="table-responsive mb-3"><table class="table ');
    expect(html).toContain('<th>Element</th>');
    expect(html).toContain('<td><code>pl-number-input</code></td>');
    expect(html).toContain('<td><strong>Numbers</strong></td>');
  });

  it('renders a table that is cut off mid-stream', () => {
    const html = renderToStaticMarkup(
      <ChatMarkdown content={`${TABLE}\n| \`pl-integer-input\` | **Whole`} isStreaming />,
    );

    expect(html).toContain('<td><code>pl-integer-input</code></td>');
    expect(html).toContain('<td><strong>Whole</strong></td>');
  });

  it('renders code blocks as plain pre and code elements', () => {
    const html = renderToStaticMarkup(
      <ChatMarkdown content={'Use `x`:\n\n```python\nx = 1\n```\n'} />,
    );

    expect(html).toContain('<p>Use <code>x</code>:</p>');
    expect(html).toContain('<pre><code class="language-python">x = 1\n</code></pre>');
  });

  it('keeps links in the same tab and applies the URL transform', () => {
    const html = renderToStaticMarkup(
      <ChatMarkdown
        content="[info.json](/workspace/info.json)"
        urlTransform={(url) => url.replace('/workspace/', '/pl/course/1/file/')}
      />,
    );

    expect(html).toContain('<a href="/pl/course/1/file/info.json">info.json</a>');
  });
});
