import * as Sentry from '@sentry/cloudflare';
import { createStackParser } from '@sentry/core';
import { nodeStackLineParser } from '@sentry/core/server';

/** Error reports describe failures, without collecting chat, course files, or request credentials. */
export function sentryOptions(env: Env & { GITHUB_READ_TOKEN?: string }): Sentry.CloudflareOptions {
  return {
    dsn: env.SENTRY_DSN,
    enabled: !!env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT,
    release: env.VERSION_METADATA.id,
    defaultIntegrations: false,
    tracesSampleRate: 0,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpBodies: [],
      httpHeaders: { allow: [] },
      urlQueryParams: { allow: [] },
    },
    beforeSend(event) {
      for (const exception of event.exception?.values ?? []) {
        for (const secret of [env.PL_SERVICE_TOKEN, env.OPENAI_API_KEY, env.GITHUB_READ_TOKEN]) {
          if (secret && exception.value) {
            exception.value = exception.value.replaceAll(secret, '[redacted]');
          }
        }
      }
      return {
        ...event,
        request: undefined,
        breadcrumbs: undefined,
        extra: undefined,
        user: undefined,
        contexts: undefined,
      };
    },
  };
}

/** Handled lifecycle failures still need reporting even when the HTTP/WebSocket response succeeds. */
export function reportError(error: unknown, client = Sentry.getClient()) {
  console.error(error);
  if (client) {
    const scope = new Sentry.Scope();
    scope.setClient(client);
    scope.captureException(error);
  }
}

/** Agent RPC/background callbacks do not always inherit an initialized HTTP reporting scope. */
export function createErrorReporter(env: Env, context: Pick<DurableObjectState, 'waitUntil'>) {
  const client = new Sentry.CloudflareClient({
    ...sentryOptions(env),
    integrations: [],
    stackParser: createStackParser(nodeStackLineParser()),
    transport: (options) =>
      Sentry.createTransport(options, async (request) => {
        const response = await fetch(options.url, {
          method: 'POST',
          body: request.body,
          headers: options.headers,
          signal: AbortSignal.timeout(2000),
        });
        await response.arrayBuffer();
        return {
          statusCode: response.status,
          headers: {
            'x-sentry-rate-limits': response.headers.get('x-sentry-rate-limits'),
            'retry-after': response.headers.get('retry-after'),
          },
        };
      }),
  });
  client.init();
  return (error: unknown) => {
    reportError(error, client);
    context.waitUntil(client.flush(2000));
  };
}
