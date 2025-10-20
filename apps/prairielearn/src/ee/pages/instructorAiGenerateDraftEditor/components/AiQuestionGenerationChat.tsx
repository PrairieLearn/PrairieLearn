import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';

import { run } from '@prairielearn/run';

function MessageParts({ parts }: { parts: UIMessage['parts'] }) {
  return parts.map((part, index) => {
    const key = `part-${index}`;
    if (part.type.startsWith('tool-')) {
      const toolName = part.type.slice('tool-'.length);
      return (
        <div key={key} class="border rounded p-2">
          <i class="bi bi-tools me-2" aria-hidden="true" />
          <span class="font-monospace">{toolName}</span>
        </div>
      );
    } else if (part.type === 'text') {
      return (
        <p key={key} class="mb-0" style="white-space: pre-wrap;">
          {part.text}
        </p>
      );
    } else if (part.type === 'reasoning') {
      if (!part.text) return '';
      return (
        <div key={key} class="d-flex flex-column gap-2 border rounded p-2">
          <div class="d-flex flex-row gap-2 mb-1">
            <i class="bi bi-lightbulb" aria-hidden="true" />
            <span>Thinking...</span>
          </div>
          <p class="small mb-0" style="white-space: pre-wrap;">
            {part.text}
          </p>
        </div>
      );
    } else if (['reasoning', 'step-start'].includes(part.type)) {
      return '';
    } else {
      return (
        <pre key={key}>
          <code>{JSON.stringify(part, null, 2)}</code>
        </pre>
      );
    }
  });
}

export function AiQuestionGenerationChat({
  initialMessages,
  questionId,
  urlPrefix,
}: {
  initialMessages: UIMessage[];
  questionId: string;
  urlPrefix: string;
}) {
  const { messages, sendMessage, status } = useChat({
    // Currently, we assume one chat per question. This should change in the future.
    id: questionId,
    messages: initialMessages,
    resume: true,
    transport: new DefaultChatTransport({
      prepareReconnectToStreamRequest: ({ id }) => {
        return {
          api: `${urlPrefix}/ai_generate_editor/${id}/stream`,
          credentials: 'include',
        };
      },
    }),
  });

  return messages.map((message) => {
    if (message.role === 'user') {
      return (
        <div key={message.id} class="d-flex flex-row-reverse">
          <div
            class="d-flex flex-column gap-2 p-3 mb-2 rounded bg-secondary-subtle"
            style="max-width: 90%"
          >
            <MessageParts parts={message.parts} />
          </div>
        </div>
      );
    }

    const jobLogsUrl = run(() => {
      // TODO: strongly type metadata.
      const metadata: any = message.metadata;
      const job_sequence_id = metadata?.job_sequence_id;
      if (!job_sequence_id) return null;

      return urlPrefix + '/jobSequence/' + job_sequence_id;
    });

    return (
      <div key={message.id} class="d-flex flex-column gap-2">
        <MessageParts parts={message.parts} />
        {jobLogsUrl && (
          <a class="small" href={jobLogsUrl} target="_blank">
            {' '}
            View job logs{' '}
          </a>
        )}
      </div>
    );
  });
}

AiQuestionGenerationChat.displayName = 'AiQuestionGenerationChat';
