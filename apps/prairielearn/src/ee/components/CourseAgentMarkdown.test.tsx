import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { workspaceMarkdownComponents } from './CourseAgentPanel.js';
import { ChatMarkdown } from './chat/ChatMarkdown.js';

describe('CourseAgentMarkdown', () => {
  it('keeps file references non-clickable but permits public documentation links', () => {
    const output = renderToStaticMarkup(
      <ChatMarkdown
        components={workspaceMarkdownComponents}
        content="[file](server.py) [workspace](/workspace/server.py) [local](file:///workspace/server.py) [docs](https://docs.prairielearn.com)"
      />,
    );
    expect(output).not.toContain('href="server.py"');
    expect(output).not.toContain('href="/workspace');
    expect(output).not.toContain('href="file:');
    expect(output).toContain('href="https://docs.prairielearn.com"');
  });
  it('renders common Markdown while dropping raw HTML', () => {
    const output = renderToStaticMarkup(
      <ChatMarkdown
        components={workspaceMarkdownComponents}
        content={
          'Use `x`:\n\n- one\n- two\n\n```python\nprint("hi")\n```\n\n<script>alert(1)</script>'
        }
      />,
    );

    expect(output).toContain('<code>x</code>');
    expect(output).toContain('<ul>');
    expect(output).toContain('<pre><code class="language-python">');
    expect(output).not.toContain('<script>');
  });
});
