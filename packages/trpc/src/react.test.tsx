// @vitest-environment jsdom

import { QueryClient } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, assert, describe, it } from 'vitest';

import { AppErrorAlert, QueryClientProviderDebug } from './react.js';

const testGlobal = globalThis as typeof globalThis & {
  document: { createElement(tagName: string): Parameters<typeof createRoot>[0] };
  IS_REACT_ACT_ENVIRONMENT?: boolean;
  window: Window;
};

afterEach(() => {
  delete testGlobal.window.__TANSTACK_QUERY_CLIENT__;
  delete testGlobal.IS_REACT_ACT_ENVIRONMENT;
});

describe('AppErrorAlert', () => {
  it('renders an error from a JSX element', () => {
    const error = { code: 'EXPECTED' as const, message: 'Rendered application error' };
    const markup = renderToStaticMarkup(
      <AppErrorAlert
        error={error}
        render={{ EXPECTED: ({ message }) => <span>{message}</span> }}
      />,
    );

    assert.include(markup, 'Rendered application error');
  });
});

describe('QueryClientProviderDebug', () => {
  it('exposes the client to browser devtools', async () => {
    testGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    const client = new QueryClient();
    const root = createRoot(testGlobal.document.createElement('div'));

    assert.isUndefined(testGlobal.window.__TANSTACK_QUERY_CLIENT__);
    await act(async () => {
      root.render(
        <QueryClientProviderDebug client={client}>
          <span>Child</span>
        </QueryClientProviderDebug>,
      );
    });
    assert.strictEqual(testGlobal.window.__TANSTACK_QUERY_CLIENT__, client);

    await act(async () => root.unmount());
    client.clear();
  });
});
