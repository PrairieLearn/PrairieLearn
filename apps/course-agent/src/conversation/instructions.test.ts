import { describe, expect, it } from 'vitest';

import { buildInstructions, describePageLocation, describeTimezone } from './instructions.js';

describe('buildInstructions', () => {
  const course = { courseTitle: 'Calculus', courseShortName: 'MATH 101' };

  it('asks for times in the course timezone', () => {
    const rules = describeTimezone('America/Denver');
    expect(rules).toContain("The course's timezone is America/Denver.");
    expect(buildInstructions({ ...course, timezone: 'America/Denver' }, 'github')).toContain(rules);
  });

  it('names no timezone for a conversation whose context has none', () => {
    expect(buildInstructions(course, 'github')).not.toContain("course's timezone");
    expect(buildInstructions(undefined, 'local')).not.toContain("course's timezone");
  });
});

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
