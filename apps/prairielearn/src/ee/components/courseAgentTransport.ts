import { DefaultChatTransport } from 'ai';

import type { CourseAgentMessage } from '../lib/course-agent/ui-stream.js';

export interface CourseAgentRun {
  conversationId: string;
  sandboxId: string;
  runId: string;
}

export function createCourseAgentTransport(
  startRun: (input: {
    conversationId?: string;
    courseInstanceId: string | null;
    prompt: string;
  }) => Promise<CourseAgentRun>,
  courseId: string,
  courseInstanceId: string | null,
  onRun: (run: CourseAgentRun) => void,
  initialRun: CourseAgentRun | null = null,
) {
  let run = initialRun;
  const api = `/pl/course/${courseId}/course_agent/stream`;
  const streamUrl = () => (run ? `${api}?${new URLSearchParams({ ...run })}` : api);
  return new DefaultChatTransport<CourseAgentMessage>({
    api,
    async prepareSendMessagesRequest({ messages, trigger }) {
      const message = messages.at(-1);
      if (trigger !== 'submit-message' || message?.role !== 'user') {
        throw new Error('Send a new message to the course agent.');
      }
      const conversationId = run?.conversationId;
      run = null;
      // tRPC owns the authenticated mutation; the SDK then consumes its resumable GET stream.
      run = await startRun({
        conversationId,
        courseInstanceId,
        prompt: message.parts
          .filter((part) => part.type === 'text')
          .map((part) => part.text)
          .join(''),
      });
      onRun(run);
      return { api: streamUrl(), body: {} };
    },
    prepareReconnectToStreamRequest: () => ({ api: streamUrl() }),
    fetch: (url, init) =>
      url === api
        ? Promise.resolve(new Response(null, { status: 204 }))
        : fetch(url, { ...init, method: 'GET', body: undefined }),
  });
}
