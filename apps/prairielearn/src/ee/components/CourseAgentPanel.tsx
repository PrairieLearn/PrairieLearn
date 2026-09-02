import { QueryClient, useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Button, Form, Offcanvas, Spinner } from 'react-bootstrap';

import { QueryClientProviderDebug } from '@prairielearn/trpc/react';

import { createCourseTrpcClient } from '../../trpc/course/client.js';
import { TRPCProvider, useTRPC } from '../../trpc/course/context.js';

function CourseAgentPanelInner({ courseShortName }: { courseShortName: string }) {
  const trpc = useTRPC();
  const [show, setShow] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [conversation, setConversation] = useState<{
    conversationId: string;
    sandboxId: string;
  } | null>(null);
  const conversations = useQuery(trpc.courseAgent.list.queryOptions());
  const start = useMutation(
    trpc.courseAgent.start.mutationOptions({
      onSuccess: (result) => {
        setConversation(result);
        setPrompt('');
        void conversations.refetch();
      },
    }),
  );
  const snapshot = useQuery(
    trpc.courseAgent.get.queryOptions(
      conversation ?? { conversationId: '00000000-0000-0000-0000-000000000000', sandboxId: '' },
      {
        enabled: conversation !== null,
        refetchInterval: (query) => {
          const status = query.state.data?.status;
          return status === 'starting' || status === 'running' ? 750 : false;
        },
      },
    ),
  );
  const busy = start.isPending || ['starting', 'running'].includes(snapshot.data?.status ?? '');

  return (
    <>
      <Button
        type="button"
        className="position-fixed bottom-0 end-0 m-4 rounded-pill shadow"
        style={{ zIndex: 1020 }}
        onClick={() => setShow(true)}
      >
        Course agent
      </Button>
      <Offcanvas show={show} placement="end" onHide={() => setShow(false)}>
        <Offcanvas.Header closeButton>
          <Offcanvas.Title>Course agent</Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body className="d-flex flex-column gap-3">
          <p className="text-muted small mb-0">
            Ephemeral authoring workspace for <strong>{courseShortName}</strong>
          </p>
          {conversations.data?.conversations.length ? (
            <div className="list-group list-group-flush border rounded">
              {conversations.data.conversations.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="list-group-item list-group-item-action small"
                  onClick={() =>
                    setConversation({ conversationId: item.id, sandboxId: item.sandbox_id })
                  }
                >
                  {item.title}
                </button>
              ))}
            </div>
          ) : null}
          {snapshot.data?.messages.map((message) => (
            <Alert key={message.id} variant={message.role === 'user' ? 'primary' : 'light'}>
              {message.content}
            </Alert>
          ))}
          {snapshot.data?.error && <Alert variant="danger">{snapshot.data.error}</Alert>}
          {start.error && <Alert variant="danger">{start.error.message}</Alert>}
          {snapshot.data && (
            <details>
              <summary className="small">Activity ({snapshot.data.events.length})</summary>
              <ol className="small mt-2">
                {snapshot.data.events.map((event) => (
                  <li key={event.sequence}>{event.type}</li>
                ))}
              </ol>
            </details>
          )}
          <Form
            className="mt-auto"
            onSubmit={(event) => {
              event.preventDefault();
              start.mutate({ conversationId: conversation?.conversationId, prompt });
            }}
          >
            <Form.Group controlId="course-agent-prompt">
              <Form.Label>Message</Form.Label>
              <Form.Control
                as="textarea"
                rows={4}
                value={prompt}
                disabled={busy}
                onChange={(event) => setPrompt(event.target.value)}
              />
            </Form.Group>
            <Button type="submit" className="mt-2" disabled={busy || !prompt.trim()}>
              {busy && <Spinner size="sm" className="me-2" />}
              Send
            </Button>
          </Form>
        </Offcanvas.Body>
      </Offcanvas>
    </>
  );
}

export function CourseAgentPanel({
  trpcCsrfToken,
  courseId,
  courseShortName,
}: {
  trpcCsrfToken: string;
  courseId: string;
  courseShortName: string;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createCourseTrpcClient({ csrfToken: trpcCsrfToken, courseId }),
  );
  return (
    <QueryClientProviderDebug client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <CourseAgentPanelInner courseShortName={courseShortName} />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

CourseAgentPanel.displayName = 'CourseAgentPanel';
