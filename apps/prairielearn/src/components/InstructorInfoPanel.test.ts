import { describe, expect, it } from 'vitest';

import type { Course, Question, Variant } from '../lib/db-types.js';

import { InstructorInfoPanel } from './InstructorInfoPanel.js';
import type { QuestionContext } from './QuestionContainer.types.js';

function renderPanel({
  course,
  question,
  question_is_shared,
  questionContext,
}: {
  course: Partial<Course>;
  question: Partial<Question>;
  question_is_shared: boolean;
  questionContext: QuestionContext;
}) {
  return InstructorInfoPanel({
    course: { id: '1', display_timezone: 'UTC', example_course: false, ...course } as Course,
    question: { id: '2', course_id: '1', qid: 'addNumbers', ...question } as Question,
    variant: { id: '3', variant_seed: '123', date: new Date(0), duration: 0 } as Variant,
    authz_data: { has_course_permission_preview: true },
    question_is_shared,
    questionContext,
    csrfToken: 'token',
  }).toString();
}

function renderSharedAs(options: {
  course: Partial<Course>;
  question: Partial<Question>;
  question_is_shared: boolean;
}) {
  const panel = renderPanel({ ...options, questionContext: 'instructor' });
  return panel.match(/Shared As:<\/div>\s*(?:<div>\s*)?(?:<a [^>]*>)?([^<]*)</)?.[1]?.trim();
}

function renderPublicQidLink(options: {
  course: Partial<Course>;
  question: Partial<Question>;
  question_is_shared: boolean;
}) {
  const panel = renderPanel({ ...options, questionContext: 'public' });
  const match = panel.match(/QID:<\/div>\s*<div>\s*<a href="([^"]*)">\s*([^<]*?)\s*<\/a>/);
  return match ? { href: match[1], text: match[2] } : undefined;
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

  it('includes the course sharing name for sharing-set questions whose source is public', () => {
    expect(
      renderSharedAs({
        course: { sharing_name: 'my-course' },
        question: { share_publicly: false, share_source_publicly: true },
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

  it('links the public QID without the sharing name for questions shared only for copying', () => {
    expect(
      renderPublicQidLink({
        course: { sharing_name: 'my-course' },
        question: { share_publicly: false, share_source_publicly: true },
        question_is_shared: false,
      }),
    ).toEqual({
      href: '/pl/public/course/1/question/2/preview?variant_seed=123',
      text: 'addNumbers',
    });
  });

  it('links the public QID with the sharing name for publicly shared questions', () => {
    expect(
      renderPublicQidLink({
        course: { sharing_name: 'my-course' },
        question: { share_publicly: true, share_source_publicly: false },
        question_is_shared: true,
      }),
    ).toEqual({
      href: '/pl/public/course/1/question/2/preview?variant_seed=123',
      text: '@my-course/addNumbers',
    });
  });
});
