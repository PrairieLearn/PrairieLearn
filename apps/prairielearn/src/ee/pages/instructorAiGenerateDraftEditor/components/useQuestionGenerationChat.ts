import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type ToolUIPart, type UIMessage } from 'ai';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { QuestionGenerationUIMessage } from '../../../lib/ai-question-generation/agent.js';

/**
 * This custom error is used to signal that a rate limit has been exceeded, which
 * we'll know happens when we get a 429 response from the server.
 */
export class RateLimitError extends Error {}

export function isToolPart(part: UIMessage['parts'][0]): part is ToolUIPart {
  return part.type.startsWith('tool-');
}

export type QuestionGenerationChat = ReturnType<typeof useQuestionGenerationChat>;

/**
 * Owns the question-generation chat state: the `useChat` connection, the
 * resume-on-load attempt, and the post-generation side effects (refreshing the
 * question preview and the file data). `isGenerating` is derived here — and
 * only here — from the chat status and the in-flight resume attempt.
 */
export function useQuestionGenerationChat({
  chatCsrfToken,
  questionId,
  urlPrefix,
  currentUserName,
  initialMessages,
  refreshQuestionPreview,
  onFilesChanged,
}: {
  chatCsrfToken: string;
  questionId: string;
  urlPrefix: string;
  currentUserName: string | null;
  initialMessages: QuestionGenerationUIMessage[];
  refreshQuestionPreview: () => void;
  onFilesChanged: () => void;
}) {
  const [refreshQuestionPreviewAfterChanges, setRefreshQuestionPreviewAfterChanges] =
    useState(true);

  const { messages, sendMessage, resumeStream, status, error } =
    useChat<QuestionGenerationUIMessage>({
      // Currently, we assume one chat per question. This should change in the future.
      id: questionId,
      messages: initialMessages,
      transport: new DefaultChatTransport({
        api: `${urlPrefix}/ai_generate_editor/${questionId}/chat`,
        headers: { 'X-CSRF-Token': chatCsrfToken },
        prepareSendMessagesRequest: ({ messages, headers }) => {
          // Only send the latest message; the server sources conversation
          // context from the database.
          const lastMessage = messages.at(-1);
          return {
            body: { message: lastMessage ?? null },
            headers,
          };
        },
        prepareReconnectToStreamRequest: ({ id }) => {
          return {
            api: `${urlPrefix}/ai_generate_editor/${id}/chat/stream`,
          };
        },
        async fetch(input, init) {
          const res = await fetch(input, init);
          if (res.status === 429) {
            throw new RateLimitError();
          }
          return res;
        },
      }),
      // Limit the frequency of updates to avoid overwhelming React. This approach
      // was recommended on https://github.com/vercel/ai/issues/6166.
      experimental_throttle: 100,
      onFinish({ messages, message }) {
        // Resuming a recently-finished stream on page load replays the final
        // message we already have. In that case, we want to avoid refetching
        // files or immediately loading a new variant.
        const isExistingMessage =
          messages.length === initialMessages.length &&
          message.parts.length === initialMessages.at(-1)?.parts.length;
        if (isExistingMessage) return;

        const didWriteFile = message.parts.some((part) => {
          return (
            isToolPart(part) && part.type === 'tool-writeFile' && part.state === 'output-available'
          );
        });

        if (didWriteFile && refreshQuestionPreviewAfterChanges) {
          refreshQuestionPreview();
        }

        onFilesChanged();
      },
      onError(error) {
        console.error('Chat error:', error);
      },
    });

  // A generation may already be in progress when the page loads; a trailing
  // `streaming` message is the same signal the server uses to decide whether
  // there is a stream to resume. Track the resume attempt ourselves because
  // the no-stream case (the server responds 204) fires no `useChat` callback
  // and never moves `status` off `ready`.
  const [isResuming, setIsResuming] = useState(
    () => initialMessages.at(-1)?.metadata?.status === 'streaming',
  );
  const resumeAttemptedRef = useRef(false);
  // Reconnect to an in-progress generation stream once on mount.
  useEffect(() => {
    if (resumeAttemptedRef.current) return;
    resumeAttemptedRef.current = true;
    if (initialMessages.at(-1)?.metadata?.status !== 'streaming') return;
    void resumeStream().finally(() => setIsResuming(false));
  }, [initialMessages, resumeStream]);

  const isGenerating = isResuming || status === 'streaming' || status === 'submitted';

  const sendPrompt = useCallback(
    (text: string) => {
      void sendMessage({
        text,
        metadata: {
          job_sequence_id: null,
          status: 'completed',
          user_name: currentUserName,
          created_at: new Date().toISOString(),
        },
      });
    },
    [sendMessage, currentUserName],
  );

  return {
    messages,
    status,
    error,
    isGenerating,
    sendPrompt,
    refreshQuestionPreviewAfterChanges,
    setRefreshQuestionPreviewAfterChanges,
  };
}
