import { useChat } from '@ai-sdk/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Alert, Button, Form, Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

import { type ChatSnapshot, sendRequestSchema } from '@prairielearn/course-agent-contract';
import { getAppError } from '@prairielearn/trpc/client';
import { AppErrorAlert } from '@prairielearn/trpc/react';

import { useTRPC } from '../../../trpc/course/context.js';
import type { CourseAgentError } from '../../../trpc/course/course-agent.js';
import { ActivityStatus } from '../ai/ActivityStatus.js';

import { SandboxStatistics } from './SandboxStatistics.js';
import { Transcript } from './Transcript.js';
import { mergeSnapshotMessages } from './message-parts.js';
import { readPanelState, savePanelState } from './panelState.js';

export function Conversation({
  courseId,
  id,
  storageKey,
  userName,
  timezone,
  onCreated,
  onSending,
  renderPicker,
  canStartNewWork,
}: {
  courseId: string;
  id: string;
  storageKey: string;
  userName: string;
  timezone: string;
  onCreated: (id: string, title: string) => void;
  onSending: (id: string) => void;
  renderPicker: (startingAgent: boolean) => ReactNode;
  canStartNewWork: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const base = `/pl/course/${courseId}/course-agent/${id}`;
  const [snapshot, setSnapshot] = useState<ChatSnapshot>({ messages: [], operationNumber: 0 });
  const { register, watch, setValue, handleSubmit } = useForm({ defaultValues: { draft: '' } });
  const draft = watch('draft');
  const [statisticsOpen, setStatisticsOpen] = useState(false);
  const [loaded, setLoaded] = useState(!id);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [failure, setFailure] = useState('');
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'disconnected'>(
    id ? 'connecting' : 'connected',
  );
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: base,
        prepareReconnectToStreamRequest: () => ({ api: `${base}/stream` }),
      }),
  );
  const { messages, setMessages, status, resumeStream } = useChat({ id, transport });
  const busy = status === 'streaming' || status === 'submitted';
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const create = useMutation(trpc.courseAgent.create.mutationOptions());
  const createdIdRef = useRef(id);
  const [optimistic, setOptimistic] = useState<UIMessage | null>(null);
  const send = useMutation(trpc.courseAgent.send.mutationOptions());
  const cancel = useMutation(trpc.courseAgent.stop.mutationOptions());
  const cleanup = useMutation(trpc.courseAgent.cleanup.mutationOptions());
  const canSend = canStartNewWork && !snapshot.newWorkUnavailable;
  const working =
    send.isPending ||
    create.isPending ||
    busy ||
    ['starting', 'waiting_for_agent'].includes(snapshot.diagnostics?.state ?? '');
  const startingAgent =
    snapshot.diagnostics?.state === 'starting' ||
    create.isPending ||
    (send.isPending && (!snapshot.diagnostics || snapshot.diagnostics.state === 'absent'));
  const pendingRef = useRef<{ id: string; text: string; expectedOperationNumber: number } | null>(
    null,
  );
  // Stream observation is re-established after navigation; closing it never stops native execution.
  useEffect(() => {
    setValue('draft', readPanelState(storageKey + ':draft'));
    const saved = readPanelState(storageKey + ':pending');
    if (saved) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(saved);
      } catch {
        // A corrupt saved request must not interrupt draft or stream restoration.
      }
      const value = sendRequestSchema.safeParse(parsed);
      if (value.success) {
        pendingRef.current = value.data;
        if (!readPanelState(storageKey + ':draft')) {
          setValue('draft', value.data.text);
          savePanelState(storageKey + ':draft', value.data.text);
        }
      }
    }
    if (!id) return;
    const source = new EventSource(`${base}/events`);
    const connectionError = (event: MessageEvent) => {
      setFailure(JSON.parse(event.data).message);
      setConnection('disconnected');
      source.close();
    };
    source.addEventListener('connection-error', connectionError);
    let lastPhase: string | undefined;
    source.onmessage = (event) => {
      const next = JSON.parse(event.data) as ChatSnapshot;
      if (next.diagnostics?.state !== lastPhase) {
        lastPhase = next.diagnostics?.state;
        void queryClient.invalidateQueries(trpc.courseAgent.list.queryFilter());
      }
      const pending = pendingRef.current;
      if (pending && next.messages.some((message) => message.id === pending.id)) {
        pendingRef.current = null;
        savePanelState(storageKey + ':pending', '');
        if (readPanelState(storageKey + ':draft') === pending.text) {
          setValue('draft', '');
          savePanelState(storageKey + ':draft', '');
        }
        const startupKey = storageKey.replace(/:[^:]+$/, ':new:conversation');
        if (readPanelState(startupKey) === id) savePanelState(startupKey, '');
      }
      setSnapshot((current) => ({
        ...next,
        operationNumber: Math.max(current.operationNumber, next.operationNumber),
      }));
      setLoaded(true);
      setConnection('connected');
      setFailure('');
      if (!busyRef.current) {
        setMessages(next.messages);
        if (['starting', 'waiting_for_agent'].includes(next.diagnostics?.state ?? '')) {
          busyRef.current = true;
          void resumeStream().finally(() => {
            busyRef.current = false;
          });
        }
      }
    };
    source.onerror = () => {
      // EventSource retries transport errors and the server's scheduled five-minute close.
      // Explicit connection-error events above still stop retries on authorization failures.
      if (source.readyState === EventSource.CLOSED) {
        setConnection('disconnected');
        setFailure(
          'The conversation connection closed. Reload the page to check your access, or reconnect.',
        );
      } else {
        setConnection('connecting');
      }
    };
    return () => {
      source.removeEventListener('connection-error', connectionError);
      source.close();
    };
  }, [
    base,
    id,
    storageKey,
    setMessages,
    resumeStream,
    setValue,
    connectionAttempt,
    queryClient,
    trpc,
  ]);

  // Keep incoming output and newly loaded conversations visible at the end of the transcript.
  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript) transcript.scrollTop = transcript.scrollHeight;
  }, [messages, optimistic, loaded, snapshot.messages]);

  async function submit() {
    if (!canSend || !draft.trim() || connection !== 'connected') return;
    const message =
      pendingRef.current?.text === draft
        ? pendingRef.current
        : {
            id: crypto.randomUUID(),
            text: draft,
            expectedOperationNumber: snapshot.operationNumber,
          };
    pendingRef.current = message;
    savePanelState(storageKey + ':pending', JSON.stringify(message));
    setValue('draft', '');
    savePanelState(storageKey + ':draft', '');
    setOptimistic({
      id: message.id,
      role: 'user',
      parts: [{ type: 'text', text: message.text }],
      metadata: { created_at: new Date().toISOString() },
    });
    try {
      const conversationId = createdIdRef.current || (await create.mutateAsync()).id;
      createdIdRef.current = conversationId;
      if (!id) {
        savePanelState(storageKey + ':conversation', conversationId);
        const target = storageKey.replace(/:new$/, `:${conversationId}`);
        savePanelState(target + ':pending', JSON.stringify(message));
        savePanelState(target + ':draft', readPanelState(storageKey + ':draft'));
      }
      onSending(conversationId);
      const result = await send.mutateAsync({ conversationId, message });
      setSnapshot((current) => ({
        ...current,
        operationNumber: Math.max(current.operationNumber, result.operationNumber),
      }));
      pendingRef.current = null;
      savePanelState(storageKey + ':pending', '');
      if (!id) {
        savePanelState(
          storageKey.replace(/:new$/, `:${conversationId}`) + ':draft',
          readPanelState(storageKey + ':draft'),
        );
        savePanelState(storageKey + ':draft', '');
        savePanelState(storageKey + ':conversation', '');
        savePanelState(storageKey.replace(/:new$/, `:${conversationId}`) + ':pending', '');
        onCreated(conversationId, result.title);
      } else if (!busyRef.current) {
        busyRef.current = true;
        void resumeStream().finally(() => {
          busyRef.current = false;
        });
      }
    } catch {
      setOptimistic(null);
      // Restore the failed send only if the user has not started another draft.
      if (!readPanelState(storageKey + ':draft')) {
        setValue('draft', message.text);
        savePanelState(storageKey + ':draft', message.text);
      }
    } finally {
      onSending('');
    }
  }

  const transcriptMessages = mergeSnapshotMessages(snapshot.messages, messages);
  const mutationError = create.error ?? send.error ?? cancel.error ?? cleanup.error;
  return (
    <>
      {renderPicker(startingAgent)}
      {failure && (
        <Alert
          variant="warning"
          className="d-flex align-items-center justify-content-between gap-3"
        >
          <span>{failure}</span>
          <Button
            size="sm"
            className="flex-shrink-0"
            onClick={() => {
              setConnection('connecting');
              setConnectionAttempt((value) => value + 1);
            }}
          >
            Reconnect
          </Button>
        </Alert>
      )}
      <AppErrorAlert
        error={getAppError<CourseAgentError['Create' | 'Send' | 'Stop' | 'Cleanup']>(mutationError)}
        render={{ UNKNOWN: ({ message }) => message }}
      />
      {snapshot.diagnostics?.cleanup?.error && (
        <Alert
          variant="warning"
          className="d-flex align-items-center justify-content-between gap-3"
        >
          <span>We couldn’t finish cleaning up the workspace.</span>
          <Button
            size="sm"
            className="flex-shrink-0"
            disabled={cleanup.isPending}
            onClick={() => cleanup.mutate({ conversationId: id })}
          >
            Retry cleanup
          </Button>
        </Alert>
      )}
      {snapshot.diagnostics?.checkpointError && (
        <Alert variant="warning">
          We couldn’t save the latest file changes. Some changes may be lost if the workspace
          restarts.
        </Alert>
      )}
      <div ref={transcriptRef} className="flex-grow-1 overflow-auto course-agent-transcript">
        {!loaded && (
          <div className="d-flex justify-content-center align-items-center h-100" role="status">
            <span className="spinner-border text-secondary" />
            <span className="visually-hidden">Loading conversation</span>
          </div>
        )}
        {loaded && messages.length === 0 && !optimistic && (
          <div className="course-agent-empty text-center text-muted py-5 px-3">
            <i className="bi bi-stars fs-1 text-primary" aria-hidden="true" />
            <h3 className="h5 mt-3 text-body">What would you like to work on?</h3>
            <p>Set up your course, improve a question, or build an assessment.</p>
          </div>
        )}
        {loaded && (
          <Transcript
            userName={userName}
            timezone={timezone}
            messages={
              optimistic && !transcriptMessages.some((m) => m.id === optimistic.id)
                ? [...transcriptMessages, optimistic]
                : transcriptMessages
            }
          />
        )}
        <div role="status" aria-live="polite" className="px-3 pb-3">
          {working && (
            <ActivityStatus
              state="streaming"
              statusText={startingAgent ? 'Starting agent…' : 'Working…'}
            />
          )}
        </div>
      </div>
      <Modal
        show={statisticsOpen}
        aria-labelledby="course-agent-statistics-title"
        onHide={() => setStatisticsOpen(false)}
      >
        <Modal.Header closeButton>
          <Modal.Title as="h2" id="course-agent-statistics-title">
            Conversation statistics
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {statisticsOpen && (
            <SandboxStatistics
              diagnostics={snapshot.diagnostics}
              timezone={timezone}
              newConversation={!id}
            />
          )}
        </Modal.Body>
      </Modal>
      <Form className="course-agent-composer pt-3 mt-2" onSubmit={handleSubmit(submit)}>
        {(!canSend || connection !== 'connected') && (
          <p id={`course-agent-send-reason-${id}`} className="small text-muted" role="status">
            {snapshot.newWorkUnavailable ??
              (!canStartNewWork
                ? 'New messages are disabled. Saved conversations and recovery remain available.'
                : 'Connecting to conversation…')}
          </p>
        )}
        <Form.Control
          id={`course-agent-input-${id}`}
          aria-label="Message"
          placeholder="Ask anything about your course…"
          as="textarea"
          rows={3}
          defaultValue=""
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (!send.isPending && !create.isPending) void handleSubmit(submit)();
            }
          }}
          {...register('draft', {
            onChange: (event) => {
              savePanelState(storageKey + ':draft', event.target.value);
              if (!id && createdIdRef.current) {
                savePanelState(
                  storageKey.replace(/:new$/, `:${createdIdRef.current}`) + ':draft',
                  event.target.value,
                );
              }
              if (pendingRef.current && pendingRef.current.text !== event.target.value) {
                pendingRef.current = null;
                savePanelState(storageKey + ':pending', '');
              }
            },
          })}
        />
        <div className="d-flex gap-2 mt-2">
          <Button
            className="course-agent-action"
            variant="outline-secondary"
            aria-label="Statistics"
            title="Statistics"
            onClick={() => setStatisticsOpen(true)}
          >
            <i className="bi bi-bar-chart" aria-hidden="true" />
          </Button>
          {working && !draft.trim() ? (
            <Button
              type="button"
              className="course-agent-action ms-auto"
              variant="primary"
              aria-label="Stop"
              title="Stop"
              disabled={
                cancel.isPending || create.isPending || send.isPending || !createdIdRef.current
              }
              onClick={() => cancel.mutate({ conversationId: createdIdRef.current })}
            >
              <i className="bi bi-stop-fill" aria-hidden="true" />
            </Button>
          ) : (
            <Button
              type="submit"
              aria-label="Send"
              className="course-agent-action ms-auto"
              disabled={
                connection !== 'connected' ||
                !canSend ||
                !draft.trim() ||
                send.isPending ||
                create.isPending
              }
            >
              <i className="bi bi-send-fill" aria-hidden="true" />
            </Button>
          )}
        </div>
      </Form>
    </>
  );
}
