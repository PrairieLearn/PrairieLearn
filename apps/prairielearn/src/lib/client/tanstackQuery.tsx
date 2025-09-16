import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { JSX } from 'preact/jsx-runtime';

declare global {
  interface Window {
    __TANSTACK_QUERY_CLIENT__: QueryClient;
  }
}

/**
 * This small wrapper supports the devtools debugger for TanStack Query.
 */
export const QueryClientProviderDebug = ({
  client,
  children,
  isDevMode,
}: {
  client: QueryClient;
  children: JSX.Element;
  isDevMode?: boolean;
}) => {
  if (typeof window !== 'undefined' && isDevMode) {
    window.__TANSTACK_QUERY_CLIENT__ = client;
  }
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};
