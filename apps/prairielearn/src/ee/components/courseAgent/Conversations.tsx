import { useAgentChat } from '@cloudflare/ai-chat/react';
import { MessageType, type OutgoingMessage } from '@cloudflare/ai-chat/types';
import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAgent } from 'agents/react';
import { type TextUIPart, type UIMessage } from 'ai';
import clsx from 'clsx';
import {
  type KeyboardEvent,
  type ReactNode,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
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
  type InputRequestPart,
  InputRequestPartSchema,
  ToolCallSchema,
} from '@prairielearn/course-agent-types';
import { formatInterval } from '@prairielearn/formatter';
import { getAppError } from '@prairielearn/trpc/client';
import { AppErrorAlert } from '@prairielearn/trpc/react';
import { OverlayTrigger } from '@prairielearn/ui';

import type { StaffCourseAgentConversation } from '../../../lib/client/safe-db-types.js';
import { useTRPC } from '../../../trpc/course/context.js';
import type { CourseAgentError } from '../../../trpc/course/course-agent.js';
import { TextPart } from '../ai/ChatParts.js';

import {
  type DraftAttachment,
  DraftAttachmentList,
  FileDropArea,
  SentAttachments,
  hasInvalidAttachment,
  uploadDraftAttachments,
  useDraftAttachments,
} from './Attachments.js';
import { BlockedNotice } from './BlockedNotice.js';
import { ConversationStats } from './ConversationStats.js';
import { InputRequestCard } from './InputRequestCard.js';
import { NavigationCard, navigationOf } from './Navigation.js';
import { PlanChecklist, planOf } from './Plan.js';
import { RequestChangesCard } from './RequestChangesCard.js';
import { LiveOutput, Work, type WorkItem, reasoningHeading, runningLabel } from './ToolCalls.js';
import { UserMessage } from './UserMessage.js';
import { courseFileLinkTransform } from './courseFileLinks.js';
import { currentPageLocation } from './pageLocation.js';

/** The agent service shows a review in chat history by its ID only. */
const ReviewPartSchema = z.object({ reviewId: z.string() });

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
  const drafts = useDraftAttachments();
  // A new conversation's first message uploads its attachments once the conversation exists.
  const [initialAttachments, setInitialAttachments] = useState<DraftAttachment[]>([]);
  const create = useMutation({
    ...trpc.courseAgent.create.mutationOptions(),
    onSuccess: (conversation) => {
      queryClient.setQueryData(trpc.courseAgent.list.queryKey(), (current) => [
        conversation,
        ...(current ?? []),
      ]);
      setPickedId(conversation.id);
      // The new conversation's chat now owns the attachments.
      drafts.setAttachments([]);
      void queryClient.invalidateQueries({ queryKey: trpc.courseAgent.list.queryKey() });
    },
    onError: (_error, { text }) => setDraft(text),
  });

  const submitNew = (event?: SyntheticEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || create.isPending) return;
    setInitialAttachments(drafts.attachments);
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
              drafts.setAttachments([]);
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
          initialMessage={
            create.data?.id === selectedId && create.variables
              ? { text: create.variables.text, attachments: initialAttachments }
              : undefined
          }
          onInitialMessageSent={create.reset}
        />
      ) : active ? (
        <FileDropArea enabled={!create.isPending} onDrop={drafts.add}>
          <div className="flex-grow-1 p-3">
            {create.isPending ? (
              <div className="d-flex flex-column gap-3">
                <UserMessage text={create.variables.text} />
                <PendingStatus label="Getting ready…" />
              </div>
            ) : (
              <EmptyConversation onStart={setDraft} />
            )}
            {create.isError && (
              <AppErrorAlert error={createError} render={{ UNKNOWN: ({ message }) => message }} />
            )}
          </div>
          <Composer
            draft={draft}
            disabled={create.isPending}
            pending={create.isPending}
            attachments={drafts.attachments}
            onAttach={drafts.add}
            onRemoveAttachment={drafts.remove}
            onDraftChange={setDraft}
            onSubmit={submitNew}
          />
        </FileDropArea>
      ) : null}
    </div>
  );
}

/** Openings for staff who are not sure what to ask. Each leaves the rest for them to fill in. */
const STARTERS = [
  { label: 'Review a question', text: 'Review this question and suggest improvements: ' },
  { label: 'Write a new question', text: 'Write a new question about ' },
  { label: 'See how students are doing', text: 'Which questions are students finding hardest in ' },
  { label: 'Ask how PrairieLearn works', text: 'How do I ' },
];

function EmptyConversation({ onStart }: { onStart: (text: string) => void }) {
  return (
    <div className="text-center my-4">
      <p className="text-muted">Ask the course agent about your course or about PrairieLearn.</p>
      <div className="d-flex flex-wrap justify-content-center gap-2">
        {STARTERS.map(({ label, text }) => (
          <Button
            key={label}
            variant="outline-secondary"
            size="sm"
            className="rounded-pill"
            onClick={(event) => {
              onStart(text);
              // The opening is unfinished, so typing carries on from it in the message box.
              event.currentTarget
                .closest('.course-agent-panel')
                ?.querySelector<HTMLTextAreaElement>('.course-agent-composer textarea')
                ?.focus();
            }}
          >
            {label}
          </Button>
        ))}
      </div>
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

/**
 * What the agent is doing now and for how long, shown for as long as it works. It stays mounted
 * from the sandbox starting to the turn ending, so the time covers both.
 */
function ActivityStatus({
  conversationId,
  startingSandbox,
  message,
}: {
  conversationId: string;
  startingSandbox: boolean;
  message: UIMessage | undefined;
}) {
  const call = latestCall(message);
  const storageKey = `course-agent-working-since:${conversationId}`;
  const [startedAt] = useState(() => Number(sessionStorage.getItem(storageKey)) || Date.now());
  const [now, setNow] = useState(() => Date.now());
  // Advances the elapsed time once a second.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  // Remembers when the agent started, so reloading the page mid-turn does not restart the time.
  // Leaving the page skips the cleanup; the turn ending runs it.
  useEffect(() => {
    sessionStorage.setItem(storageKey, String(startedAt));
    return () => sessionStorage.removeItem(storageKey);
  }, [storageKey, startedAt]);
  return (
    <div className="small text-body-secondary" role="status">
      {/* The label changes with every step and the time every second, too often to announce. */}
      <span className="visually-hidden">
        {startingSandbox ? 'Getting ready…' : 'The course agent is working…'}
      </span>
      <div className="d-flex gap-2" aria-hidden="true">
        <span className="text-truncate course-agent-shimmer">
          {startingSandbox ? 'Getting ready' : activityLabel(message)}…
        </span>
        <span className="flex-shrink-0">{formatInterval(now - startedAt)}</span>
      </div>
      {call?.status === 'running' && <LiveOutput call={call} lines={1} />}
    </div>
  );
}

/** The call the agent made last, if nothing has followed it. */
function latestCall(message: UIMessage | undefined) {
  if (message?.role !== 'assistant') return null;
  for (let i = message.parts.length - 1; i >= 0; i--) {
    const part = message.parts[i];
    const call = toolCallOf(part);
    if (call) return call;
    if ((part.type === 'text' || part.type === 'reasoning') && part.text.trim()) return null;
  }
  return null;
}

/**
 * What the agent is doing now, in plain words: the call it is running, the reply it is writing,
 * or what it is thinking about. The plan above the message box already shows its current step.
 */
function activityLabel(message: UIMessage | undefined) {
  const call = latestCall(message);
  if (call?.status === 'running') return runningLabel(call);
  const part = message?.role === 'assistant' ? message.parts.at(-1) : undefined;
  if (part?.type === 'text' && part.state === 'streaming') return 'Writing';
  return (part?.type === 'reasoning' && reasoningHeading(part.text)) || 'Thinking';
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
  initialMessage: { text: string; attachments: DraftAttachment[] } | undefined;
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
  const [initialText, setInitialText] = useState(initialMessage?.text);
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
  // A new conversation's first attachments start in the composer, where their uploads show progress.
  const drafts = useDraftAttachments(initialMessage?.attachments);
  const [sending, setSending] = useState(false);
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

  const { setStatus, setAttachments } = drafts;
  const { reset: resetDeny, mutateAsync: denyAsync } = deny;
  const offline = lifecycle?.status === 'offline';
  /**
   * Upload the attachments, deny the review if the message replies to one, then send. A failed
   * upload or a refused denial keeps the draft for another try.
   */
  const send = useCallback(
    async (text: string, attachments: DraftAttachment[], deniedReviewId?: string) => {
      setSending(true);
      const files = await uploadDraftAttachments(attachments, {
        url: `/pl/course/${courseId}/course_agent/conversations/${conversationId}/uploads`,
        csrfToken: chatCsrfToken,
        setStatus,
      });
      // Denying only after the uploads succeed means a failed upload can't leave the review denied
      // without its message. PrairieLearn has delivered the denial when this resolves, so the
      // message's turn follows it. On a conflict the review shows the decision that won.
      const denied =
        files && deniedReviewId
          ? await denyAsync({
              conversationId,
              reviewId: deniedReviewId,
              decision: 'denied',
              viaMessage: true,
            }).then(
              () => true,
              () => false,
            )
          : true;
      setSending(false);
      if (!files || !denied) return false;
      if (offline) setAwaitingStart(true);
      // A refused denial's error no longer applies once the message goes out normally.
      resetDeny();
      void sendMessage({ text, files, metadata: { location: currentPageLocation() } });
      // An answer chosen on an input request leaves the composer's attachments alone.
      if (attachments.length > 0) setAttachments([]);
      return true;
    },
    [
      courseId,
      conversationId,
      chatCsrfToken,
      setStatus,
      setAttachments,
      resetDeny,
      denyAsync,
      sendMessage,
      offline,
    ],
  );

  const initialMessageSentRef = useRef(false);
  // A newly created conversation must receive history before its first prompt is handed to the SDK.
  useEffect(() => {
    if (!connected || !readyToSend || !initialMessage || initialMessageSentRef.current) return;
    initialMessageSentRef.current = true;
    const { text, attachments } = initialMessage;
    void send(text, attachments).then((sent) => {
      if (sent) return;
      // The first message was shown as sent, so return it to the composer for another try.
      setInitialText(undefined);
      setAwaitingStart(false);
      setDraft(text);
    });
    onInitialMessageSent();
  }, [connected, readyToSend, initialMessage, onInitialMessageSent, send]);

  const responseActive =
    status === 'submitted' || status === 'streaming' || isServerStreaming || isRecovering;
  const working =
    (responseActive || lifecycle?.status === 'waiting_for_agent') &&
    !connectionFailed &&
    !connectionError;
  const plan = working ? planOf(messages.at(-1)) : null;
  // The server reports the turn's lifecycle before the SDK marks the response active.
  const startingSandbox =
    !connectionFailed &&
    !connectionError &&
    (lifecycle?.status === 'starting' ||
      ((lifecycle === null || lifecycle.status === 'offline') &&
        (awaitingStart || responseActive)));
  const showInitialText =
    initialText !== undefined && !messages.some((message) => message.role === 'user');
  const awaitingReviewId =
    !responseActive && (lifecycle?.status === 'waiting_for_user' || lifecycle?.status === 'offline')
      ? (lifecycle.reviewId ?? null)
      : null;
  // An input request is open until staff send their next message, which answers it however it is sent.
  const lastUserIndex = messages.map((message) => message.role).lastIndexOf('user');
  const latest = messages.at(-1);
  // The agent writes its closing message after requesting a review or input, so the request's card
  // waits for the turn to end rather than moving down as that text arrives. A review being
  // delivered is already decided and stays shown.
  const turnRunning = canStop;
  const hiddenReviewId =
    turnRunning && review.data?.status !== 'decided' ? (lifecycle.reviewId ?? null) : null;
  const inputRequestOpen =
    !turnRunning &&
    latest?.role === 'assistant' &&
    latest.parts.some((part) => part.type === 'data-input-request');
  const stickToBottom = useStickToBottom({ initial: 'instant', resize: 'smooth' });
  // A stable transform lets memoized Markdown blocks skip re-rendering.
  const linkTransform = useMemo(() => courseFileLinkTransform(courseId), [courseId]);

  const canSend = connected && readyToSend && !responseActive && !sending;

  const submit = (event?: SyntheticEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || responseActive || !connected || sending || deny.isPending) return;
    if (!replyDenies && !canSend) return;
    void send(text, drafts.attachments, replyDenies ? lifecycle.reviewId! : undefined).then(
      (sent) => {
        if (sent) setDraft('');
      },
    );
  };

  return (
    <FileDropArea enabled={!sending} onDrop={drafts.add}>
      <div ref={stickToBottom.scrollRef} className="flex-grow-1 overflow-y-auto">
        <div ref={stickToBottom.contentRef} className="d-flex flex-column gap-3 p-3">
          {!showInitialText && !historyReady && !connectionError && !connectionFailed && (
            <Loading />
          )}
          {historyReady && !showInitialText && messages.length === 0 && (
            <EmptyConversation onStart={setDraft} />
          )}
          {messages.map((message, index) => (
            <Message
              key={message.id}
              message={message}
              live={responseActive && index === messages.length - 1}
              conversationId={conversationId}
              awaitingReviewId={awaitingReviewId}
              hiddenReviewId={hiddenReviewId}
              turnRunning={turnRunning && index === messages.length - 1}
              linkTransform={linkTransform}
              answered={index < lastUserIndex}
              canAnswer={canSend}
              onToolCallExpand={stickToBottom.stopScroll}
              onAnswer={(text) => void send(text, [])}
            />
          ))}
          {showInitialText && <UserMessage text={initialText} />}
          {/* Stop can end the stream before history records the review, which would otherwise
              leave the conversation waiting on a review with no card to decide it. */}
          {historyReady &&
            lifecycle?.reviewId &&
            lifecycle.reviewId !== hiddenReviewId &&
            !reviewInHistory(messages, lifecycle.reviewId) && (
              <RequestChangesCard
                conversationId={conversationId}
                reviewId={lifecycle.reviewId}
                canResume={awaitingReviewId === lifecycle.reviewId}
              />
            )}
          {(startingSandbox || working) && (
            <ActivityStatus
              conversationId={conversationId}
              startingSandbox={startingSandbox}
              message={messages.at(-1)}
            />
          )}
          {lifecycle?.status === 'blocked' && (
            <BlockedNotice
              state={lifecycle}
              disabled={!connected || resume.isPending}
              onResume={() => resume.mutate({ conversationId })}
            />
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
      {plan && plan.steps.length > 0 && <PlanChecklist plan={plan} />}
      <Composer
        draft={draft}
        disabled={!connected || !(readyToSend || replyDenies) || deny.isPending}
        placeholder={
          replyDenies
            ? 'Explain what to change…'
            : inputRequestOpen
              ? 'Reply to the agent, or ask something else…'
              : undefined
        }
        sendLabel={replyDenies ? 'Deny and send' : undefined}
        pending={sending || deny.isPending}
        attachments={drafts.attachments}
        stopDisabled={!connected || !canStop}
        onAttach={drafts.add}
        onRemoveAttachment={drafts.remove}
        onDraftChange={setDraft}
        onSubmit={submit}
        onStop={responseActive || canStop ? () => void stop() : undefined}
      >
        {showConversationStats && (
          <ConversationStats state={lifecycle} conversationId={conversationId} />
        )}
      </Composer>
    </FileDropArea>
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
  attachments,
  onAttach,
  onRemoveAttachment,
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
  /** Sending: the draft and its attachments stay visible but can't be edited. */
  pending?: boolean;
  attachments: DraftAttachment[];
  onAttach: (files: File[]) => void;
  onRemoveAttachment: (key: string) => void;
  stopDisabled?: boolean;
  children?: ReactNode;
  onStop?: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Fit the message box to its text, including when the draft is cleared after sending. CSS caps
  // the height.
  useLayoutEffect(() => {
    if (textareaRef.current) fitToText(textareaRef.current);
  }, [draft]);
  // The text rewraps when the box's width changes, such as when the window or panel is resized.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    let width = textarea.clientWidth;
    const observer = new ResizeObserver(() => {
      // Fitting changes the height, which this also observes.
      if (textarea.clientWidth === width) return;
      width = textarea.clientWidth;
      fitToText(textarea);
    });
    observer.observe(textarea);
    return () => observer.disconnect();
  }, []);
  const invalidAttachment = hasInvalidAttachment(attachments);
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!invalidAttachment) onSubmit(event);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      submit(event);
    }
  };

  return (
    <Form className="border-top p-3" onSubmit={submit}>
      <div className={clsx('course-agent-composer rounded-3', pending && 'bg-body-tertiary')}>
        <DraftAttachmentList
          attachments={attachments}
          sending={pending}
          onRemove={onRemoveAttachment}
        />
        <Form.Control
          ref={textareaRef}
          as="textarea"
          rows={2}
          className="course-agent-composer-input border-0 shadow-none bg-transparent mb-1"
          value={draft}
          placeholder={placeholder}
          aria-label="Message"
          disabled={pending}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={onKeyDown}
          onPaste={(event) => {
            if (pending || event.clipboardData.files.length === 0) return;
            // Copied cells and rich text carry an image of themselves beside their text; paste the text.
            if (
              event.clipboardData.getData('text/plain') &&
              event.clipboardData.getData('text/html')
            ) {
              return;
            }
            event.preventDefault();
            onAttach([...event.clipboardData.files]);
          }}
        />
        <div className="d-flex align-items-center gap-2 px-2 pb-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              onAttach([...(event.target.files ?? [])]);
              event.target.value = '';
            }}
          />
          <Button
            variant="link"
            size="sm"
            className="course-agent-icon-button"
            aria-label="Attach files"
            disabled={pending}
            onClick={() => fileInputRef.current?.click()}
          >
            <i className="bi bi-plus-lg" aria-hidden="true" />
          </Button>
          <div className="d-flex align-items-center gap-2 ms-auto">
            {children}
            {onStop ? (
              <Button
                variant="outline-secondary"
                size="sm"
                disabled={stopDisabled}
                onClick={onStop}
              >
                <i className="bi bi-stop-fill me-1" aria-hidden="true" />
                Stop
              </Button>
            ) : (
              <Button
                type="submit"
                size="sm"
                aria-label={sendLabel}
                disabled={!draft.trim() || disabled || pending || invalidAttachment}
              >
                {pending ? (
                  <Spinner animation="border" size="sm" aria-hidden="true" />
                ) : (
                  <i className="bi bi-send" aria-hidden="true" />
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Form>
  );
}

function fitToText(textarea: HTMLTextAreaElement) {
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
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
  hiddenReviewId,
  turnRunning,
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
  /** A review requested by the running turn, whose card waits for the turn to end. */
  hiddenReviewId: string | null;
  /** The agent's turn that writes this message is running, so its input requests wait too. */
  turnRunning: boolean;
  linkTransform: UrlTransform;
  /** Opening a tool call must not scroll it out from under the pointer. */
  onToolCallExpand: () => void;
}) {
  if (message.role === 'user') {
    const text = message.parts.map((part) => (part.type === 'text' ? part.text : '')).join('');
    return (
      <div className="d-flex flex-column align-items-end gap-2">
        <SentAttachments message={message} />
        <UserMessage text={text} />
      </div>
    );
  }
  // Reviews and input requests end the agent's turn, so their cards go at the end of that turn:
  // before the marker of the turn that continues this message (a review result's delivery), or at
  // the end of the message.
  type Card =
    | { kind: 'review'; reviewId: string }
    | { kind: 'input'; key: string; request: InputRequestPart };
  const renderCard = (card: Card) =>
    card.kind === 'review' ? (
      // One key per review, so the card keeps its state when the marker arrives.
      <RequestChangesCard
        key={`review-${card.reviewId}`}
        conversationId={conversationId}
        reviewId={card.reviewId}
        canResume={awaitingReviewId === card.reviewId}
      />
    ) : (
      <InputRequestCard
        key={card.key}
        part={card.request}
        answered={answered}
        canAnswer={canAnswer}
        onAnswer={onAnswer}
      />
    );
  const rendered: ReactNode[] = [];
  let cards: Card[] = [];
  // What the agent does before a reply folds into one line. Text it writes is its reply unless
  // the agent carries on afterwards, which makes that text an update along the way.
  let work: { key: string; items: WorkItem[] } | null = null;
  let reply: { key: string; part: TextUIPart } | null = null;
  const flush = (settled: boolean) => {
    if (work) {
      rendered.push(
        <Work
          key={work.key}
          items={work.items}
          live={live}
          settled={settled}
          // The reply under it, which may yet turn out to be an update, is the latest word.
          showUpdate={!reply}
          onExpand={onToolCallExpand}
        />,
      );
    }
    if (reply) {
      rendered.push(<TextPart key={reply.key} part={reply.part} urlTransform={linkTransform} />);
    }
    work = null;
    reply = null;
  };
  for (const [index, part] of message.parts.entries()) {
    const key = `part-${index}`;
    if ((part.type === 'text' || part.type === 'reasoning') && !part.text.trim()) continue;
    const step = toolCallOf(part) ?? (part.type === 'reasoning' ? part : null);
    if (step) {
      work ??= { key: reply?.key ?? key, items: [] };
      if (reply) work.items.push(reply.part);
      reply = null;
      work.items.push(step);
      continue;
    }
    if (part.type === 'text') {
      // More text after it also makes it an update; the plan tool, for one, leaves no step between.
      if (reply) {
        work ??= { key: reply.key, items: [] };
        work.items.push(reply.part);
      }
      reply = { key, part };
      // The agent service says so when the model labels its updates, which saves waiting to see.
      const metadata: { update?: unknown } | undefined = part.providerMetadata?.courseAgent;
      if (metadata?.update === true) {
        work ??= { key, items: [] };
        work.items.push(part);
        reply = null;
      }
      continue;
    }
    const navigation = navigationOf(part);
    if (navigation) {
      flush(true);
      rendered.push(<NavigationCard key={key} navigation={navigation} />);
    } else if (part.type === 'data-review') {
      // Cards wait for the end of the turn, so they do not split the work before the reply.
      const { reviewId } = ReviewPartSchema.parse(part.data);
      if (reviewId !== hiddenReviewId) cards.push({ kind: 'review', reviewId });
    } else if (part.type === 'data-input-request') {
      const request = InputRequestPartSchema.safeParse(part.data).data;
      if (request) cards.push({ kind: 'input', key, request });
    } else if (part.type === 'data-turn') {
      flush(true);
      rendered.push(...cards.map(renderCard));
      cards = [];
    }
  }
  // Until the turn ends, text that looks like the reply may be followed by more work.
  flush(!live);
  rendered.push(...cards.filter((card) => card.kind === 'review' || !turnRunning).map(renderCard));
  // A just-started reply has no visible parts yet and would otherwise add an empty gap.
  if (rendered.length === 0) return null;
  return <div className="d-flex flex-column gap-2">{rendered}</div>;
}
