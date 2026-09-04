export function getCourseAgentStreamId({
  courseId,
  userId,
  runId,
}: {
  courseId: string;
  userId: string;
  runId: string;
}) {
  return `course-agent:${courseId}:${userId}:${runId}`;
}
