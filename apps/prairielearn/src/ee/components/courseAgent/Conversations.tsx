import { useAgentChat } from '@cloudflare/ai-chat/react';
import { MessageType, type OutgoingMessage } from '@cloudflare/ai-chat/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAgent } from 'agents/react';
import { type UIMessage, isToolUIPart } from 'ai';
import {
  type KeyboardEvent,
  type ReactNode,
  type SyntheticEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Alert, Button, Dropdown, Form, Spinner } from 'react-bootstrap';
import { useStickToBottom } from 'use-stick-to-bottom';

import { type ConversationState } from '@prairielearn/course-agent-types';
import { run } from '@prairielearn/run';
import { getAppError } from '@prairielearn/trpc/client';
import { AppErrorAlert } from '@prairielearn/trpc/react';
import { OverlayTrigger } from '@prairielearn/ui';

import type { StaffCourseAgentConversation } from '../../../lib/client/safe-db-types.js';
import { useTRPC } from '../../../trpc/course/context.js';
import type { CourseAgentError } from '../../../trpc/course/course-agent.js';
import { ReasoningBlock, TextPart } from '../ai/ChatParts.js';

import { BlockedNotice } from './BlockedNotice.js';
import { ConversationStats } from './ConversationStats.js';
import { ReviewCard } from './ReviewCard.js';

const NEW_CONVERSATION = 'new';

/** The conversation picker plus the selected conversation's chat. */
export function Conversations({
  courseId,
  authnUserId,
  chatCsrfToken,
  active,
  showConversationStats,
}: {
  courseId: string;
  authnUserId: string;
  chatCsrfToken: string;
  active: boolean;
  showConversationStats: boolean;
}) {
  const trpc = useTRPC();
  const conversations = useQuery({
    ...trpc.courseAgent.list.queryOptions(),
    refetchInterval: active ? 10_000 : false,
  });
  const listError = getAppError<CourseAgentError['List']>(conversations.error);
  if (conversations.isPending) return <Loading />;
  return (
    <>
      {conversations.isError && (
        <AppErrorAlert
          className="m-3"
          error={listError}
          render={{ UNKNOWN: ({ message }) => message }}
        />
      )}
      {conversations.data && (
        <ConversationPicker
          conversations={conversations.data}
          courseId={courseId}
          authnUserId={authnUserId}
          chatCsrfToken={chatCsrfToken}
          active={active}
          showConversationStats={showConversationStats}
        />
      )}
    </>
  );
}

function ConversationPicker({
  conversations,
  showConversationStats,
  courseId,
  authnUserId,
  chatCsrfToken,
  active,
}: {
  conversations: StaffCourseAgentConversation[];
  courseId: string;
  authnUserId: string;
  chatCsrfToken: string;
  active: boolean;
  showConversationStats: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const storageKey = `course-agent:${authnUserId}:${courseId}:conversation`;
  const [pickedId, setPickedId] = useState(() => {
    const storedId = typeof window === 'undefined' ? null : sessionStorage.getItem(storageKey);
    if (
      storedId !== null &&
      (storedId === NEW_CONVERSATION || conversations.some((c) => c.id === storedId))
    ) {
      return storedId;
    }
    return conversations[0]?.id ?? NEW_CONVERSATION;
  });
  // Remember the default selection too, so another tab's new chats don't change this tab's choice.
  useEffect(() => {
    sessionStorage.setItem(storageKey, pickedId);
  }, [pickedId, storageKey]);

  const selectedId = pickedId === NEW_CONVERSATION ? null : pickedId;
  const selectedConversation = conversations.find((conversation) => conversation.id === selectedId);

  const [draft, setDraft] = useState('');
  const create = useMutation({
    ...trpc.courseAgent.create.mutationOptions(),
    onSuccess: (conversation) => {
      queryClient.setQueryData(trpc.courseAgent.list.queryKey(), (current) => [
        conversation,
        ...(current ?? []),
      ]);
      setPickedId(conversation.id);
      setDraft('');
      void queryClient.invalidateQueries({ queryKey: trpc.courseAgent.list.queryKey() });
    },
  });

  const submitNew = (event?: SyntheticEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || create.isPending) return;
    create.mutate({ text });
  };

  const createError = getAppError<CourseAgentError['Create']>(create.error);
  return (
    <div className="d-flex flex-column flex-grow-1 overflow-hidden">
      <div className="d-flex gap-2 align-items-center border-bottom px-3 py-2">
        <Dropdown className="flex-grow-1" style={{ minWidth: 0 }}>
          <Dropdown.Toggle
            variant="light"
            className="border bg-white w-100 d-flex justify-content-between align-items-center gap-2"
            aria-label="Conversation"
            disabled={conversations.length === 0 || create.isPending}
          >
            <span className="text-truncate">
              {selectedConversation?.title ?? 'New conversation'}
            </span>
          </Dropdown.Toggle>
          <Dropdown.Menu className="w-100 overflow-y-auto" style={{ maxHeight: '50vh' }}>
            {conversations.map((conversation) => (
              <Dropdown.Item
                key={conversation.id}
                as="button"
                active={conversation.id === selectedId}
                onClick={() => setPickedId(conversation.id)}
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
            disabled={create.isPending}
            onClick={() => {
              setPickedId(NEW_CONVERSATION);
              setDraft('');
              create.reset();
            }}
          >
            <i className="bi bi-plus-lg" aria-hidden="true" />
          </Button>
        </OverlayTrigger>
      </div>
      {selectedId && active ? (
        <Chat
          key={selectedId}
          courseId={courseId}
          conversationId={selectedId}
          usage={selectedConversation!}
          showConversationStats={showConversationStats}
          chatCsrfToken={chatCsrfToken}
          initialMessage={create.data?.id === selectedId ? create.variables?.text : undefined}
          onInitialMessageSent={create.reset}
        />
      ) : active ? (
        <>
          <div className="flex-grow-1 p-3">
            <p className="text-muted text-center my-4">
              Ask the course agent about your course or about PrairieLearn.
            </p>
            {create.isError && (
              <AppErrorAlert error={createError} render={{ UNKNOWN: ({ message }) => message }} />
            )}
          </div>
          <Composer
            draft={draft}
            disabled={create.isPending}
            pending={create.isPending}
            onDraftChange={setDraft}
            onSubmit={submitNew}
          />
        </>
      ) : null}
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
  initialMessage,
  onInitialMessageSent,
  showConversationStats,
  usage,
}: {
  courseId: string;
  conversationId: string;
  showConversationStats: boolean;
  chatCsrfToken: string;
  usage: StaffCourseAgentConversation;
  initialMessage: string | undefined;
  onInitialMessageSent: () => void;
}) {
  const trpc = useTRPC();
  const [historyReady, setHistoryReady] = useState(false);
  const [lifecycle, setLifecycle] = useState<ConversationState | null>(null);
  const agent = useAgent<ConversationState>({
    agent: 'Conversation',
    basePath: `pl/course/${courseId}/course_agent/conversations/${conversationId}`,
    query: { csrfToken: chatCsrfToken },
    onStateUpdate: setLifecycle,
    onClose: () => {
      setHistoryReady(false);
      setLifecycle(null);
    },
    onMessage: (event) => {
      const message = JSON.parse(event.data) as OutgoingMessage;
      if (message.type === MessageType.CF_AGENT_CHAT_MESSAGES) setHistoryReady(true);
    },
  });
  const {
    messages,
    sendMessage,
    status,
    stop,
    isServerStreaming,
    isRecovering,
    error,
    connectionError,
  } = useAgentChat({
    agent,
    throttle: 100,
    getInitialMessages: null,
  });
  const resume = useMutation(trpc.courseAgent.resume.mutationOptions());
  const resumeError = getAppError<CourseAgentError['Resume']>(resume.error);
  const pendingReview = messages.some((message) =>
    message.parts.some(
      (part) =>
        isToolUIPart(part) && part.type === 'tool-push_sync' && part.state !== 'output-available',
    ),
  );
  const readyToSend =
    !pendingReview && (lifecycle?.status === 'offline' || lifecycle?.status === 'waiting_for_user');
  const canStop = lifecycle?.status === 'starting' || lifecycle?.status === 'waiting_for_agent';
  const [draft, setDraft] = useState('');
  // Wait for initial history before allowing messages to be sent.
  const connected = agent.readyState === 1 && historyReady;
  const initialMessageSentRef = useRef(false);
  // A newly created conversation must receive history before its first prompt is handed to the SDK.
  useEffect(() => {
    if (!connected || !readyToSend || !initialMessage || initialMessageSentRef.current) return;
    initialMessageSentRef.current = true;
    void sendMessage({ text: initialMessage });
    onInitialMessageSent();
  }, [connected, readyToSend, initialMessage, onInitialMessageSent, sendMessage]);

  const responseActive =
    status === 'submitted' || status === 'streaming' || isServerStreaming || isRecovering;
  const showThinking = run(() => {
    if (!responseActive || pendingReview || lifecycle?.status === 'blocked') {
      return false;
    }
    const lastMessage = messages.at(-1);
    if (lastMessage?.role !== 'assistant') {
      return true;
    }
    return !lastMessage.parts.some((part) => {
      if (part.type === 'text' || part.type === 'reasoning') {
        return part.text.trim().length > 0;
      }
      return false;
    });
  });
  const stickToBottom = useStickToBottom({ initial: 'instant', resize: 'smooth' });

  const submit = (event?: SyntheticEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || responseActive || !connected || !readyToSend) return;
    void sendMessage({ text });
    setDraft('');
  };

  return (
    <div className="d-flex flex-column flex-grow-1 overflow-hidden">
      <div ref={stickToBottom.scrollRef} className="flex-grow-1 overflow-y-auto">
        <div ref={stickToBottom.contentRef} className="d-flex flex-column gap-3 p-3">
          {!historyReady && !connectionError && <Loading />}
          {historyReady && messages.length === 0 && (
            <p className="text-muted text-center my-4">
              Ask the course agent about your course or about PrairieLearn.
            </p>
          )}
          {messages.map((message) => (
            <Message
              key={message.id}
              message={message}
              conversationId={conversationId}
              canReview={
                lifecycle?.status === 'waiting_for_user' ||
                lifecycle?.status === 'offline' ||
                lifecycle?.status === 'blocked'
              }
            />
          ))}
          {showThinking && (
            <div className="text-muted small">
              <Spinner animation="border" size="sm" className="me-2" aria-hidden="true" />
              Thinking…
            </div>
          )}
          {lifecycle?.status === 'blocked' && (
            <BlockedNotice
              state={lifecycle}
              disabled={!connected || resume.isPending}
              onResume={() => resume.mutate({ conversationId })}
            />
          )}
          {(lifecycle?.status === 'stopping' || lifecycle?.status === 'suspending') && (
            <p className="text-muted" role="status">
              {lifecycle.status === 'stopping'
                ? 'Stopping the course agent…'
                : 'Saving your workspace…'}
            </p>
          )}
          {resume.isError && (
            <AppErrorAlert error={resumeError} render={{ UNKNOWN: ({ message }) => message }} />
          )}
          {connectionError && (
            <Alert variant="danger">Could not connect to the course agent.</Alert>
          )}
          {error && lifecycle?.status !== 'blocked' && (
            <Alert variant="danger" className="mb-0">
              {error.message || 'Something went wrong. Please try again.'}
            </Alert>
          )}
        </div>
      </div>
      <Composer
        draft={draft}
        disabled={!connected || !readyToSend}
        stopDisabled={!connected || !canStop}
        onDraftChange={setDraft}
        onSubmit={submit}
        onStop={!pendingReview && (responseActive || canStop) ? () => void stop() : undefined}
      >
        {showConversationStats && <ConversationStats state={lifecycle} usage={usage} />}
      </Composer>
    </div>
  );
}

function Composer({
  draft,
  onDraftChange,
  onSubmit,
  disabled,
  pending = false,
  stopDisabled = false,
  children,
  onStop,
}: {
  draft: string;
  onDraftChange: (draft: string) => void;
  onSubmit: (event?: SyntheticEvent) => void;
  disabled: boolean;
  pending?: boolean;
  stopDisabled?: boolean;
  children?: ReactNode;
  onStop?: () => void;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      onSubmit(event);
    }
  };

  return (
    <Form className="border-top p-3" onSubmit={onSubmit}>
      <Form.Control
        as="textarea"
        rows={3}
        value={draft}
        placeholder="Ask the course agent…"
        aria-label="Message"
        disabled={pending}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="d-flex justify-content-end gap-2 mt-2">
        {children}
        {onStop ? (
          <Button variant="outline-secondary" size="sm" disabled={stopDisabled} onClick={onStop}>
            <i className="bi bi-stop-fill me-1" aria-hidden="true" />
            Stop
          </Button>
        ) : (
          <Button type="submit" size="sm" aria-label="Send" disabled={!draft.trim() || disabled}>
            <i className="bi bi-send" aria-hidden="true" />
          </Button>
        )}
      </div>
    </Form>
  );
}

function Message({
  message,
  conversationId,
  canReview,
}: {
  message: UIMessage;
  conversationId: string;
  canReview: boolean;
}) {
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
        if (isToolUIPart(part) && part.type === 'tool-push_sync') {
          return (
            <ReviewCard
              key={key}
              conversationId={conversationId}
              messageId={message.id}
              canReview={canReview}
              partId={part.toolCallId}
              output={part.state === 'output-available' ? part.output : undefined}
            />
          );
        }
        return null;
      })}
    </div>
  );
}
