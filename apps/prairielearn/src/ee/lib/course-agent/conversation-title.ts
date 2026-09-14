import { updateCourseAgentTitle } from '../../../models/course-agent.js';

export async function nameCourseAgentConversation({
  conversationId,
  prompt,
}: {
  conversationId: string;
  prompt: string;
}) {
  await updateCourseAgentTitle(conversationId, prompt.trim().slice(0, 80));
}
