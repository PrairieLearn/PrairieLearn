import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';

export function AiQuestionGenerationChat({
  initialMessages,
  questionId,
  urlPrefix,
}: {
  initialMessages: UIMessage[];
  questionId: string;
  urlPrefix: string;
}) {
  console.log('urlPrefix', urlPrefix);
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

  console.log(messages);

  return messages.map((message) => {
    return (
      <div key={message.id}>
        <div>{message.role}</div>
        {message.parts.map((part, partIndex) => {
          return (
            <div
              // eslint-disable-next-line @eslint-react/no-array-index-key
              key={partIndex}
              style={{ whiteSpace: 'pre-wrap' }}
            >
              {JSON.stringify(part, null, 2)}
            </div>
          );
        })}
      </div>
    );
  });
}

AiQuestionGenerationChat.displayName = 'AiQuestionGenerationChat';
