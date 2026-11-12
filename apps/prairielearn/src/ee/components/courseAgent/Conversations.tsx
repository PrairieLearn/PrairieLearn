import { useAgentChat } from '@cloudflare/ai-chat/react';
import { MessageType, type OutgoingMessage } from '@cloudflare/ai-chat/types';
import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAgent } from 'agents/react';
import { type UIMessage } from 'ai';
import {
  type KeyboardEvent,
  type ReactNode,
  type SyntheticEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert, Button, Dropdown, Form, Spinner } from 'react-bootstrap';
import type { UrlTransform } from 'react-markdown';
import { useStickToBottom } from 'use-stick-to-bottom';
import { z } from 'zod';

import {
  type ConversationState,
  InputRequestPartSchema,
  type ToolCall,
  ToolCallSchema,
  reviewTag,
} from '@prairielearn/course-agent-types';
import { run } from '@prairielearn/run';
import { getAppError } from '@prairielearn/trpc/client';
import { AppErrorAlert } from '@prairielearn/trpc/react';
import { OverlayTrigger } from '@prairielearn/ui';

import type { StaffCourseAgentConversation } from '../../../lib/client/safe-db-types.js';
import { useTRPC } from '../../../trpc/course/context.js';
import type { CourseAgentError } from '../../../trpc/course/course-agent.js';
import { ReasoningBlock, TextPart } from '../ai/ChatParts.js';

import { ConversationStats } from './ConversationStats.js';
import { InputRequestCard } from './InputRequestCard.js';
import { RequestChangesCard } from './RequestChangesCard.js';
import { ToolCalls } from './ToolCalls.js';
import { UserMessage } from './UserMessage.js';
import { courseFileLinkTransform } from './courseFileLinks.js';
import { currentPageLocation } from './pageLocation.js';

/** The agent service shows a review in chat history by its ID only. */
const ReviewPartSchema = z.object({ reviewId: z.string() });
const TurnPartSchema = z.object({ tag: z.string() });

const BLOCKED_MESSAGES = {
  startup_failed:
    'The course agent could not start. Resume to clear the incomplete setup, then send a new message.',
  runtime_failed:
    "The course agent was interrupted. It may have made some changes, and its reply may be incomplete. Resume to continue; your previous message won't run again.",
  checkpoint_failed:
    "The course agent couldn't pause. Resume to try again; its changes are still there.",
  cleanup_failed: 'The course agent paused, but cleanup did not finish. Resume to finish cleanup.',
} satisfies Record<Extract<ConversationState, { status: 'blocked' }>['reason'], string>;

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
  const conversations = useQuery(trpc.courseAgent.list.queryOptions());
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
      void queryClient.invalidateQueries({ queryKey: trpc.courseAgent.list.queryKey() });
    },
    onError: (_error, { text }) => setDraft(text),
  });

  const submitNew = (event?: SyntheticEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || create.isPending) return;
    create.mutate({ text });
    setDraft('');
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
          showConversationStats={showConversationStats}
          chatCsrfToken={chatCsrfToken}
          initialMessage={create.data?.id === selectedId ? create.variables?.text : undefined}
          onInitialMessageSent={create.reset}
        />
      ) : active ? (
        <>
          <div className="flex-grow-1 p-3">
            {create.isPending ? (
              <div className="d-flex flex-column gap-3">
                <UserMessage text={create.variables.text} />
                <PendingStatus label="Starting sandbox…" />
              </div>
            ) : (
              <p className="text-muted text-center my-4">
                Ask the course agent about your course or about PrairieLearn.
              </p>
            )}
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

function PendingStatus({ label }: { label: string }) {
  return (
    <div className="text-muted small" role="status">
      <Spinner animation="border" size="sm" className="me-2" aria-hidden="true" />
      {label}
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
}: {
  courseId: string;
  conversationId: string;
  showConversationStats: boolean;
  chatCsrfToken: string;
  initialMessage: string | undefined;
  onInitialMessageSent: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const setTitle = useMutation({
    ...trpc.courseAgent.setTitle.mutationOptions(),
    onSuccess: async (updated) => {
      // A list fetch that started before the save would otherwise restore the old title.
      await queryClient.cancelQueries({ queryKey: trpc.courseAgent.list.queryKey() });
      queryClient.setQueryData(trpc.courseAgent.list.queryKey(), (current) =>
        current?.map((conversation) => (conversation.id === updated.id ? updated : conversation)),
      );
    },
    // The next state update retries the save.
    onError: () => {
      savingTitleRef.current = null;
    },
  });
  // State updates repeat while a save is in flight, so save each generated title once.
  const savingTitleRef = useRef<string | null>(null);
  const [historyReady, setHistoryReady] = useState(false);
  const [lifecycle, setLifecycle] = useState<ConversationState | null>(null);
  const [connectionFailed, setConnectionFailed] = useState(false);
  // Chat remounts per conversation, so this is the message that created it.
  const [initialText] = useState(initialMessage);
  // Bridges sending to an offline sandbox and the server reporting that it is starting.
  const [awaitingStart, setAwaitingStart] = useState(initialMessage !== undefined);
  const agent = useAgent<ConversationState>({
    agent: 'Conversation',
    basePath: `pl/course/${courseId}/course_agent/conversations/${conversationId}`,
    query: { csrfToken: chatCsrfToken },
    onStateUpdate: (state) => {
      setLifecycle(state);
      if (state.status !== 'offline') setAwaitingStart(false);
      // The agent service generates the title; the owner's browser saves it to the list.
      const savedTitle = queryClient
        .getQueryData(trpc.courseAgent.list.queryKey())
        ?.find((conversation) => conversation.id === conversationId)?.title;
      if (state.title && state.title !== savedTitle && state.title !== savingTitleRef.current) {
        savingTitleRef.current = state.title;
        setTitle.mutate({ conversationId, title: state.title });
      }
    },
    onOpen: () => setConnectionFailed(false),
    onError: () => setConnectionFailed(true),
    onClose: () => {
      setHistoryReady(false);
      setLifecycle(null);
      setConnectionFailed(true);
      // A send may have been lost with the socket, so let the reconnect's lifecycle decide.
      setAwaitingStart(false);
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
  const pendingReview = lifecycle?.reviewId != null;
  const agentIdle = lifecycle?.status === 'offline' || lifecycle?.status === 'waiting_for_user';
  const readyToSend = !pendingReview && agentIdle;
  const [draft, setDraft] = useState('');
  const reviewInput = lifecycle?.reviewId
    ? { conversationId, reviewId: lifecycle.reviewId }
    : skipToken;
  const review = useQuery({
    ...trpc.courseAgent.getReview.queryOptions(reviewInput),
    retry: false,
  });
  // A message sent while a review awaits a decision denies it, and the agent receives the denial
  // with the message. A denial by message the agent has not received can be sent again.
  const replyDenies =
    pendingReview &&
    agentIdle &&
    (review.data?.status === 'pending' ||
      (review.data?.status === 'decided' && review.data.result?.viaMessage === true));
  const deny = useMutation({
    ...trpc.courseAgent.postReviewDecision.mutationOptions(),
    retry: false,
    // On a conflict the draft stays, and the review shows the decision that won.
    // Not awaited: the message is sent once the denial is delivered, not after the refetch.
    onSettled: (_, __, { conversationId, reviewId }) => {
      void queryClient.invalidateQueries({
        queryKey: trpc.courseAgent.getReview.queryKey({ conversationId, reviewId }),
      });
    },
  });
  const denyError = getAppError<CourseAgentError['PostReviewDecision']>(deny.error);
  const canStop = lifecycle?.status === 'starting' || lifecycle?.status === 'waiting_for_agent';
  // Wait for initial history before allowing messages to be sent.
  const connected = agent.readyState === 1 && historyReady;
  const initialMessageSentRef = useRef(false);
  // A newly created conversation must receive history before its first prompt is handed to the SDK.
  useEffect(() => {
    if (!connected || !readyToSend || !initialMessage || initialMessageSentRef.current) return;
    initialMessageSentRef.current = true;
    void sendMessage({ text: initialMessage, metadata: { location: currentPageLocation() } });
    onInitialMessageSent();
  }, [connected, readyToSend, initialMessage, onInitialMessageSent, sendMessage]);

  const responseActive =
    status === 'submitted' || status === 'streaming' || isServerStreaming || isRecovering;
  const showThinking = run(() => {
    if (
      !(responseActive || lifecycle?.status === 'waiting_for_agent') ||
      connectionFailed ||
      connectionError
    ) {
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
      return toolCallOf(part) !== null;
    });
  });
  // The server reports the turn's lifecycle before the SDK marks the response active.
  const startingSandbox =
    !connectionFailed &&
    !connectionError &&
    (lifecycle?.status === 'starting' ||
      ((lifecycle === null || lifecycle.status === 'offline') &&
        (awaitingStart || responseActive)));
  const pendingLabel = startingSandbox ? 'Starting sandbox…' : showThinking ? 'Thinking…' : null;
  const showInitialText =
    initialText !== undefined && !messages.some((message) => message.role === 'user');
  const awaitingReviewId =
    !responseActive && (lifecycle?.status === 'waiting_for_user' || lifecycle?.status === 'offline')
      ? (lifecycle.reviewId ?? null)
      : null;
  // An input request is open until staff send their next message, which answers it however it is sent.
  const lastUserIndex = messages.map((message) => message.role).lastIndexOf('user');
  const latest = messages.at(-1);
  const inputRequestOpen =
    latest?.role === 'assistant' && latest.parts.some((part) => part.type === 'data-input-request');
  const stickToBottom = useStickToBottom({ initial: 'instant', resize: 'smooth' });
  // A stable transform lets memoized Markdown blocks skip re-rendering.
  const linkTransform = useMemo(() => courseFileLinkTransform(courseId), [courseId]);

  const canSend = connected && readyToSend && !responseActive;

  const send = (text: string) => {
    if (lifecycle?.status === 'offline') setAwaitingStart(true);
    // A refused denial's error no longer applies once the message goes out normally.
    deny.reset();
    void sendMessage({ text, metadata: { location: currentPageLocation() } });
  };

  const submit = (event?: SyntheticEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || responseActive || !connected || deny.isPending) return;
    if (replyDenies) {
      // PrairieLearn has delivered the denial when this succeeds, so the message's turn follows
      // it. On a conflict the draft stays, and the review shows the decision that won.
      deny.mutate(
        { conversationId, reviewId: lifecycle.reviewId!, decision: 'denied', viaMessage: true },
        {
          onSuccess: () => {
            send(text);
            setDraft('');
          },
        },
      );
      return;
    }
    if (!canSend) return;
    send(text);
    setDraft('');
  };

  return (
    <div className="d-flex flex-column flex-grow-1 overflow-hidden">
      <div ref={stickToBottom.scrollRef} className="flex-grow-1 overflow-y-auto">
        <div ref={stickToBottom.contentRef} className="d-flex flex-column gap-3 p-3">
          {!showInitialText && !historyReady && !connectionError && !connectionFailed && (
            <Loading />
          )}
          {historyReady && !showInitialText && messages.length === 0 && (
            <p className="text-muted text-center my-4">
              Ask the course agent about your course or about PrairieLearn.
            </p>
          )}
          {messages.map((message, index) => (
            <Message
              key={message.id}
              message={message}
              live={responseActive && index === messages.length - 1}
              conversationId={conversationId}
              awaitingReviewId={awaitingReviewId}
              linkTransform={linkTransform}
              answered={index < lastUserIndex}
              canAnswer={canSend}
              onToolCallExpand={stickToBottom.stopScroll}
              onAnswer={send}
            />
          ))}
          {showInitialText && <UserMessage text={initialText} />}
          {/* Stop can end the stream before history records the review, which would otherwise
              leave the conversation waiting on a review with no card to decide it. */}
          {historyReady &&
            lifecycle?.reviewId &&
            !reviewInHistory(messages, lifecycle.reviewId) && (
              <RequestChangesCard
                conversationId={conversationId}
                reviewId={lifecycle.reviewId}
                canResume={awaitingReviewId === lifecycle.reviewId}
              />
            )}
          {pendingLabel && <PendingStatus label={pendingLabel} />}
          {lifecycle?.status === 'blocked' && (
            <Alert variant="warning">
              <p>{BLOCKED_MESSAGES[lifecycle.reason]}</p>
              <Button
                variant="outline-dark"
                size="sm"
                disabled={!connected || resume.isPending}
                onClick={() => resume.mutate({ conversationId })}
              >
                Resume
              </Button>
            </Alert>
          )}
          {lifecycle?.sandboxLost && (
            <Alert variant="warning">
              The course agent stopped unexpectedly and lost the changes it made since it last
              paused. Reviews you already decided are not affected; each shows what was saved.
            </Alert>
          )}
          {(lifecycle?.status === 'stopping' || lifecycle?.status === 'suspending') && (
            <p className="text-muted" role="status">
              {lifecycle.status === 'stopping'
                ? 'Stopping the course agent…'
                : 'Pausing the course agent…'}
            </p>
          )}
          {resume.isError && (
            <AppErrorAlert error={resumeError} render={{ UNKNOWN: ({ message }) => message }} />
          )}
          {deny.isError && (
            <AppErrorAlert error={denyError} render={{ UNKNOWN: ({ message }) => message }} />
          )}
          {(connectionError || connectionFailed) && (
            <Alert variant="danger">
              Could not connect to the course agent.{!connectionError && ' Reconnecting…'}
            </Alert>
          )}
          {error && (
            <Alert variant="danger" className="mb-0">
              {error.message || 'Something went wrong. Please try again.'}
            </Alert>
          )}
        </div>
      </div>
      <Composer
        draft={draft}
        disabled={!connected || !(readyToSend || replyDenies) || deny.isPending}
        pending={deny.isPending}
        placeholder={
          replyDenies
            ? 'Explain what to change…'
            : inputRequestOpen
              ? 'Reply to the agent, or ask something else…'
              : undefined
        }
        sendLabel={replyDenies ? 'Deny and send' : undefined}
        stopDisabled={!connected || !canStop}
        onDraftChange={setDraft}
        onSubmit={submit}
        onStop={responseActive || canStop ? () => void stop() : undefined}
      >
        {showConversationStats && <ConversationStats state={lifecycle} />}
      </Composer>
    </div>
  );
}

function Composer({
  draft,
  onDraftChange,
  onSubmit,
  disabled,
  placeholder = 'Ask the course agent…',
  sendLabel = 'Send',
  pending = false,
  stopDisabled = false,
  children,
  onStop,
}: {
  draft: string;
  onDraftChange: (draft: string) => void;
  onSubmit: (event?: SyntheticEvent) => void;
  disabled: boolean;
  placeholder?: string;
  sendLabel?: string;
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
        placeholder={placeholder}
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
          <Button
            type="submit"
            size="sm"
            aria-label={sendLabel}
            disabled={!draft.trim() || disabled}
          >
            <i className="bi bi-send" aria-hidden="true" />
          </Button>
        )}
      </div>
    </Form>
  );
}

function reviewInHistory(messages: UIMessage[], reviewId: string) {
  return messages.some((message) =>
    message.parts.some(
      (part) =>
        part.type === 'data-review' &&
        ReviewPartSchema.safeParse(part.data).data?.reviewId === reviewId,
    ),
  );
}

/** Parts from an older or newer agent service may not match; show only what parses. */
function toolCallOf(part: UIMessage['parts'][number]) {
  if (part.type !== 'data-tool') return null;
  return ToolCallSchema.safeParse(part.data).data ?? null;
}

function Message({
  message,
  live,
  conversationId,
  awaitingReviewId,
  linkTransform,
  onToolCallExpand,
  answered,
  canAnswer,
  onAnswer,
}: {
  message: UIMessage;
  /** Staff have sent a message since this one, which answers any input it requests. */
  answered: boolean;
  canAnswer: boolean;
  onAnswer: (text: string) => void;
  /** Whether this message is still streaming. */
  live: boolean;
  conversationId: string;
  /** An idle conversation's review whose result the agent has not received. */
  awaitingReviewId: string | null;
  linkTransform: UrlTransform;
  /** Opening a tool call must not scroll it out from under the pointer. */
  onToolCallExpand: () => void;
}) {
  if (message.role === 'user') {
    const text = message.parts.map((part) => (part.type === 'text' ? part.text : '')).join('');
    return <UserMessage text={text} />;
  }
  // Consecutive tool calls render together so runs of the same kind can be grouped.
  type Segment = { key: string } & ({ calls: ToolCall[] } | { part: UIMessage['parts'][number] });
  const segments: Segment[] = [];
  message.parts.forEach((part, index) => {
    const call = toolCallOf(part);
    const last = segments.at(-1);
    if (call && last && 'calls' in last) last.calls.push(call);
    else segments.push({ key: `part-${index}`, ...(call ? { calls: [call] } : { part }) });
  });
  // A review ends the agent's turn even though the agent usually writes more after submitting it,
  // so its card goes at the end of that turn: where the agent's turn that receives the result
  // begins, or the end of the message until then.
  const reviewIds = message.parts.flatMap((part) =>
    part.type === 'data-review' ? [ReviewPartSchema.parse(part.data).reviewId] : [],
  );
  const markerTags = new Set(
    message.parts.flatMap((part) =>
      part.type === 'data-turn' ? [TurnPartSchema.parse(part.data).tag] : [],
    ),
  );
  // One key per review, in one list, so the card keeps its state when the marker arrives.
  const reviewEnd = (reviewId: string) => (
    <RequestChangesCard
      key={`review-${reviewId}`}
      conversationId={conversationId}
      reviewId={reviewId}
      canResume={awaitingReviewId === reviewId}
    />
  );
  const rendered = [
    ...segments.map((segment) => {
      if ('calls' in segment) {
        return (
          <ToolCalls
            key={segment.key}
            calls={segment.calls}
            live={live}
            onExpand={onToolCallExpand}
          />
        );
      }
      const { key, part } = segment;
      if ((part.type === 'text' || part.type === 'reasoning') && !part.text.trim()) return null;
      if (part.type === 'text') {
        return <TextPart key={key} part={part} urlTransform={linkTransform} />;
      }
      if (part.type === 'reasoning') return <ReasoningBlock key={key} part={part} />;
      if (part.type === 'data-input-request') {
        const request = InputRequestPartSchema.safeParse(part.data).data;
        if (!request) return null;
        return (
          <InputRequestCard
            key={key}
            part={request}
            answered={answered}
            canAnswer={canAnswer}
            onAnswer={onAnswer}
          />
        );
      }
      if (part.type === 'data-turn') {
        const { tag } = TurnPartSchema.parse(part.data);
        const reviewId = reviewIds.find((id) => reviewTag(id) === tag);
        if (reviewId) return reviewEnd(reviewId);
      }
      return null;
    }),
    ...reviewIds
      .filter((reviewId) => !markerTags.has(reviewTag(reviewId)))
      .map((reviewId) => reviewEnd(reviewId)),
  ].filter((node) => node !== null);
  // A just-started reply has no visible parts yet and would otherwise add an empty gap.
  if (rendered.length === 0) return null;
  return <div className="d-flex flex-column gap-2">{rendered}</div>;
}
