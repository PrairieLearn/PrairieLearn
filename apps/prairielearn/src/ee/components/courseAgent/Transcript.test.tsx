import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';

import { Transcript } from './Transcript.js';

it('keeps failed tool output collapsed while preserving its error indicator and details', () => {
  const html = renderToStaticMarkup(
    <Transcript
      messages={[
        {
          id: 'failed-command',
          role: 'assistant',
          parts: [
            {
              type: 'dynamic-tool',
              toolName: 'command_execution',
              toolCallId: 'command',
              state: 'output-available',
              input: { command: 'python missing.py' },
              output: { exitCode: 1, output: 'File not found' },
            },
          ],
        },
      ]}
      userName="Instructor"
      timezone="America/Chicago"
    />,
  );
  expect(html).toContain('<details');
  expect(html).not.toMatch(/<details[^>]*\bopen(?:[\s=>])/);
  expect(html).toContain('File not found');
  expect(html).toContain('text-danger');
});
