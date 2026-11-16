import { describe, expect, it } from 'vitest';

import { describePageLocation } from './instructions.js';

describe('describePageLocation', () => {
  it('names the page and the course items it belongs to', () => {
    expect(
      describePageLocation({
        path: '/pl/course_instance/1/instructor/assessment/2/question/3/preview',
        page: 'question.preview',
        courseInstance: 'Fa25',
        assessment: 'hw1',
        question: 'algebra/add',
        questionFromAnotherCourse: true,
      }),
    ).toBe(
      'The instructor is viewing the PrairieLearn page "question.preview" at "/pl/course_instance/1/instructor/assessment/2/question/3/preview" (course instance "Fa25", assessment "hw1", question "algebra/add" shared from another course, so its files are not in this checkout).',
    );
  });
});
