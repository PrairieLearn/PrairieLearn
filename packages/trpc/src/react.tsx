import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect } from 'react';
import { Alert, type AlertProps } from 'react-bootstrap';

import { type AppErrorRenderers, renderAppError } from './client.js';

declare global {
  interface Window {
    __TANSTACK_QUERY_CLIENT__?: QueryClient;
  }
}

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
  // Expose the page's query client after mount so the browser extension can discover it.
  useEffect(() => {
    const browserWindow = (globalThis as { window?: Window }).window;
    if (!browserWindow) return;

    browserWindow.__TANSTACK_QUERY_CLIENT__ = client;
  }, [client]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
