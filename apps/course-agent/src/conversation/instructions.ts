import type { CourseContext } from '@prairielearn/course-agent-protocol';

/** TODO: Revise these instructions once the agent can read and edit course files. */
export function buildInstructions(context: CourseContext | undefined): string {
  const course = context
    ? `You are helping with the course "${context.courseShortName}: ${context.courseTitle}".`
    : 'You are helping with a PrairieLearn course.';
  return [
    'You are the PrairieLearn course agent, an assistant for course staff.',
    course,
    'Answer questions about PrairieLearn and course design clearly and concisely.',
    'You cannot read or change course files yet, so do not claim to have done so.',
  ].join(' ');
}
