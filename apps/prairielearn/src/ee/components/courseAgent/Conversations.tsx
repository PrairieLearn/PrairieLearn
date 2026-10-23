import { useChat } from '@ai-sdk/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useQueryState } from 'nuqs';
import { type KeyboardEvent, type SyntheticEvent, useEffect, useRef, useState } from 'react';
import { Alert, Button, Dropdown, Form, Spinner } from 'react-bootstrap';
import { useStickToBottom } from 'use-stick-to-bottom';

import { run } from '@prairielearn/run';
import { getAppError } from '@prairielearn/trpc/client';
import { AppErrorAlert } from '@prairielearn/trpc/react';
import { OverlayTrigger } from '@prairielearn/ui';

import { useTRPC } from '../../../trpc/course/context.js';
import type { CourseAgentError } from '../../../trpc/course/course-agent.js';
import { ReasoningBlock, TextPart } from '../ai/ChatParts.js';

import { ChatReadError, type ClientReplyState, readChat } from './chat-reader.js';

/** The conversation picker plus the selected conversation's chat. */
export function Conversations({
  courseId,
  chatCsrfToken,
  active,
}: {
  courseId: string;
  chatCsrfToken: string;
  active: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const conversations = useQuery(trpc.courseAgent.list.queryOptions());
  // Default to the most recent conversation until the user selects one.
  const [pickedId, setPickedId] = useQueryState('courseAgentConversation');
  const selectedId = run(() => {
    if (
      pickedId !== null &&
      conversations.data?.some((conversation) => conversation.id === pickedId)
    ) {
      return pickedId;
    }
    if (conversations.data && conversations.data.length > 0) {
      return conversations.data[0].id;
    }
    return null;
  });

  const selectedConversation = conversations.data?.find(
    (conversation) => conversation.id === selectedId,
  );

  const create = useMutation({
    ...trpc.courseAgent.create.mutationOptions(),
    onSuccess: async (conversation) => {
      await queryClient.invalidateQueries({ queryKey: trpc.courseAgent.list.queryKey() });
      await setPickedId(conversation.id);
    },
  });

  const listError = getAppError<CourseAgentError['List']>(conversations.error);
  const createError = getAppError<CourseAgentError['Create']>(create.error);
  return (
    <div className="d-flex flex-column flex-grow-1 overflow-hidden">
      <div className="d-flex gap-2 align-items-center border-bottom px-3 py-2">
        <Dropdown className="flex-grow-1" style={{ minWidth: 0 }}>
          <Dropdown.Toggle
            variant="light"
            className="border bg-white w-100 d-flex justify-content-between align-items-center gap-2"
            aria-label="Conversation"
            disabled={!conversations.data?.length}
          >
            <span className="text-truncate">
              {selectedConversation?.title ?? 'No conversations yet'}
            </span>
          </Dropdown.Toggle>
          <Dropdown.Menu className="w-100 overflow-y-auto" style={{ maxHeight: '50vh' }}>
            {conversations.data?.map((conversation) => (
              <Dropdown.Item
                key={conversation.id}
                as="button"
                active={conversation.id === selectedId}
                onClick={() => void setPickedId(conversation.id)}
              >
                <span className="d-block text-truncate">{conversation.title}</span>
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown>
        <OverlayTrigger
          placement="bottom"
          tooltip={{ body: 'New conversation', props: { id: 'new-course-agent-conversation' } }}
        >
          <Button
            variant="outline-primary"
            className="flex-shrink-0"
            aria-label="New conversation"
            // Wait for the list, so a click can't race the default selection.
            disabled={!conversations.isSuccess || create.isPending}
            onClick={() => create.mutate()}
          >
            <i className="bi bi-plus-lg" aria-hidden="true" />
          </Button>
        </OverlayTrigger>
      </div>
      {conversations.isError || create.isError ? (
        <AppErrorAlert
          className="m-3"
          error={listError ?? createError}
          render={{ UNKNOWN: ({ message }) => message }}
        />
      ) : conversations.isPending ? (
        <Loading />
      ) : selectedId && active ? (
        <Chat
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

function Chat({
  courseId,
  conversationId,
  chatCsrfToken,
}: {
  courseId: string;
  conversationId: string;
  chatCsrfToken: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [reply, setReply] = useState<ClientReplyState>({ status: 'idle' });
  const [connected, setConnected] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [attachment, setAttachment] = useState(0);
  const [stopping, setStopping] = useState(false);
  const observationRef = useRef<AbortController | null>(null);
  const api = `/pl/course/${courseId}/course_agent/conversations/${conversationId}`;
  const reconnect = () => {
    setConnected(false);
    setReadError(null);
    setAttachment((value) => value + 1);
  };
  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: `${api}/chat`,
        headers: { 'X-CSRF-Token': chatCsrfToken },
        prepareSendMessagesRequest: ({ messages, headers }) => ({
          body: { message: messages.at(-1) },
          headers,
        }),
        fetch: async (input, init) => {
          const response = await fetch(input, init);
          const id = response.headers.get('X-Assistant-Message-Id');
          if (id) setReply({ status: 'running', assistantMessageId: id });
          return response;
        },
      }),
  );
  const {
    messages,
    setMessages,
    sendMessage,
    status,
    stop: detach,
    error,
  } = useChat({
    id: conversationId,
    transport,
    throttle: 100,
    onFinish: ({ isAbort, isError }) => {
      if (!isAbort && !isError) {
        setReply({ status: 'idle' });
        setStopping(false);
      }
      void queryClient.invalidateQueries({ queryKey: trpc.courseAgent.list.queryKey() });
    },
    onError: reconnect,
  });
  // Every attachment starts from server history. Switching detaches this reader,
  // and its callbacks cannot write into the next conversation's view.
  useEffect(() => {
    const abort = new AbortController();
    observationRef.current = abort;
    const isAborted = () => abort.signal.aborted;
    void (async () => {
      for (let attempt = 0; !isAborted(); attempt++) {
        try {
          const response = await fetch(`${api}/chat`, { signal: abort.signal });
          await readChat(
            response,
            abort.signal,
            (snapshot) => {
              if (isAborted()) return;
              setMessages(snapshot.messages);
              setReply(snapshot.reply);
              setStopping(false);
              setConnected(true);
              setReadError(null);
            },
            (next) => {
              if (!isAborted()) setMessages(next);
            },
          );
          return;
        } catch (err) {
          if (isAborted()) return;
          setConnected(false);
          if (attempt >= 2 || (err instanceof ChatReadError && !err.retryable)) {
            setReadError(
              err instanceof Error ? err.message : 'Could not reconnect to the conversation.',
            );
            return;
          }
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            await new Promise((resolve) => {
              timer = setTimeout(resolve, 500 * (attempt + 1));
            });
          } finally {
            clearTimeout(timer);
          }
        }
      }
    })();
    return () => {
      abort.abort();
      void detach();
    };
  }, [api, attachment, setMessages, detach]);
  const stopReply = async () => {
    if (reply.status !== 'running') return;
    setStopping(true);
    try {
      const response = await fetch(`${api}/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': chatCsrfToken },
        body: JSON.stringify({ assistantMessageId: reply.assistantMessageId }),
      });
      if (!response.ok) throw new Error('The reply could not be stopped. Reconnect to check it.');
    } catch (err) {
      setStopping(false);
      setReadError(err instanceof Error ? err.message : 'The reply could not be stopped.');
      reconnect();
    }
  };
  const [draft, setDraft] = useState('');
  const isBusy = ['submitted', 'streaming'].includes(status) || reply.status === 'running';
  // Show loading while a turn is submitted or streaming and has no visible output yet.
  // When a turn finishes or fails, isBusy is false, so isLoading is false.
  const isLoading = run(() => {
    if (!isBusy) return false;
    const lastMessage = messages.at(-1);
    if (lastMessage?.role !== 'assistant') return true;
    return !lastMessage.parts.some(
      (part) => (part.type === 'text' || part.type === 'reasoning') && part.text.trim(),
    );
  });
  const stickToBottom = useStickToBottom({ initial: 'instant', resize: 'smooth' });

  const submit = (event?: SyntheticEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || isBusy || !connected) return;
    observationRef.current?.abort();
    setReadError(null);
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
          {isLoading && (
            <div className="text-muted small">
              <Spinner animation="border" size="sm" className="me-2" aria-hidden="true" />
              Thinking…
            </div>
          )}
          {(!connected || readError) && (
            <div className="small text-muted">
              {readError ?? 'Connecting…'}
              {readError && (
                <Button variant="link" size="sm" onClick={reconnect}>
                  Reconnect
                </Button>
              )}
            </div>
          )}
          {reply.status === 'failed' && <Alert variant="danger">{reply.error.message}</Alert>}
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
            <Button
              variant="outline-secondary"
              size="sm"
              disabled={reply.status !== 'running' || stopping}
              onClick={() => void stopReply()}
            >
              <i className="bi bi-stop-fill me-1" aria-hidden="true" />
              Stop
            </Button>
          ) : (
            <Button
              type="submit"
              size="sm"
              aria-label="Send"
              disabled={!draft.trim() || !connected}
            >
              <i className="bi bi-send" aria-hidden="true" />
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
