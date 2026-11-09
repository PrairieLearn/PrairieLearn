import { useAgentChat } from '@cloudflare/ai-chat/react';
import { MessageType, type OutgoingMessage } from '@cloudflare/ai-chat/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAgent } from 'agents/react';
import { type UIMessage } from 'ai';
import clsx from 'clsx';
import {
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Alert, Button, Dropdown, Form, Spinner } from 'react-bootstrap';
import { useStickToBottom } from 'use-stick-to-bottom';
import { z } from 'zod';

import {
  type ConversationState,
  MAX_ATTACHMENTS_PER_MESSAGE,
  type ToolCall,
  ToolCallSchema,
} from '@prairielearn/course-agent-types';
import { run } from '@prairielearn/run';
import { getAppError } from '@prairielearn/trpc/client';
import { AppErrorAlert } from '@prairielearn/trpc/react';
import { OverlayTrigger } from '@prairielearn/ui';

import type { StaffCourseAgentConversation } from '../../../lib/client/safe-db-types.js';
import { useTRPC } from '../../../trpc/course/context.js';
import type { CourseAgentError } from '../../../trpc/course/course-agent.js';
import { ReasoningBlock, TextPart } from '../ai/ChatParts.js';

import {
  type DraftAttachment,
  DraftAttachmentList,
  MAX_ATTACHMENT_SIZE,
  SentAttachments,
  revokePreviews,
  uploadDraftAttachments,
  useDraftAttachments,
} from './Attachments.js';
import { ConversationStats } from './ConversationStats.js';
import { RequestChangesCard } from './RequestChangesCard.js';
import { ToolCalls } from './ToolCalls.js';

/** The agent service shows a review in chat history by its ID only. */
const ReviewPartSchema = z.object({ reviewId: z.string() });

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
      // The new conversation's chat now owns the attachments and their previews.
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
              drafts.clear();
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
            attachments={drafts.attachments}
            onAttach={drafts.add}
            onRemoveAttachment={drafts.remove}
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

function UserMessage({ text }: { text: string }) {
  return (
    <div className="align-self-end course-agent-user-message bg-body-secondary rounded-3 px-3 py-2">
      {text}
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
  initialMessage: { text: string; attachments: DraftAttachment[] } | undefined;
  onInitialMessageSent: () => void;
}) {
  const trpc = useTRPC();
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
  const readyToSend =
    !pendingReview && (lifecycle?.status === 'offline' || lifecycle?.status === 'waiting_for_user');
  const canStop = lifecycle?.status === 'starting' || lifecycle?.status === 'waiting_for_agent';
  const [draft, setDraft] = useState('');
  // A new conversation's first attachments start in the composer, where their uploads show progress.
  const drafts = useDraftAttachments(initialMessage?.attachments);
  const [sending, setSending] = useState(false);
  // Wait for initial history before allowing messages to be sent.
  const connected = agent.readyState === 1 && historyReady;

  const { setStatus, setAttachments } = drafts;
  const offline = lifecycle?.status === 'offline';
  /** Upload the attachments, then send. A failed upload keeps the draft for another try. */
  const send = useCallback(
    async (text: string, attachments: DraftAttachment[]) => {
      setSending(true);
      const files = await uploadDraftAttachments(attachments, {
        url: `/pl/course/${courseId}/course_agent/conversations/${conversationId}/uploads`,
        csrfToken: chatCsrfToken,
        setStatus,
      });
      setSending(false);
      if (!files) return false;
      if (offline) setAwaitingStart(true);
      void sendMessage({ text, files });
      setDraft('');
      revokePreviews(attachments);
      setAttachments([]);
      return true;
    },
    [courseId, conversationId, chatCsrfToken, setStatus, setAttachments, sendMessage, offline],
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
  const stickToBottom = useStickToBottom({ initial: 'instant', resize: 'smooth' });

  const submit = (event?: SyntheticEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || responseActive || !connected || !readyToSend || sending) return;
    void send(text, drafts.attachments);
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
              onToolCallExpand={stickToBottom.stopScroll}
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
        disabled={!connected || !readyToSend}
        pending={sending}
        attachments={drafts.attachments}
        stopDisabled={!connected || !canStop}
        onAttach={drafts.add}
        onRemoveAttachment={drafts.remove}
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
  const [dragging, setDragging] = useState(false);
  // Fit the message box to its text, including when the draft is cleared after sending. CSS caps
  // the height, and a hidden panel has no height to measure.
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    if (textarea.scrollHeight) textarea.style.height = `${textarea.scrollHeight}px`;
  }, [draft]);
  const hasInvalidAttachment = attachments.some((a) => a.status.kind === 'invalid');
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!hasInvalidAttachment) onSubmit(event);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      submit(event);
    }
  };
  const draggingFiles = (event: DragEvent) =>
    !pending && event.dataTransfer.types.includes('Files');

  return (
    <Form
      className="border-top p-3"
      onSubmit={submit}
      onDragOver={(event) => {
        if (!draggingFiles(event)) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(event) => {
        setDragging(false);
        if (!draggingFiles(event)) return;
        event.preventDefault();
        onAttach([...event.dataTransfer.files]);
      }}
    >
      <div
        className={clsx(
          'course-agent-composer position-relative border rounded-3',
          pending && 'bg-body-tertiary',
        )}
      >
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
          placeholder="Ask the course agent…"
          aria-label="Message"
          disabled={pending}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={onKeyDown}
          onPaste={(event) => {
            if (event.clipboardData.files.length === 0) return;
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
                aria-label="Send"
                disabled={!draft.trim() || disabled || pending || hasInvalidAttachment}
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
        {dragging && (
          <div className="course-agent-drop-target position-absolute top-0 start-0 w-100 h-100 rounded-3 d-flex flex-column align-items-center justify-content-center text-primary">
            <i className="bi bi-upload fs-4" aria-hidden="true" />
            <span className="fw-medium">Drop files to attach</span>
            <span className="small">
              Up to {MAX_ATTACHMENTS_PER_MESSAGE} files, {MAX_ATTACHMENT_SIZE} each
            </span>
          </div>
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
  onToolCallExpand,
}: {
  message: UIMessage;
  /** Whether this message is still streaming. */
  live: boolean;
  conversationId: string;
  /** An idle conversation's review whose result the agent has not received. */
  awaitingReviewId: string | null;
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
  // Consecutive tool calls render together so runs of the same kind can be grouped.
  type Segment = { key: string } & ({ calls: ToolCall[] } | { part: UIMessage['parts'][number] });
  const segments: Segment[] = [];
  message.parts.forEach((part, index) => {
    const call = toolCallOf(part);
    const last = segments.at(-1);
    if (call && last && 'calls' in last) last.calls.push(call);
    else segments.push({ key: `part-${index}`, ...(call ? { calls: [call] } : { part }) });
  });
  const rendered = segments
    .map((segment) => {
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
      if (part.type === 'text') return <TextPart key={key} part={part} />;
      if (part.type === 'reasoning') return <ReasoningBlock key={key} part={part} />;
      if (part.type === 'data-review') {
        const { reviewId } = ReviewPartSchema.parse(part.data);
        return (
          <RequestChangesCard
            key={key}
            conversationId={conversationId}
            reviewId={reviewId}
            canResume={awaitingReviewId === reviewId}
          />
        );
      }
      return null;
    })
    .filter((node) => node !== null);
  // A just-started reply has no visible parts yet and would otherwise add an empty gap.
  if (rendered.length === 0) return null;
  return <div className="d-flex flex-column gap-2">{rendered}</div>;
}
