import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CourseAgentMarkdown } from './CourseAgentMarkdown.js';

describe('CourseAgentMarkdown', () => {
  it('renders common Markdown while dropping raw HTML', () => {
    const output = renderToStaticMarkup(
      <CourseAgentMarkdown>
        {'Use `x`:\n\n- one\n- two\n\n```python\nprint("hi")\n```\n\n<script>alert(1)</script>'}
      </CourseAgentMarkdown>,
    );

    expect(output).toContain('<code>x</code>');
    expect(output).toContain('<ul>');
    expect(output).toContain('<pre><code class="language-python">');
    expect(output).not.toContain('<script>');
  });
});
