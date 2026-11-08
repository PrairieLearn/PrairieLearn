import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { userMessageInput } from './instructions.js';

const message = (metadata: unknown): UIMessage => ({
  id: 'm',
  role: 'user',
  metadata,
  parts: [{ type: 'text', text: 'Fix this question' }],
});

describe('userMessageInput', () => {
  it('names the page the instructor is viewing ahead of their text', () => {
    expect(
      userMessageInput(
        message({
          location: {
            path: '/pl/course_instance/1/instructor/question/2/preview',
            title: 'Question Preview',
            courseInstance: 'Fa25',
            question: 'algebra/add',
          },
        }),
      ),
    ).toBe(
      '[The instructor is viewing the PrairieLearn page "Question Preview" at /pl/course_instance/1/instructor/question/2/preview (course instance "Fa25", question "algebra/add").]\n\nFix this question',
    );
  });

  it('sends the text alone when the location is missing or malformed', () => {
    expect(userMessageInput(message(undefined))).toBe('Fix this question');
    expect(userMessageInput(message({ location: { path: 1 } }))).toBe('Fix this question');
  });
});
