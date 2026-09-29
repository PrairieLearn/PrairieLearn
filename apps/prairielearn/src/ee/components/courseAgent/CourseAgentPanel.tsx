/* eslint-disable @eslint-react/no-array-index-key -- Text segments and immutable diff lines keep their order within a message. */
import { useChat } from '@ai-sdk/react';
import { QueryClient, useMutation, useQuery } from '@tanstack/react-query';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useEffect, useRef, useState } from 'react';
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

import { isVisibleMessage } from './message-parts.js';
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
  const [renaming, setRenaming] = useState(false);
  const conversations = useQuery(trpc.courseAgent.list.queryOptions());
  const edit = useMutation(
    trpc.courseAgent.edit.mutationOptions({
      onSuccess: async () => {
        setRenaming(false);
        await conversations.refetch();
      },
    }),
  );
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
        <Offcanvas.Header closeButton>
          <Offcanvas.Title>Course agent</Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body className="d-flex flex-column p-3 overflow-hidden">
          <div className="d-flex gap-2 mb-3">
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
              onClick={() => create.mutate({ title: 'New conversation' })}
            >
              New
            </Button>
          </div>
          {current && (
            <div className="d-flex gap-2 mb-2">
              <Button size="sm" variant="link" onClick={() => setRenaming(true)}>
                Rename
              </Button>
              <Button
                size="sm"
                variant="link"
                disabled={edit.isPending}
                onClick={() =>
                  edit.mutate({ conversationId: selected, title: null, archive: true })
                }
              >
                Archive
              </Button>
            </div>
          )}
          {renaming && current && (
            <RenameConversation
              title={current.title}
              busy={edit.isPending}
              onHide={() => setRenaming(false)}
              onSave={(title) => edit.mutate({ conversationId: selected, title, archive: false })}
            />
          )}
          <AppErrorAlert
            error={getAppError<never>(conversations.error ?? create.error ?? edit.error)}
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
  const [failure, setFailure] = useState('');
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
    source.onmessage = (event) => {
      const next = JSON.parse(event.data) as ChatSnapshot;
      setSnapshot(next);
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
    source.onopen = () => setFailure('');
    source.onerror = () =>
      setFailure('Connection interrupted. Reconnecting; your draft is preserved.');
    return () => source.close();
  }, [base, storageKey, setMessages, resumeStream, setValue]);

  async function submit() {
    if (!draft.trim() || snapshot.blocked) return;
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
      <div className="small text-muted mb-2" role="status">
        {snapshot.blocked ? 'Waiting for tool outcome' : busy ? 'Working…' : 'Ready'}
        {snapshot.diagnostics && ` · ${snapshot.diagnostics.state.replaceAll('_', ' ')}`}
      </div>
      {failure && <Alert variant="warning">{failure}</Alert>}
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
        <Transcript messages={messages} />
        {snapshot.approvals?.map((approval) => (
          <section key={approval.id} className="card mb-3">
            <div className="card-body">
              <strong>
                {approval.status === 'pending'
                  ? 'Approval required'
                  : `Approval ${approval.status}`}
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
                          'Pending or failed — see completion status'
                        ) : (
                          'Not started'
                        )}
                      </dd>
                    </dl>
                  )}
                  {approval.status === 'pending' ? (
                    <>
                      <Button
                        disabled={decision.isPending || snapshot.publication?.status === 'invalid'}
                        onClick={() => decide(approval, true)}
                      >
                        Approve and sync
                      </Button>{' '}
                      <Button
                        variant="outline-secondary"
                        disabled={decision.isPending}
                        onClick={() => decide(approval, false)}
                      >
                        Deny
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
        ))}
      </div>
      <div className="small text-muted">
        Estimated cost:{' '}
        {snapshot.usage?.estimatedCost == null
          ? 'Unknown'
          : `$${snapshot.usage.estimatedCost.toFixed(4)}`}{' '}
        · Tokens: {snapshot.usage?.input ?? 'Unknown'} input / {snapshot.usage?.output ?? 'Unknown'}{' '}
        output
      </div>
      <Form className="mt-2" onSubmit={handleSubmit(submit)}>
        <Form.Label htmlFor={`course-agent-input-${id}`}>Ask about your course</Form.Label>
        <Form.Control
          id={`course-agent-input-${id}`}
          as="textarea"
          rows={3}
          defaultValue=""
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
        <div className="d-flex justify-content-between mt-2">
          <Button
            variant="outline-secondary"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate({ conversationId: id })}
          >
            Stop
          </Button>
          <Button type="submit" disabled={snapshot.blocked || send.isPending || !draft.trim()}>
            {busy ? 'Steer' : 'Send'}
          </Button>
        </div>
      </Form>
    </>
  );
}

function Transcript({ messages }: { messages: UIMessage[] }) {
  return messages.filter(isVisibleMessage).map((message) => {
    const tools = message.parts.filter(
      (p) => p.type === 'dynamic-tool' || p.type.startsWith('tool-'),
    );
    return (
      <ChatMessage key={message.id} messageRole={message.role}>
        {message.parts.map((part, index) => {
          if (part.type === 'text') return <MemoizedMarkdown key={index} content={part.text} />;
          if (part.type === 'reasoning') return <ReasoningSummary key={index} text={part.text} />;
          if (
            part.type === 'data-steering' &&
            part.data &&
            typeof part.data === 'object' &&
            'text' in part.data
          ) {
            return <blockquote key={index}>{String(part.data.text)}</blockquote>;
          }
          return null;
        })}
        {tools.length > 0 && (
          <ToolCallGroup count={tools.length}>
            {tools.map((part, index) => (
              <ToolCall
                key={index}
                title={'toolName' in part ? String(part.toolName).replaceAll('_', ' ') : part.type}
                state={
                  'state' in part && part.state === 'output-error'
                    ? 'error'
                    : 'state' in part && part.state === 'output-available'
                      ? 'success'
                      : 'streaming'
                }
              >
                <pre>{toolDetails(part)}</pre>
              </ToolCall>
            ))}
          </ToolCallGroup>
        )}
      </ChatMessage>
    );
  });
}

function RenameConversation({
  title,
  busy,
  onSave,
  onHide,
}: {
  title: string;
  busy: boolean;
  onSave: (title: string) => void;
  onHide: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ defaultValues: { title } });
  return (
    <Modal show onHide={onHide}>
      <Form onSubmit={handleSubmit((value) => onSave(value.title))}>
        <Modal.Header closeButton>
          <Modal.Title>Rename conversation</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Label htmlFor="course-agent-title">Title</Form.Label>
          <Form.Control
            id="course-agent-title"
            defaultValue={title}
            {...register('title', {
              required: true,
              maxLength: 200,
              validate: (value) => !!value.trim(),
            })}
            aria-invalid={!!errors.title}
            aria-errormessage={errors.title ? 'course-agent-title-error' : undefined}
          />
          {errors.title && (
            <p id="course-agent-title-error">Enter a title of up to 200 characters.</p>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button type="submit" disabled={busy}>
            Save
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
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
