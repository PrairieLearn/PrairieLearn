/* eslint-disable @eslint-react/no-array-index-key -- Text segments and immutable diff lines keep their order within a message. */
import { useChat } from '@ai-sdk/react';
import { QueryClient, useMutation, useQuery } from '@tanstack/react-query';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Alert, Button, Form, Modal, Offcanvas } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

import {
  type ApprovalDisplay,
  type ChatSnapshot,
  sendRequestSchema,
} from '@prairielearn/course-agent-contract';
import { getAppError } from '@prairielearn/trpc/client';
import { AppErrorAlert, QueryClientProviderDebug } from '@prairielearn/trpc/react';

import { createCourseTrpcClient } from '../../../trpc/course/client.js';
import { TRPCProvider, useTRPC } from '../../../trpc/course/context.js';
import { ChatMessage } from '../ai/ChatMessage.js';
import { MemoizedMarkdown } from '../ai/MemoizedMarkdown.js';
import { ReasoningSummary } from '../ai/ReasoningSummary.js';
import { ToolCall } from '../ai/ToolCall.js';
import { ToolCallGroup } from '../ai/ToolCallGroup.js';

import { buildTranscript } from './message-parts.js';
import { readPanelState, savePanelState, usePanelState } from './panelState.js';

export function CourseAgentPanel({
  courseId,
  userId,
  csrfToken,
}: {
  courseId: string;
  userId: string;
  csrfToken: string;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const [client] = useState(() => createCourseTrpcClient({ courseId, csrfToken }));
  return (
    <QueryClientProviderDebug client={queryClient}>
      <TRPCProvider trpcClient={client} queryClient={queryClient}>
        <Panel courseId={courseId} userId={userId} />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

function Panel({ courseId, userId }: { courseId: string; userId: string }) {
  const trpc = useTRPC();
  const key = `course-agent:${userId}:${courseId}`;
  const open = usePanelState(key + ':open') === 'true';
  const setOpen = (value: boolean) => savePanelState(key + ':open', String(value));
  const selected = usePanelState(key + ':selected');
  const setSelected = (value: string) => savePanelState(key + ':selected', value);
  const conversations = useQuery(trpc.courseAgent.list.queryOptions());
  const create = useMutation(
    trpc.courseAgent.create.mutationOptions({
      onSuccess: async (row) => {
        setSelected(row.id);
        savePanelState(key + ':selected', row.id);
        await conversations.refetch();
      },
    }),
  );

  function toggle(value: boolean) {
    setOpen(value);
    savePanelState(key + ':open', String(value));
  }
  // The global navbar can wrap at narrower widths; keep the panel below its actual bottom edge.
  useEffect(() => {
    const navbar = document.querySelector('.app-top-nav');
    if (!navbar) return;
    const updateTop = () =>
      document.documentElement.style.setProperty(
        '--course-agent-top',
        `${navbar.getBoundingClientRect().bottom}px`,
      );
    const observer = new ResizeObserver(updateTop);
    observer.observe(navbar);
    updateTop();
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty('--course-agent-top');
    };
  }, []);
  const current = conversations.data?.find((c) => c.id === selected);
  const valid = !!current;
  return (
    <>
      <Button
        hidden={open}
        title="Open course agent"
        className="course-agent-toggle"
        variant="primary"
        aria-label="Open course agent"
        onClick={() => toggle(true)}
      >
        <i className="bi bi-stars" /> <span className="visually-hidden">Course agent</span>
      </Button>
      <Offcanvas
        show={open}
        placement="end"
        backdrop={false}
        className="course-agent-panel"
        scroll
        onHide={() => toggle(false)}
      >
        <Offcanvas.Header className="border-bottom" closeButton>
          <Offcanvas.Title>Course agent</Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body className="d-flex flex-column p-3 overflow-hidden">
          <div className="d-flex gap-2 mb-3 course-agent-picker">
            <Form.Select
              aria-label="Conversation"
              value={valid ? selected : ''}
              onChange={(event) => {
                setSelected(event.target.value);
                savePanelState(key + ':selected', event.target.value);
              }}
            >
              <option value="">Choose a conversation</option>
              {conversations.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </Form.Select>
            <Button
              variant="outline-primary"
              disabled={create.isPending}
              onClick={() => create.mutate()}
            >
              New
            </Button>
          </div>
          <AppErrorAlert
            error={getAppError<never>(conversations.error ?? create.error)}
            render={{ UNKNOWN: ({ message }) => message }}
          />
          {valid ? (
            <Conversation
              key={selected}
              courseId={courseId}
              id={selected}
              storageKey={`${key}:${selected}`}
            />
          ) : (
            <p>Choose or create a conversation to edit your course.</p>
          )}
        </Offcanvas.Body>
      </Offcanvas>
    </>
  );
}

function Conversation({
  courseId,
  id,
  storageKey,
}: {
  courseId: string;
  id: string;
  storageKey: string;
}) {
  const trpc = useTRPC();
  const base = `/pl/course/${courseId}/course-agent/${id}`;
  const [snapshot, setSnapshot] = useState<ChatSnapshot>({ messages: [], revision: 0 });
  const { register, watch, setValue, handleSubmit } = useForm({ defaultValues: { draft: '' } });
  const draft = watch('draft');
  const [statisticsOpen, setStatisticsOpen] = useState(false);
  const [failure, setFailure] = useState('');
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'disconnected'>(
    'connecting',
  );
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: base,
        prepareReconnectToStreamRequest: () => ({ api: `${base}/stream` }),
      }),
  );
  const { messages, setMessages, status, resumeStream, stop } = useChat({ id, transport });
  const busy = status === 'streaming' || status === 'submitted';
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const send = useMutation(trpc.courseAgent.send.mutationOptions());
  const cancel = useMutation(trpc.courseAgent.stop.mutationOptions());
  const cleanup = useMutation(trpc.courseAgent.cleanup.mutationOptions());
  const decision = useMutation(trpc.courseAgent.decide.mutationOptions());
  const prepare = useMutation(trpc.courseAgent.prepare.mutationOptions());
  const pendingRef = useRef<{ id: string; text: string; expectedRevision: number } | null>(null);
  // Stream observation is re-established after navigation; closing it never stops native execution.
  useEffect(() => {
    setValue('draft', readPanelState(storageKey + ':draft'));
    const saved = readPanelState(storageKey + ':pending');
    if (saved) {
      const value = sendRequestSchema.safeParse(JSON.parse(saved));
      if (value.success) pendingRef.current = value.data;
    }
    const source = new EventSource(`${base}/events`);
    const connectionError = (event: MessageEvent) => {
      setFailure(JSON.parse(event.data).message);
      setConnection('disconnected');
      source.close();
    };
    source.addEventListener('connection-error', connectionError);
    source.onmessage = (event) => {
      const next = JSON.parse(event.data) as ChatSnapshot;
      setSnapshot(next);
      setConnection('connected');
      setFailure('');
      if (!busyRef.current) {
        setMessages(next.messages);
        if (
          !next.blocked &&
          ['starting', 'waiting_for_agent'].includes(next.diagnostics?.state ?? '')
        ) {
          busyRef.current = true;
          void resumeStream().finally(() => {
            busyRef.current = false;
          });
        }
      }
    };
    source.onerror = () => {
      setConnection('connecting');
      setFailure('Connection interrupted. Reconnecting; your draft is preserved.');
    };
    return () => {
      source.removeEventListener('connection-error', connectionError);
      source.close();
    };
  }, [base, storageKey, setMessages, resumeStream, setValue, connectionAttempt]);

  async function submit() {
    if (!draft.trim() || snapshot.blocked || connection !== 'connected') return;
    const message =
      pendingRef.current?.text === draft
        ? pendingRef.current
        : { id: crypto.randomUUID(), text: draft, expectedRevision: snapshot.revision };
    pendingRef.current = message;
    savePanelState(storageKey + ':pending', JSON.stringify(message));
    try {
      await send.mutateAsync({ conversationId: id, message });
      pendingRef.current = null;
      savePanelState(storageKey + ':pending', '');
      setValue('draft', '');
      savePanelState(storageKey + ':draft', '');
      await stop();
      void resumeStream();
    } catch {
      /* The mutation alert retains the draft and the original request identity. */
    }
  }

  function decide(approval: ApprovalDisplay, approved: boolean) {
    decision.mutate({
      conversationId: id,
      decision: {
        id: approval.id,
        digest: approval.digest,
        expectedRevision: snapshot.revision,
        approved,
      },
    });
  }
  const mutationError =
    send.error ?? cancel.error ?? decision.error ?? prepare.error ?? cleanup.error;
  return (
    <>
      {failure && (
        <Alert variant="warning">
          {failure}{' '}
          <Button
            variant="link"
            onClick={() => {
              setConnection('connecting');
              setConnectionAttempt((value) => value + 1);
            }}
          >
            Retry connection
          </Button>
        </Alert>
      )}
      <AppErrorAlert
        error={getAppError<never>(mutationError)}
        render={{ UNKNOWN: ({ message }) => message }}
      />
      {(snapshot.diagnostics?.cleanup?.error || snapshot.diagnostics?.checkpointError) && (
        <Alert variant="warning">
          {snapshot.diagnostics.cleanup?.error ?? snapshot.diagnostics.checkpointError}
          {snapshot.diagnostics.cleanup?.error && (
            <Button variant="link" onClick={() => cleanup.mutate({ conversationId: id })}>
              Retry cleanup
            </Button>
          )}
        </Alert>
      )}
      <div className="flex-grow-1 overflow-auto course-agent-transcript">
        <Transcript
          messages={messages}
          approvals={snapshot.approvals ?? []}
          renderCodeChange={(approval) => (
            <section className="card mb-3">
              <div className="card-body">
                <strong>
                  {approval.status === 'pending'
                    ? 'Code change · Review requested'
                    : approval.status === 'approved'
                      ? 'Code change · Approved'
                      : 'Code change · Rejected'}
                </strong>
                <details>
                  <summary>Review exact changes</summary>
                  <pre className="course-agent-diff">
                    {approval.diff.split('\n').map((line, index) => (
                      <span
                        key={`${index}:${line}`}
                        className={
                          line.startsWith('+')
                            ? 'bg-success-subtle'
                            : line.startsWith('-')
                              ? 'bg-danger-subtle'
                              : ''
                        }
                      >
                        {line}
                        {'\n'}
                      </span>
                    ))}
                  </pre>
                </details>
                {approval.result && <p>{approval.result}</p>}
                {snapshot.approval?.id === approval.id && (
                  <>
                    <p className="text-danger">{snapshot.publication?.error}</p>
                    {approval.status === 'approved' && (
                      <dl className="small">
                        <dt>GitHub publication</dt>
                        <dd>
                          {snapshot.publication?.publishedSha ? (
                            <code>{snapshot.publication.publishedSha.slice(0, 12)}</code>
                          ) : (
                            'Not confirmed'
                          )}
                        </dd>
                        <dt>Course Sync</dt>
                        <dd>
                          {snapshot.publication?.syncedSha ? (
                            <code>{snapshot.publication.syncedSha.slice(0, 12)}</code>
                          ) : snapshot.publication?.syncJobSequenceId ? (
                            <a
                              href={`/pl/course/${courseId}/jobSequence/${snapshot.publication.syncJobSequenceId}`}
                            >
                              View Course Sync log
                            </a>
                          ) : (
                            'Not started'
                          )}
                        </dd>
                      </dl>
                    )}
                    {approval.status === 'pending' ? (
                      <>
                        <Button
                          disabled={
                            decision.isPending || snapshot.publication?.status === 'invalid'
                          }
                          onClick={() => decide(approval, true)}
                        >
                          Approve and sync
                        </Button>{' '}
                        <Button
                          variant="outline-secondary"
                          disabled={decision.isPending}
                          onClick={() => decide(approval, false)}
                        >
                          Reject
                        </Button>
                        {snapshot.publication?.status === 'invalid' && (
                          <Button
                            variant="link"
                            onClick={() =>
                              prepare.mutate({ conversationId: id, operationId: approval.id })
                            }
                          >
                            Retry preparation
                          </Button>
                        )}
                      </>
                    ) : (
                      snapshot.blocked && (
                        <Button
                          disabled={decision.isPending}
                          onClick={() => decide(approval, approval.status === 'approved')}
                        >
                          Retry completion
                        </Button>
                      )
                    )}
                  </>
                )}
              </div>
            </section>
          )}
        />
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
          <dl>
            <dt>Estimated cost</dt>
            <dd>
              {snapshot.usage?.estimatedCost == null
                ? 'Unknown'
                : `$${snapshot.usage.estimatedCost.toFixed(4)}`}
            </dd>
            <dt>Input tokens</dt>
            <dd>{snapshot.usage?.input ?? 'Unknown'}</dd>
            <dt>Output tokens</dt>
            <dd>{snapshot.usage?.output ?? 'Unknown'}</dd>
          </dl>
        </Modal.Body>
      </Modal>
      <Form className="course-agent-composer border-top pt-3 mt-2" onSubmit={handleSubmit(submit)}>
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
              if (!send.isPending) void handleSubmit(submit)();
            }
          }}
          {...register('draft', {
            onChange: (event) => {
              savePanelState(storageKey + ':draft', event.target.value);
              if (pendingRef.current && pendingRef.current.text !== event.target.value) {
                pendingRef.current = null;
                savePanelState(storageKey + ':pending', '');
              }
            },
          })}
        />
        <div className="d-flex gap-2 mt-2">
          <Button size="sm" variant="outline-secondary" onClick={() => setStatisticsOpen(true)}>
            <i className="bi bi-bar-chart me-1" aria-hidden="true" />
            Statistics
          </Button>
          {busy && (
            <Button
              variant="outline-secondary"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate({ conversationId: id })}
            >
              Stop
            </Button>
          )}
          <Button
            type="submit"
            className="ms-auto"
            disabled={
              connection !== 'connected' || snapshot.blocked || send.isPending || !draft.trim()
            }
          >
            {busy ? 'Steer' : 'Send'}
          </Button>
        </div>
      </Form>
    </>
  );
}

function Transcript({
  messages,
  approvals,
  renderCodeChange,
}: {
  messages: UIMessage[];
  approvals: ApprovalDisplay[];
  renderCodeChange: (approval: ApprovalDisplay) => ReactNode;
}) {
  return buildTranscript(messages, approvals).map((entry) => (
    <ChatMessage key={entry.id} messageRole={entry.role}>
      {entry.parts.map((part, index) => {
        if (part.kind === 'code-change') {
          return <div key={part.approval.id}>{renderCodeChange(part.approval)}</div>;
        }
        if (part.kind === 'tools') {
          return (
            <ToolCallGroup key={index} count={part.parts.length}>
              {part.parts.map((tool) => (
                <ToolCall
                  key={'toolCallId' in tool ? String(tool.toolCallId) : index}
                  title={
                    'toolName' in tool ? String(tool.toolName).replaceAll('_', ' ') : tool.type
                  }
                  state={
                    'state' in tool && tool.state === 'output-error'
                      ? 'error'
                      : 'state' in tool && tool.state === 'output-available'
                        ? 'success'
                        : 'streaming'
                  }
                >
                  <pre>{toolDetails(tool)}</pre>
                </ToolCall>
              ))}
            </ToolCallGroup>
          );
        }
        const value = part.part;
        if (value.type === 'text') return <MemoizedMarkdown key={index} content={value.text} />;
        if (value.type === 'reasoning') return <ReasoningSummary key={index} text={value.text} />;
        if (
          value.type === 'data-steering' &&
          value.data &&
          typeof value.data === 'object' &&
          'text' in value.data
        ) {
          return <blockquote key={index}>{String(value.data.text)}</blockquote>;
        }
        return null;
      })}
    </ChatMessage>
  ));
}

function toolDetails(part: UIMessage['parts'][number]) {
  const input = 'input' in part ? part.input : undefined;
  const output = 'output' in part ? part.output : undefined;
  if (input && typeof input === 'object' && 'command' in input) {
    const text = output && typeof output === 'object' && 'output' in output ? output.output : '';
    return `${String(input.command)}\n${String(text ?? '')}`;
  }
  if ('errorText' in part) return String(part.errorText);
  return JSON.stringify(output ?? input, null, 2);
}

CourseAgentPanel.displayName = 'CourseAgentPanel';
