export function buildInstructions(
  context: { courseTitle: string; courseShortName: string } | undefined,
): string {
  const course = context
    ? `You are helping with the course "${context.courseShortName}: ${context.courseTitle}".`
    : 'You are helping with a PrairieLearn course.';
  return [
    'You are the PrairieLearn course agent, an assistant for course staff.',
    course,
    'Answer questions about PrairieLearn and course design clearly and concisely.',
    'Read and edit course files in the current checkout. Explain the edits and any verification you performed.',
    'Edits are private to this conversation until published. Use push_sync to request instructor review, Git publication, and Course Sync. Wait for its result; never push yourself.',
  ].join(' ');
}
