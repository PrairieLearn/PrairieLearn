import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect } from 'react';
import { Alert, type AlertProps } from 'react-bootstrap';

import { type AppErrorRenderers, renderAppError } from './client.js';

declare global {
  interface Window {
    __TANSTACK_QUERY_CLIENT__?: QueryClient;
  }
}

interface QueryClientProviderEntry {
  client: QueryClient;
}

const queryClientProviders = new WeakMap<Window, QueryClientProviderEntry[]>();

/** Renders an application error inside a Bootstrap alert. */
export function AppErrorAlert<E extends { code: string; message: string }>({
  error,
  onDismiss,
  variant = 'danger',
  className,
  render,
}: {
  error: E | null | undefined;
  onDismiss?: () => void;
  variant?: AlertProps['variant'];
  className?: string;
  render: AppErrorRenderers<E>;
}) {
  if (!error) return null;

  return (
    <Alert variant={variant} dismissible={!!onDismiss} className={className} onClose={onDismiss}>
      {renderAppError(error, render)}
    </Alert>
  );
}

/** Provides a TanStack Query client and exposes it to browser devtools. */
export function QueryClientProviderDebug({
  client,
  children,
}: {
  client: QueryClient;
  children: ReactNode;
}) {
  useEffect(() => {
    const browserWindow = (globalThis as { window?: Window }).window;
    if (!browserWindow) return;

    const entry = { client };
    const entries = queryClientProviders.get(browserWindow) ?? [];
    if (entries.length === 0) queryClientProviders.set(browserWindow, entries);
    entries.push(entry);
    browserWindow.__TANSTACK_QUERY_CLIENT__ = client;

    return () => {
      const index = entries.indexOf(entry);
      if (index === -1) return;

      const wasActive = index === entries.length - 1;
      entries.splice(index, 1);
      const activeEntry = entries.at(-1);
      if (entries.length === 0) queryClientProviders.delete(browserWindow);

      if (wasActive && browserWindow.__TANSTACK_QUERY_CLIENT__ === client) {
        if (activeEntry) {
          browserWindow.__TANSTACK_QUERY_CLIENT__ = activeEntry.client;
        } else {
          delete browserWindow.__TANSTACK_QUERY_CLIENT__;
        }
      }
    };
  }, [client]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
