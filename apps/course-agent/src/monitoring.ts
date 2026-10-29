import * as Sentry from '@sentry/cloudflare';

/** Error reports describe failures, without collecting chat, course files, or request credentials. */
export function sentryOptions(env: Env & { GITHUB_READ_TOKEN?: string }): Sentry.CloudflareOptions {
  return {
    dsn: env.SENTRY_DSN,
    enabled: !!env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT,
    release: env.VERSION_METADATA.id,
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
        for (const secret of [env.PL_SERVICE_TOKEN, env.OPENAI_API_KEY, env.GITHUB_READ_TOKEN]) {
          if (secret && exception.value) {
            exception.value = exception.value.replaceAll(secret, '[redacted]');
          }
        }
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
  console.error(error);
  // The Worker/DO wrappers establish the scope and flush their SDK-managed client,
  // including errors captured by background work after a handler has returned.
  Sentry.captureException(error, { tags });
}
