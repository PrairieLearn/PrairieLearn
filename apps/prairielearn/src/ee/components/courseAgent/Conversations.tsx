import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type KeyboardEvent,
  type SyntheticEvent,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import { Alert, Button, Dropdown, Form, Spinner } from 'react-bootstrap';
import { useStickToBottom } from 'use-stick-to-bottom';

import { type Message, type Summary } from '@prairielearn/course-agent-protocol';
import { run } from '@prairielearn/run';
import { getAppError } from '@prairielearn/trpc/client';
import { AppErrorAlert } from '@prairielearn/trpc/react';
import { OverlayTrigger } from '@prairielearn/ui';

import { useTRPC } from '../../../trpc/course/context.js';
import type { CourseAgentError } from '../../../trpc/course/course-agent.js';
import { ReasoningBlock, TextPart } from '../ai/ChatParts.js';

import { useConversationActivity, useConversationObservation } from './observation.js';
import { readPreferences, usePreferences, writePreferences } from './preferences.js';

function subscribeVisibility(notify: () => void) {
  document.addEventListener('visibilitychange', notify);
  return () => document.removeEventListener('visibilitychange', notify);
}

function pageIsVisible() {
  return document.visibilityState === 'visible';
}

export function Conversations({
  courseId,
  userId,
  active,
}: {
  courseId: string;
  userId: string;
  active: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const preferenceKey = `pl:course-agent:${userId}:${courseId}`;
  const pageVisible = useSyncExternalStore(subscribeVisibility, pageIsVisible, () => false);
  const observing = active && pageVisible;
  const conversations = useQuery(trpc.courseAgent.list.queryOptions());
  const [pickedId, setPickedId] = useState(() => readPreferences(preferenceKey).selectedId);
  const { read } = usePreferences(preferenceKey);
  const [pickedPage, setPickedPage] = useState<number | null>(null);
  const selectedId = run(() => {
    if (!conversations.data) return null;
    if (pickedId !== null) {
      const selected = conversations.data.find((conversation) => conversation.id === pickedId);
      if (selected) return selected.id;
    }
    if (conversations.data.length > 0) return conversations.data[0].id;
    return null;
  });
  const selectedConversation = conversations.data?.find(
    (conversation) => conversation.id === selectedId,
  );
  const page = run(() => {
    if (pickedPage !== null) return pickedPage;
    const index =
      conversations.data?.findIndex((conversation) => conversation.id === selectedId) ?? 0;
    return Math.floor(Math.max(0, index) / 50);
  });
  const visibleConversations = conversations.data?.slice(page * 50, (page + 1) * 50) ?? [];
  const summaries = useConversationActivity(
    courseId,
    visibleConversations.map((conversation) => conversation.id),
    observing,
  );
  const observation = useConversationObservation(
    courseId,
    selectedId ?? '',
    observing && selectedId !== null,
  );
  const snapshot = observation.view.snapshot;
  const latestMessageId = snapshot?.summary.latestAssistantMessageId;
  const latestIsDisplayed =
    snapshot?.messages.some((message) => message.id === latestMessageId) ?? false;
  // A completion is read only after its message was rendered in the selected,
  // visible panel. A hidden panel or a partial response cannot clear unread.
  useEffect(() => {
    if (!observing || !selectedId || !latestMessageId || !latestIsDisplayed) return;
    const previous = readPreferences(preferenceKey).read;
    if (previous[selectedId] === latestMessageId) return;
    const next = { ...previous, [selectedId]: latestMessageId };
    writePreferences(preferenceKey, { read: next });
  }, [observing, selectedId, latestMessageId, latestIsDisplayed, preferenceKey]);

  const select = (id: string) => {
    setPickedId(id);
    setPickedPage(null);
    writePreferences(preferenceKey, { selectedId: id });
  };
  const create = useMutation({
    ...trpc.courseAgent.create.mutationOptions(),
    retry: false,
    onSuccess: async (conversation) => {
      await queryClient.invalidateQueries({ queryKey: trpc.courseAgent.list.queryKey() });
      select(conversation.id);
    },
  });
  const createError = getAppError<CourseAgentError['Create']>(create.error);
  const listError = getAppError<CourseAgentError['List']>(conversations.error);
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
            {visibleConversations.map((conversation) => {
              const summary =
                conversation.id === selectedId && snapshot
                  ? snapshot.summary
                  : summaries[conversation.id];
              return (
                <Dropdown.Item
                  key={conversation.id}
                  as="button"
                  active={conversation.id === selectedId}
                  className="d-flex align-items-center gap-2"
                  onClick={() => select(conversation.id)}
                >
                  <span className="text-truncate flex-grow-1">{conversation.title}</span>
                  <Activity summary={summary} readId={read[conversation.id]} />
                </Dropdown.Item>
              );
            })}
            {(page > 0 || (conversations.data?.length ?? 0) > (page + 1) * 50) && (
              <>
                <Dropdown.Divider />
                <div className="d-flex justify-content-between px-2">
                  <Button
                    size="sm"
                    variant="link"
                    disabled={page === 0}
                    onClick={() => setPickedPage(page - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="link"
                    disabled={(conversations.data?.length ?? 0) <= (page + 1) * 50}
                    onClick={() => setPickedPage(page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </>
            )}
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
            disabled={!conversations.isSuccess || create.isPending}
            onClick={() => create.mutate()}
          >
            <i className="bi bi-plus-lg" aria-hidden="true" />
          </Button>
        </OverlayTrigger>
      </div>
      <AppErrorAlert
        error={createError ?? listError}
        className="m-3"
        render={{ UNKNOWN: ({ message }) => message }}
      />
      {conversations.isPending ? (
        <Loading />
      ) : selectedId ? (
        <Chat
          key={selectedId}
          conversationId={selectedId}
          preferenceKey={preferenceKey}
          observation={observation}
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

function Activity({ summary, readId }: { summary?: Summary; readId?: string }) {
  if (!summary) return null;
  return (
    <>
      {['starting', 'waiting_for_agent'].includes(summary.status) && (
        <Spinner size="sm" animation="border" role="status">
          <span className="visually-hidden">Generating reply</span>
        </Spinner>
      )}
      {summary.status === 'stopping' && (
        <i className="bi bi-stop-circle" role="img" aria-label="Stopping reply" />
      )}
      {summary.status === 'blocked' && (
        <i
          className="bi bi-exclamation-circle"
          role="img"
          aria-label="Conversation needs attention"
        />
      )}
      {summary.latestAssistantMessageId && summary.latestAssistantMessageId !== readId && (
        <i className="bi bi-circle-fill small" role="img" aria-label="Unread reply" />
      )}
    </>
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
  conversationId,
  preferenceKey,
  observation,
}: {
  conversationId: string;
  preferenceKey: string;
  observation: ReturnType<typeof useConversationObservation>;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { view, dispatch, reconnect } = observation;
  const [draft, setDraft] = useState(
    () => readPreferences(preferenceKey).drafts[conversationId] ?? '',
  );
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [historyError, setHistoryError] = useState<unknown>(null);
  const stickToBottom = useStickToBottom({ initial: 'instant', resize: 'smooth' });
  const updateDraft = (text: string) => {
    setDraft(text);
    writePreferences(preferenceKey, {
      drafts: { ...readPreferences(preferenceKey).drafts, [conversationId]: text },
    });
  };
  const send = useMutation({
    ...trpc.courseAgent.send.mutationOptions(),
    retry: false,
    onSuccess: () => {
      updateDraft('');
      void queryClient.invalidateQueries({ queryKey: trpc.courseAgent.list.queryKey() });
    },
    onError: reconnect,
  });
  const stop = useMutation({
    ...trpc.courseAgent.stop.mutationOptions(),
    retry: false,
    onError: reconnect,
  });
  const resume = useMutation({
    ...trpc.courseAgent.resume.mutationOptions(),
    retry: false,
    onError: reconnect,
  });
  const historyAppError = getAppError<CourseAgentError['Get']>(historyError);
  const sendError = getAppError<CourseAgentError['Send']>(send.error);
  const stopError = getAppError<CourseAgentError['Stop']>(stop.error);
  const resumeError = getAppError<CourseAgentError['Resume']>(resume.error);
  const snapshot = view.snapshot;
  const summary = snapshot?.summary;
  const messages = snapshot?.messages ?? [];
  const isBusy =
    !!summary && ['starting', 'waiting_for_agent', 'stopping'].includes(summary.status);
  // Show loading while work is active and no visible output has arrived.
  // When a turn finishes or fails, isBusy is false, so isLoading is false.
  const isLoading = run(() => {
    if (!isBusy) return false;
    const lastMessage = messages.at(-1);
    if (lastMessage?.role !== 'assistant') return true;
    return !lastMessage.parts.some((part) => part.text.trim());
  });
  const canSend = view.connected && summary?.capabilities.send && !send.isPending;
  const submit = (event?: SyntheticEvent) => {
    event?.preventDefault();
    if (!draft.trim() || !canSend) return;
    send.mutate({ conversationId, text: draft.trim() });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) submit(event);
  };
  const loadOlder = async () => {
    const before = messages[0]?.id;
    if (!before) return;
    setLoadingOlder(true);
    setHistoryError(null);
    try {
      const data = await queryClient.query(
        trpc.courseAgent.get.queryOptions({ conversationId, before }),
      );
      dispatch({ type: 'older', data });
    } catch (err) {
      setHistoryError(err);
    } finally {
      setLoadingOlder(false);
    }
  };
  return (
    <div className="d-flex flex-column flex-grow-1 overflow-hidden">
      <div ref={stickToBottom.scrollRef} className="flex-grow-1 overflow-y-auto">
        <div ref={stickToBottom.contentRef} className="d-flex flex-column gap-3 p-3">
          {snapshot?.hasMore && (
            <Button
              variant="link"
              size="sm"
              disabled={loadingOlder}
              onClick={() => void loadOlder()}
            >
              Load older messages
            </Button>
          )}
          {messages.map((message) => (
            <MessageView key={message.id} message={message} />
          ))}
          {!view.connected && (
            <div className="text-muted small" role="status">
              <Spinner size="sm" animation="border" className="me-2" />
              Connecting…
            </div>
          )}
          {send.isPending && !isBusy && (
            <div className="text-muted small" role="status">
              Sending…
            </div>
          )}
          {view.connected && isLoading && (
            <div className="text-muted small" role="status">
              <Spinner size="sm" animation="border" className="me-2" />
              Thinking…
            </div>
          )}
          {view.connected && messages.length === 0 && !isBusy && (
            <p className="text-muted text-center my-4">
              Ask the course agent about your course or about PrairieLearn.
            </p>
          )}
          {summary?.error && (
            <Alert variant="warning">
              {summary.error}
              {summary.capabilities.resume && (
                <Button
                  variant="link"
                  size="sm"
                  disabled={!view.connected || resume.isPending}
                  onClick={() => resume.mutate({ conversationId })}
                >
                  Resume conversation
                </Button>
              )}
            </Alert>
          )}
          <AppErrorAlert
            error={sendError ?? stopError ?? resumeError ?? historyAppError}
            render={{ UNKNOWN: ({ message }) => message }}
          />
        </div>
      </div>
      <Form className="border-top p-3" onSubmit={submit}>
        <Form.Control
          as="textarea"
          rows={3}
          value={draft}
          placeholder="Ask the course agent…"
          aria-label="Message"
          onChange={(event) => updateDraft(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="d-flex justify-content-end mt-2">
          {isBusy ? (
            <Button
              variant="outline-secondary"
              size="sm"
              disabled={
                !view.connected ||
                !summary.capabilities.stop ||
                stop.isPending ||
                summary.status === 'stopping'
              }
              onClick={() => {
                if (summary.activeTurnId) {
                  stop.mutate({ conversationId, turnId: summary.activeTurnId });
                }
              }}
            >
              <i className="bi bi-stop-fill me-1" aria-hidden="true" />
              Stop
            </Button>
          ) : (
            <Button type="submit" size="sm" aria-label="Send" disabled={!draft.trim() || !canSend}>
              <i className="bi bi-send" aria-hidden="true" />
            </Button>
          )}
        </div>
      </Form>
    </div>
  );
}

function MessageView({ message }: { message: Message }) {
  if (message.role === 'user') {
    return (
      <div className="align-self-end course-agent-user-message bg-body-secondary rounded-3 px-3 py-2">
        {message.parts.map((part) => part.text).join('')}
      </div>
    );
  }
  return (
    <div className="d-flex flex-column gap-2">
      {message.parts.map((part, index) => {
        const key = `part-${index}`;
        if (part.type === 'text') return <TextPart key={key} part={{ ...part, type: 'text' }} />;
        return <ReasoningBlock key={key} part={{ ...part, type: 'reasoning' }} />;
      })}
    </div>
  );
}
