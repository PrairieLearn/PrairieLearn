import * as Sentry from '@sentry/cloudflare';
import { env } from 'cloudflare:workers';

/** Remove service credentials from text before it is logged or reported. */
export function redactSecrets(text: string) {
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
    integrations: [Sentry.requestDataIntegration()],
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
