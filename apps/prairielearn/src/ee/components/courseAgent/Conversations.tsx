import { useChat } from '@ai-sdk/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { type KeyboardEvent, type SyntheticEvent, useState } from 'react';
import { Alert, Button, Form, Spinner } from 'react-bootstrap';
import { useStickToBottom } from 'use-stick-to-bottom';

import { useTRPC } from '../../../trpc/course/context.js';
import { ReasoningBlock, TextPart } from '../ai/ChatParts.js';

/** The conversation picker plus the selected conversation's chat. */
export function Conversations({
  courseId,
  chatCsrfToken,
}: {
  courseId: string;
  chatCsrfToken: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const conversations = useQuery(trpc.courseAgent.list.queryOptions());
  // Default to the most recent conversation until the user selects one.
  const [pickedId, setPickedId] = useState<string | null>(null);
  const selectedId = pickedId ?? conversations.data?.[0]?.id ?? null;

  const create = useMutation({
    ...trpc.courseAgent.create.mutationOptions(),
    onSuccess: async (conversation) => {
      await queryClient.invalidateQueries({ queryKey: trpc.courseAgent.list.queryKey() });
      setPickedId(conversation.id);
    },
  });

  return (
    <div className="d-flex flex-column flex-grow-1 overflow-hidden">
      <div className="d-flex gap-2 align-items-center border-bottom px-3 py-2">
        <Form.Select
          size="sm"
          aria-label="Conversation"
          value={selectedId ?? ''}
          disabled={!conversations.data?.length}
          onChange={(event) => setPickedId(event.target.value)}
        >
          {conversations.data?.length ? (
            conversations.data.map((conversation) => (
              <option key={conversation.id} value={conversation.id}>
                {conversation.title}
              </option>
            ))
          ) : (
            <option value="">No conversations yet</option>
          )}
        </Form.Select>
        <Button
          size="sm"
          variant="outline-primary"
          className="text-nowrap"
          // Wait for the list, so a click can't race the default selection.
          disabled={!conversations.isSuccess || create.isPending}
          onClick={() => create.mutate()}
        >
          New conversation
        </Button>
      </div>
      {conversations.isError || create.isError ? (
        <Alert variant="danger" className="m-3">
          {(conversations.error ?? create.error)?.message}
        </Alert>
      ) : conversations.isPending ? (
        <Loading />
      ) : selectedId ? (
        <ConversationChat
          key={selectedId}
          courseId={courseId}
          conversationId={selectedId}
          chatCsrfToken={chatCsrfToken}
        />
      ) : (
        <div className="d-flex flex-column flex-grow-1 justify-content-center align-items-center text-muted p-3 text-center">
          <p>Ask the course agent about your course or about PrairieLearn.</p>
          <Button disabled={create.isPending} onClick={() => create.mutate()}>
            Start a conversation
          </Button>
        </div>
      )}
    </div>
  );
}

function Loading() {
  return (
    <div className="d-flex flex-grow-1 justify-content-center align-items-center">
      <Spinner animation="border" size="sm" role="status">
        <span className="visually-hidden">Loading</span>
      </Spinner>
    </div>
  );
}

function ConversationChat({
  courseId,
  conversationId,
  chatCsrfToken,
}: {
  courseId: string;
  conversationId: string;
  chatCsrfToken: string;
}) {
  const trpc = useTRPC();
  // `useChat` reads its initial messages only once, so load the history before mounting it.
  const history = useQuery({
    ...trpc.courseAgent.messages.queryOptions({ conversationId }),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  if (history.isError) {
    return (
      <Alert variant="danger" className="m-3">
        {history.error.message}
      </Alert>
    );
  }
  if (history.isPending) return <Loading />;
  return (
    <Chat
      courseId={courseId}
      conversationId={conversationId}
      chatCsrfToken={chatCsrfToken}
      initialMessages={history.data}
    />
  );
}

function Chat({
  courseId,
  conversationId,
  chatCsrfToken,
  initialMessages,
}: {
  courseId: string;
  conversationId: string;
  chatCsrfToken: string;
  initialMessages: UIMessage[];
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: `/pl/course/${courseId}/course_agent/conversations/${conversationId}/chat`,
        headers: { 'X-CSRF-Token': chatCsrfToken },
        // The server keeps the history; send only the newest message.
        prepareSendMessagesRequest: ({ messages, headers }) => ({
          body: { message: messages.at(-1) },
          headers,
        }),
      }),
  );
  const { messages, sendMessage, status, stop, error } = useChat({
    id: conversationId,
    messages: initialMessages,
    transport,
    throttle: 100,
    // The first message sets the conversation's title.
    onFinish: () =>
      void queryClient.invalidateQueries({ queryKey: trpc.courseAgent.list.queryKey() }),
  });
  const [draft, setDraft] = useState('');
  const isBusy = status === 'submitted' || status === 'streaming';
  const stickToBottom = useStickToBottom({ initial: 'instant', resize: 'smooth' });

  const submit = (event?: SyntheticEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || isBusy) return;
    void sendMessage({ text });
    setDraft('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      submit(event);
    }
  };

  return (
    <div className="d-flex flex-column flex-grow-1 overflow-hidden">
      <div ref={stickToBottom.scrollRef} className="flex-grow-1 overflow-y-auto">
        <div ref={stickToBottom.contentRef} className="d-flex flex-column gap-3 p-3">
          {messages.length === 0 && (
            <p className="text-muted text-center my-4">
              Ask the course agent about your course or about PrairieLearn.
            </p>
          )}
          {messages.map((message) => (
            <Message key={message.id} message={message} />
          ))}
          {status === 'submitted' && (
            <div className="text-muted small">
              <Spinner animation="border" size="sm" className="me-2" aria-hidden="true" />
              Thinking…
            </div>
          )}
          {error && (
            <Alert variant="danger" className="mb-0">
              {error.message || 'Something went wrong. Please try again.'}
            </Alert>
          )}
        </div>
      </div>
      <Form className="border-top p-3" onSubmit={submit}>
        <Form.Control
          as="textarea"
          rows={3}
          value={draft}
          placeholder="Ask the course agent…"
          aria-label="Message"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="d-flex justify-content-end mt-2">
          {isBusy ? (
            <Button variant="outline-secondary" size="sm" onClick={() => void stop()}>
              <i className="bi bi-stop-fill me-1" aria-hidden="true" />
              Stop
            </Button>
          ) : (
            <Button type="submit" size="sm" disabled={!draft.trim()}>
              Send
            </Button>
          )}
        </div>
      </Form>
    </div>
  );
}

function Message({ message }: { message: UIMessage }) {
  if (message.role === 'user') {
    const text = message.parts.map((part) => (part.type === 'text' ? part.text : '')).join('');
    return (
      <div className="align-self-end course-agent-user-message bg-body-secondary rounded-3 px-3 py-2">
        {text}
      </div>
    );
  }
  return (
    <div className="d-flex flex-column gap-2">
      {message.parts.map((part, index) => {
        const key = `part-${index}`;
        if (part.type === 'text') return <TextPart key={key} part={part} />;
        if (part.type === 'reasoning') return <ReasoningBlock key={key} part={part} />;
        return null;
      })}
    </div>
  );
}
