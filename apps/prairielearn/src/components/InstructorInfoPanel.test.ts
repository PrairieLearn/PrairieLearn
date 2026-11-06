import { describe, expect, it } from 'vitest';

import type { Course, Question, Variant } from '../lib/db-types.js';

import { InstructorInfoPanel } from './InstructorInfoPanel.js';

function renderSharedAs({
  course,
  question,
  question_is_shared,
}: {
  course: Partial<Course>;
  question: Partial<Question>;
  question_is_shared: boolean;
}) {
  const panel = InstructorInfoPanel({
    course: { id: '1', display_timezone: 'UTC', example_course: false, ...course } as Course,
    question: { id: '2', course_id: '1', qid: 'addNumbers', ...question } as Question,
    variant: { id: '3', variant_seed: '123', date: new Date(0), duration: 0 } as Variant,
    authz_data: { has_course_permission_preview: true },
    question_is_shared,
    questionContext: 'instructor',
    csrfToken: 'token',
  }).toString();
  return panel.match(/Shared As:<\/div>\s*(?:<div>\s*)?(?:<a [^>]*>)?([^<]*)</)?.[1]?.trim();
}

describe('InstructorInfoPanel', () => {
  it('includes the course sharing name for questions shared only via sharing sets', () => {
    expect(
      renderSharedAs({
        course: { sharing_name: 'my-course' },
        question: { share_publicly: false, share_source_publicly: false },
        question_is_shared: true,
      }),
    ).toBe('@my-course/addNumbers');
  });

  it('includes the course sharing name for publicly shared questions', () => {
    expect(
      renderSharedAs({
        course: { sharing_name: 'my-course' },
        question: { share_publicly: true, share_source_publicly: false },
        question_is_shared: true,
      }),
    ).toBe('@my-course/addNumbers');
  });

  it('omits the course sharing name for example course questions', () => {
    expect(
      renderSharedAs({
        course: { sharing_name: 'example-course', example_course: true },
        question: { share_publicly: true, share_source_publicly: false },
        question_is_shared: true,
      }),
    ).toBe('addNumbers');
  });

  it('does not show "Shared As" for questions that are not shared', () => {
    expect(
      renderSharedAs({
        course: { sharing_name: 'my-course' },
        question: { share_publicly: false, share_source_publicly: true },
        question_is_shared: false,
      }),
    ).toBeUndefined();
  });
});
