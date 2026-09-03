import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ToolCallGroup } from './CourseAgentPanel.js';

describe('tool activity visibility', () => {
  it('does not render a dropdown for a completed turn without tools or startup activity', () => {
    expect(
      renderToStaticMarkup(
        <ToolCallGroup events={[]} startedAt="2026-09-03T12:00:00Z" busy={false} />,
      ),
    ).toBe('');
  });

  it('shows progress without an empty dropdown while waiting for activity', () => {
    const output = renderToStaticMarkup(
      <ToolCallGroup events={[]} startedAt="2026-09-03T12:00:00Z" busy />,
    );
    expect(output).toContain('Working');
    expect(output).not.toContain('<button');
    expect(output).not.toContain('No tools used');
  });
});
