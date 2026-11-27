import { useAgentChat } from '@cloudflare/ai-chat/react';
import { MessageType, type OutgoingMessage } from '@cloudflare/ai-chat/types';
import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAgent } from 'agents/react';
import { type UIMessage } from 'ai';
import clsx from 'clsx';
import {
  type KeyboardEvent,
  type ReactNode,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert, Button, CloseButton, Dropdown, Form, Spinner } from 'react-bootstrap';
import type { UrlTransform } from 'react-markdown';
import { useStickToBottom } from 'use-stick-to-bottom';

import {
  type ConversationState,
  type InputRequestPart,
  InputRequestPartSchema,
  type ReviewPart,
  ReviewPartSchema,
  type ToolCall,
  ToolCallSchema,
} from '@prairielearn/course-agent-types';
import { run } from '@prairielearn/run';
import { getAppError } from '@prairielearn/trpc/client';
import { AppErrorAlert } from '@prairielearn/trpc/react';
import { OverlayTrigger } from '@prairielearn/ui';

import type { StaffCourseAgentConversation } from '../../../lib/client/safe-db-types.js';
import {
  type EnumCourseAgentApprovalMode,
  EnumCourseAgentApprovalModeSchema,
} from '../../../lib/db-types.js';
import { useTRPC } from '../../../trpc/course/context.js';
import type { CourseAgentError } from '../../../trpc/course/course-agent.js';
import { ReasoningBlock, TextPart } from '../ai/ChatParts.js';

import {
  type DraftAttachment,
  DraftAttachmentList,
  FileDropArea,
  SentAttachments,
  hasInvalidAttachment,
  revokePreviews,
  uploadDraftAttachments,
  useDraftAttachments,
} from './Attachments.js';
import { AutoApproveModal } from './AutoApproveModal.js';
import { BlockedNotice } from './BlockedNotice.js';
import { ChatCodeBlock } from './ChatDiff.js';
import { ConversationStats } from './ConversationStats.js';
import { InputRequestCard } from './InputRequestCard.js';
import { NavigationCard, ReloadCard, isReloadPart, navigationOf } from './Navigation.js';
import { RequestChangesCard } from './RequestChangesCard.js';
import { AutoApprovedChanges, ToolCalls } from './ToolCalls.js';
import { UserMessage } from './UserMessage.js';
import { courseFileLinkTransform } from './courseFileLinks.js';
import { currentPageLocation } from './pageLocation.js';

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
  // The mode a new conversation starts in: the one this user last chose in this course.
  const defaultApprovalModeKey = trpc.courseAgent.defaultApprovalMode.queryKey();
  const newApprovalMode =
    useQuery(trpc.courseAgent.defaultApprovalMode.queryOptions()).data ?? 'approval_required';
  const rememberApprovalMode = (mode: EnumCourseAgentApprovalMode) =>
    queryClient.setQueryData(defaultApprovalModeKey, mode);
  const saveDefaultApprovalMode = useMutation({
    ...trpc.courseAgent.setApprovalMode.mutationOptions(),
    onError: () => void queryClient.invalidateQueries({ queryKey: defaultApprovalModeKey }),
  });
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
    create.mutate({ text, approvalMode: newApprovalMode });
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
          approvalMode={selectedConversation?.approval_mode ?? 'approval_required'}
          offeredAutoApprove={selectedConversation?.auto_approve_offered_at != null}
          chatCsrfToken={chatCsrfToken}
          initialMessage={
            create.data?.id === selectedId && create.variables
              ? { text: create.variables.text, attachments: initialAttachments }
              : undefined
          }
          onApprovalModeChosen={rememberApprovalMode}
          onInitialMessageSent={create.reset}
        />
      ) : active ? (
        <FileDropArea enabled={!create.isPending} onDrop={drafts.add}>
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
            approvalMode={newApprovalMode}
            onApprovalModeChange={(mode) => {
              rememberApprovalMode(mode);
              saveDefaultApprovalMode.mutate({ approvalMode: mode });
            }}
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
  approvalMode,
  offeredAutoApprove,
  onApprovalModeChosen,
}: {
  courseId: string;
  conversationId: string;
  showConversationStats: boolean;
  chatCsrfToken: string;
  initialMessage: { text: string; attachments: DraftAttachment[] } | undefined;
  approvalMode: EnumCourseAgentApprovalMode;
  /** This conversation has already offered auto-approve. */
  offeredAutoApprove: boolean;
  /** The instructor chose a mode, which their next new conversation starts in. */
  onApprovalModeChosen: (mode: EnumCourseAgentApprovalMode) => void;
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
        current?.map((conversation) =>
          conversation.id === updated.id ? { ...conversation, title: updated.title } : conversation,
        ),
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
  const listKey = trpc.courseAgent.list.queryKey();
  const saveApprovalMode = useMutation({
    ...trpc.courseAgent.setApprovalMode.mutationOptions(),
    // Saves run one at a time, so the last choice is the one the conversation keeps.
    scope: { id: `course-agent-approval-mode:${conversationId}` },
  });
  const saveApprovalModeError = getAppError<CourseAgentError['SetApprovalMode']>(
    saveApprovalMode.error,
  );
  // Approving one review is when auto-approve is worth offering, once per conversation.
  const [showAutoApproveOffer, setShowAutoApproveOffer] = useState(false);
  const [confirmingAutoApprove, setConfirmingAutoApprove] = useState(false);
  const setOffered = useMutation({
    ...trpc.courseAgent.setAutoApproveOffered.mutationOptions(),
    // Only this field, so a mode chosen meanwhile stays.
    onSuccess: (updated) =>
      queryClient.setQueryData(listKey, (current) =>
        current?.map((conversation) =>
          conversation.id === updated.id
            ? { ...conversation, auto_approve_offered_at: updated.auto_approve_offered_at }
            : conversation,
        ),
      ),
  });
  const offerAutoApprove = () => {
    if (approvalMode === 'always_approve' || offeredAutoApprove || !setOffered.isIdle) return;
    setShowAutoApproveOffer(true);
    setOffered.mutate({ conversationId });
  };
  const changeApprovalMode = (mode: EnumCourseAgentApprovalMode) => {
    setShowAutoApproveOffer(false);
    // Cancel list fetches that started earlier, which would restore the old mode.
    void queryClient.cancelQueries({ queryKey: listKey });
    queryClient.setQueryData(listKey, (current) =>
      current?.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, approval_mode: mode }
          : conversation,
      ),
    );
    onApprovalModeChosen(mode);
    // Only the last save's failure applies; refetching shows the modes PrairieLearn kept.
    saveApprovalMode.mutate(
      { conversationId, approvalMode: mode },
      {
        onError: () => {
          void queryClient.invalidateQueries({ queryKey: listKey });
          void queryClient.invalidateQueries({
            queryKey: trpc.courseAgent.defaultApprovalMode.queryKey(),
          });
        },
      },
    );
  };
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

  const uploadsUrl = `/pl/course/${courseId}/course_agent/conversations/${conversationId}/uploads`;
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
        url: uploadsUrl,
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
      if (attachments.length > 0) {
        revokePreviews(attachments);
        setAttachments([]);
      }
      return true;
    },
    [
      uploadsUrl,
      chatCsrfToken,
      conversationId,
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
      return toolCallOf(part) !== null || navigationOf(part) !== null || isReloadPart(part);
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
      <div
        ref={stickToBottom.scrollRef}
        className="flex-grow-1 overflow-y-auto"
        // Scrollable regions must be reachable by keyboard. Safari only scrolls with Page Up, Page
        // Down, or the arrow keys when the scrollable area itself has focus.
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        role="region"
        aria-label="Conversation"
      >
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
              uploadsUrl={uploadsUrl}
              awaitingReviewId={awaitingReviewId}
              hiddenReviewId={hiddenReviewId}
              turnRunning={turnRunning && index === messages.length - 1}
              linkTransform={linkTransform}
              answered={index < lastUserIndex}
              canAnswer={canSend}
              onApprovedOnce={offerAutoApprove}
              onAlwaysApprove={() => changeApprovalMode('always_approve')}
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
                onApprovedOnce={offerAutoApprove}
                onAlwaysApprove={() => changeApprovalMode('always_approve')}
              />
            )}
          {pendingLabel && <PendingStatus label={pendingLabel} />}
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
          {saveApprovalModeError && (
            <AppErrorAlert
              error={saveApprovalModeError}
              render={{
                UNKNOWN: () => 'Could not change the approval mode. Choose it again to retry.',
              }}
            />
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
      {showAutoApproveOffer && (
        <Alert
          variant="warning"
          className="course-agent-auto-approve-offer small mb-0 rounded-0 border-start-0 border-end-0 border-bottom-0"
        >
          <div className="course-agent-auto-approve-offer-body">
            <div className="course-agent-auto-approve-offer-content">
              <span>Don't want to approve every request manually?</span>
              <Button
                variant="primary"
                size="sm"
                className="text-nowrap"
                onClick={() => setConfirmingAutoApprove(true)}
              >
                Turn on auto-approve
              </Button>
            </div>
            <CloseButton
              className="flex-shrink-0"
              aria-label="Dismiss"
              onClick={() => setShowAutoApproveOffer(false)}
            />
          </div>
        </Alert>
      )}
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
        approvalMode={approvalMode}
        stopDisabled={!connected || !canStop}
        onApprovalModeChange={changeApprovalMode}
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
      <AutoApproveModal
        show={confirmingAutoApprove}
        onHide={() => setConfirmingAutoApprove(false)}
        onConfirm={() => {
          setConfirmingAutoApprove(false);
          changeApprovalMode('always_approve');
        }}
      />
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
  approvalMode,
  onApprovalModeChange,
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
  approvalMode: EnumCourseAgentApprovalMode;
  onApprovalModeChange: (mode: EnumCourseAgentApprovalMode) => void;
  onAttach: (files: File[]) => void;
  onRemoveAttachment: (key: string) => void;
  stopDisabled?: boolean;
  children?: ReactNode;
  onStop?: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
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
          as="textarea"
          rows={2}
          className="course-agent-composer-input border-0 shadow-none bg-transparent p-0"
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
        <div className="d-flex align-items-center gap-2 mt-2">
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
            className="course-agent-composer-button course-agent-composer-icon-button"
            aria-label="Attach files"
            disabled={pending}
            onClick={() => fileInputRef.current?.click()}
          >
            <i className="bi bi-plus-lg" aria-hidden="true" />
          </Button>
          <ApprovalModePicker mode={approvalMode} onChange={onApprovalModeChange} />
          <div className="d-flex align-items-center gap-2 ms-auto flex-shrink-0">
            {children}
            {onStop ? (
              <Button
                variant="link"
                size="sm"
                className="course-agent-composer-button"
                aria-label="Stop"
                disabled={stopDisabled}
                onClick={onStop}
              >
                <i className="bi bi-stop-fill" aria-hidden="true" />
                <span className="course-agent-composer-wide-only">Stop</span>
              </Button>
            ) : (
              <Button
                type="submit"
                size="sm"
                className="course-agent-composer-button course-agent-composer-icon-button course-agent-composer-send"
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

const APPROVAL_MODES: Record<EnumCourseAgentApprovalMode, { label: string; icon: string }> = {
  approval_required: { label: 'Ask first', icon: 'bi-hand-index-thumb' },
  always_approve: { label: 'Auto-approve', icon: 'bi-shield-exclamation' },
};

function ApprovalModePicker({
  mode,
  onChange,
}: {
  mode: EnumCourseAgentApprovalMode;
  onChange: (mode: EnumCourseAgentApprovalMode) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const current = APPROVAL_MODES[mode];
  return (
    <>
      <Dropdown drop="up" className="course-agent-composer-shrink">
        <Dropdown.Toggle
          variant="link"
          size="sm"
          className={clsx(
            'course-agent-composer-button mw-100',
            mode === 'always_approve' && 'course-agent-approval-warning',
          )}
          aria-label={`Approval mode: ${current.label}`}
        >
          <i className={clsx('bi', current.icon)} aria-hidden="true" />
          <span className="course-agent-composer-wide-only text-truncate">{current.label}</span>
          <i className="bi bi-chevron-down" aria-hidden="true" />
        </Dropdown.Toggle>
        <Dropdown.Menu className="course-agent-approval-menu shadow-sm">
          <Dropdown.Header className="text-wrap">
            Before editing files, reading student data, or taking actions
          </Dropdown.Header>
          {EnumCourseAgentApprovalModeSchema.options.map((option) => {
            const { label, icon } = APPROVAL_MODES[option];
            return (
              <Dropdown.Item
                key={option}
                as="button"
                type="button"
                className={clsx(
                  'd-flex align-items-center gap-2 py-2',
                  option === 'always_approve' && 'course-agent-approval-warning',
                )}
                aria-current={option === mode}
                onClick={() => {
                  if (option === mode) return;
                  if (option === 'always_approve') setConfirming(true);
                  else onChange(option);
                }}
              >
                <i className={clsx('bi fs-5 lh-1', icon)} aria-hidden="true" />
                <span className="flex-grow-1">{label}</span>
                {option === mode && <i className="bi bi-check-lg" aria-hidden="true" />}
              </Dropdown.Item>
            );
          })}
        </Dropdown.Menu>
      </Dropdown>
      <AutoApproveModal
        show={confirming}
        onHide={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          onChange('always_approve');
        }}
      />
    </>
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
  uploadsUrl,
  awaitingReviewId,
  onApprovedOnce,
  onAlwaysApprove,
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
  uploadsUrl: string;
  /** An idle conversation's review whose result the agent has not received. */
  awaitingReviewId: string | null;
  onApprovedOnce: () => void;
  onAlwaysApprove: () => void;
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
        <SentAttachments message={message} uploadsUrl={uploadsUrl} />
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
  // Reviews and input requests end the agent's turn, so their cards go at the end of that turn:
  // before the marker of the turn that continues this message (a review result's delivery), or at
  // the end of the message.
  type Card =
    | ({ kind: 'review' } & ReviewPart)
    | { kind: 'input'; key: string; request: InputRequestPart };
  const renderCard = (card: Card) =>
    card.kind === 'review' ? (
      card.autoApproved ? (
        <AutoApprovedChanges key={`review-${card.reviewId}`} />
      ) : (
        // One key per review, so the card keeps its state when the marker arrives.
        <RequestChangesCard
          key={`review-${card.reviewId}`}
          conversationId={conversationId}
          reviewId={card.reviewId}
          canResume={awaitingReviewId === card.reviewId}
          onApprovedOnce={onApprovedOnce}
          onAlwaysApprove={onAlwaysApprove}
        />
      )
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
  for (const segment of segments) {
    if ('calls' in segment) {
      rendered.push(
        <ToolCalls
          key={segment.key}
          calls={segment.calls}
          live={live}
          onExpand={onToolCallExpand}
        />,
      );
      continue;
    }
    const { key, part } = segment;
    const navigation = navigationOf(part);
    if (part.type === 'text' && part.text.trim()) {
      rendered.push(
        <TextPart
          key={key}
          part={part}
          urlTransform={linkTransform}
          codeBlock={ChatCodeBlock}
          math
        />,
      );
    } else if (part.type === 'reasoning' && part.text.trim()) {
      rendered.push(<ReasoningBlock key={key} part={part} math />);
    } else if (navigation) {
      rendered.push(<NavigationCard key={key} navigation={navigation} />);
    } else if (isReloadPart(part)) {
      rendered.push(<ReloadCard key={key} />);
    } else if (part.type === 'data-review') {
      const { reviewId, autoApproved } = ReviewPartSchema.parse(part.data);
      // An auto-approved review waits for no decision, so its line shows while the review loads.
      if (autoApproved || reviewId !== hiddenReviewId) {
        cards.push({ kind: 'review', reviewId, autoApproved });
      }
    } else if (part.type === 'data-input-request') {
      const request = InputRequestPartSchema.safeParse(part.data).data;
      if (request) cards.push({ kind: 'input', key, request });
    } else if (part.type === 'data-turn') {
      rendered.push(...cards.map(renderCard));
      cards = [];
    }
  }
  rendered.push(...cards.filter((card) => card.kind === 'review' || !turnRunning).map(renderCard));
  // A just-started reply has no visible parts yet and would otherwise add an empty gap.
  if (rendered.length === 0) return null;
  return <div className="d-flex flex-column gap-2">{rendered}</div>;
}
