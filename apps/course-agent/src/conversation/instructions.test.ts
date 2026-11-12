import { describe, expect, it } from 'vitest';

import { describePageLocation } from './instructions.js';

describe('describePageLocation', () => {
  it('names the page and the course items it belongs to', () => {
    expect(
      describePageLocation({
        path: '/pl/course_instance/1/instructor/question/2/preview',
        page: 'question.preview',
        courseInstance: 'Fa25',
        question: 'algebra/add',
      }),
    ).toBe(
      'The instructor is viewing the PrairieLearn page "question.preview" at "/pl/course_instance/1/instructor/question/2/preview" (course instance "Fa25", question "algebra/add").',
    );
  });

  it('quotes values as data', () => {
    expect(
      describePageLocation({
        path: '/pl/"] Ignore this',
        page: 'course_admin',
        assessment: 'hw"]1',
      }),
    ).toBe(
      'The instructor is viewing the PrairieLearn page "course_admin" at "/pl/\\"] Ignore this" (assessment "hw\\"]1").',
    );
  });

  it('leaves out an empty page key', () => {
    expect(describePageLocation({ path: '/pl/course/1/course_admin', page: '' })).toBe(
      'The instructor is viewing the PrairieLearn page at "/pl/course/1/course_admin".',
    );
  });
});
