import * as Sentry from '@sentry/cloudflare';
import { env } from 'cloudflare:workers';

/** Remove service credentials from text before it is logged or reported. */
function redactSecrets(text: string) {
  const secrets = env as Env & { GITHUB_READ_TOKEN?: string; PL_SERVICE_TOKEN_PREVIOUS?: string };
  for (const secret of [
    secrets.PL_SERVICE_TOKEN,
    secrets.PL_SERVICE_TOKEN_PREVIOUS,
    secrets.OPENAI_API_KEY,
    secrets.GITHUB_READ_TOKEN,
  ]) {
    if (secret) text = text.replaceAll(secret, '[redacted]');
  }
  return text;
}

/**
 * One structured line per startup or turn milestone for Workers Logs. `message` summarizes the
 * event, its non-ID fields, and elapsed time so the dashboard's Message column is readable.
 */
export function logEvent(
  event: string,
  { elapsedMs, ...fields }: { elapsedMs?: number } & Record<string, unknown>,
) {
  const details = Object.entries(fields)
    .filter(([key, value]) => !key.endsWith('Id') && value != null && typeof value !== 'object')
    .map(([key, value]) => `${key}=${String(value)}`);
  const message = [event, ...details, ...(elapsedMs === undefined ? [] : [`${elapsedMs}ms`])];
  // oxlint-disable-next-line no-console
  console.log(
    redactSecrets(JSON.stringify({ message: message.join(' '), event, elapsedMs, ...fields })),
  );
}

function formatError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const text = error.stack ?? `${error.name}: ${error.message}`;
  return error.cause === undefined ? text : `${text}\nCaused by: ${formatError(error.cause)}`;
}

/** Error reports describe failures, without collecting chat, course files, or request credentials. */
// SENTRY_DSN is an optional per-environment secret, kept out of the public repository.
export function sentryOptions(bindings: Env & { SENTRY_DSN?: string }): Sentry.CloudflareOptions {
  return {
    dsn: bindings.SENTRY_DSN,
    enabled: !!bindings.SENTRY_DSN,
    environment: bindings.SENTRY_ENVIRONMENT,
    release: bindings.VERSION_METADATA.id,
    defaultIntegrations: false,
    // Errors that cross RPC keep only the caller's frames, so `cause` often holds the real failure.
    integrations: [Sentry.requestDataIntegration(), Sentry.linkedErrorsIntegration()],
    tracesSampleRate: 0,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    beforeSend(event) {
      for (const exception of event.exception?.values ?? []) {
        if (exception.value) exception.value = redactSecrets(exception.value);
      }
      return {
        ...event,
        breadcrumbs: undefined,
        extra: undefined,
        user: undefined,
      };
    },
  };
}

/** Handled lifecycle failures still need reporting even when the HTTP/WebSocket response succeeds. */
export function reportError(error: unknown, tags?: Record<string, string>) {
  console.error(redactSecrets(formatError(error)));
  // The Worker/DO wrappers establish the scope and flush their SDK-managed client,
  // including errors captured by background work after a handler has returned.
  Sentry.captureException(error, { tags });
}

/** Sentry rejects feedback longer than this many characters. */
const FEEDBACK_CHARS = 4096;

interface Feedback {
  task: string;
  kind: string;
  impact: string;
  description: string;
  subject?: string;
}

/**
 * What the agent reports with `report_feedback` goes to Sentry's User Feedback, next to the
 * failures it often explains, with the conversation attached so developers can read what led to
 * it. Unlike error reports, this is text the agent wrote and the chat itself, and `beforeSend` does
 * not run for feedback, so credentials are redacted here.
 *
 * The agent gets the feedback's ID when it reports, but the feedback is sent when the turn ends:
 * only then is the turn's own part of the conversation, with the tool calls that went wrong, saved.
 *
 * Codex's tool calls arrive as WebSocket messages, outside the Durable Object handlers that Sentry
 * instruments, where no client is in scope. The reporter keeps the client in scope when it is
 * made, which is the isolate's cached client.
 */
export function feedbackReporter(context: () => { conversationId: string; courseId?: string }) {
  const scope = new Sentry.Scope();
  scope.setClient(Sentry.getClient());
  const queued: { eventId: string; feedback: Feedback }[] = [];
  return {
    /** Holds the feedback until `send`, returning the ID Sentry will file it under. */
    queue(feedback: Feedback) {
      const eventId = crypto.randomUUID().replaceAll('-', '');
      logEvent('agent_feedback', {
        conversationId: context().conversationId,
        eventId,
        kind: feedback.kind,
        impact: feedback.impact,
      });
      queued.push({ eventId, feedback });
      return eventId;
    },
    /** Sends the queued feedback with the conversation's saved messages attached. */
    send(messages: unknown) {
      if (queued.length === 0) return;
      const { conversationId, courseId } = context();
      const conversation = {
        filename: 'conversation.json',
        contentType: 'application/json',
        data: redactSecrets(JSON.stringify(messages, null, 2)),
      };
      for (const { eventId, feedback } of queued.splice(0)) {
        const message = [
          `Task: ${feedback.task}`,
          ...(feedback.subject ? [`About: ${feedback.subject}`] : []),
          '',
          feedback.description,
        ].join('\n');
        Sentry.captureFeedback(
          {
            source: 'course_agent',
            name: 'Course agent',
            // Sentry counts code points; slicing the string could split a surrogate pair.
            message: [...redactSecrets(message)].slice(0, FEEDBACK_CHARS).join(''),
            tags: {
              'feedback.kind': feedback.kind,
              'feedback.impact': feedback.impact,
              ...(feedback.subject ? { 'feedback.subject': feedback.subject } : {}),
              'course_agent.conversation': conversationId,
              ...(courseId ? { 'course_agent.course': courseId } : {}),
            },
          },
          { event_id: eventId, attachments: [conversation] },
          scope,
        );
      }
    },
  };
}
