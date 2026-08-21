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
let clientDuringRender: QueryClient | undefined;

function ObserveQueryClientDuringRender() {
  clientDuringRender = testGlobal.window.__TANSTACK_QUERY_CLIENT__;
  return null;
}

afterEach(() => {
  delete testGlobal.window.__TANSTACK_QUERY_CLIENT__;
  delete testGlobal.IS_REACT_ACT_ENVIRONMENT;
  clientDuringRender = undefined;
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
  it('assigns the client in an effect and cleans up its own client', async () => {
    testGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    const client = new QueryClient();
    const root = createRoot(testGlobal.document.createElement('div'));

    assert.isUndefined(testGlobal.window.__TANSTACK_QUERY_CLIENT__);
    await act(async () => {
      root.render(
        <QueryClientProviderDebug client={client}>
          <ObserveQueryClientDuringRender />
        </QueryClientProviderDebug>,
      );
    });
    assert.isUndefined(clientDuringRender);
    assert.strictEqual(testGlobal.window.__TANSTACK_QUERY_CLIENT__, client);

    await act(async () => root.unmount());
    assert.isUndefined(testGlobal.window.__TANSTACK_QUERY_CLIENT__);
    client.clear();
  });

  it('does not clean up a client assigned by another provider', async () => {
    testGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    const firstClient = new QueryClient();
    const secondClient = new QueryClient();
    const root = createRoot(testGlobal.document.createElement('div'));

    await act(async () => {
      root.render(
        <QueryClientProviderDebug client={firstClient}>
          <span>Child</span>
        </QueryClientProviderDebug>,
      );
    });
    testGlobal.window.__TANSTACK_QUERY_CLIENT__ = secondClient;

    await act(async () => root.unmount());
    assert.strictEqual(testGlobal.window.__TANSTACK_QUERY_CLIENT__, secondClient);
    firstClient.clear();
    secondClient.clear();
  });

  it('restores the outer client when a nested provider unmounts', async () => {
    testGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    const outerClient = new QueryClient();
    const innerClient = new QueryClient();
    const root = createRoot(testGlobal.document.createElement('div'));

    await act(async () => {
      root.render(
        <QueryClientProviderDebug client={outerClient}>
          <span>Child</span>
        </QueryClientProviderDebug>,
      );
    });
    assert.strictEqual(testGlobal.window.__TANSTACK_QUERY_CLIENT__, outerClient);

    await act(async () => {
      root.render(
        <QueryClientProviderDebug client={outerClient}>
          <QueryClientProviderDebug client={innerClient}>
            <span>Child</span>
          </QueryClientProviderDebug>
        </QueryClientProviderDebug>,
      );
    });
    assert.strictEqual(testGlobal.window.__TANSTACK_QUERY_CLIENT__, innerClient);

    await act(async () => {
      root.render(
        <QueryClientProviderDebug client={outerClient}>
          <span>Child</span>
        </QueryClientProviderDebug>,
      );
    });
    assert.strictEqual(testGlobal.window.__TANSTACK_QUERY_CLIENT__, outerClient);

    await act(async () => root.unmount());
    assert.isUndefined(testGlobal.window.__TANSTACK_QUERY_CLIENT__);
    outerClient.clear();
    innerClient.clear();
  });

  it('keeps the active client when an earlier provider unmounts', async () => {
    testGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    const firstClient = new QueryClient();
    const secondClient = new QueryClient();
    const firstRoot = createRoot(testGlobal.document.createElement('div'));
    const secondRoot = createRoot(testGlobal.document.createElement('div'));

    await act(async () => {
      firstRoot.render(
        <QueryClientProviderDebug client={firstClient}>
          <span>First child</span>
        </QueryClientProviderDebug>,
      );
    });
    await act(async () => {
      secondRoot.render(
        <QueryClientProviderDebug client={secondClient}>
          <span>Second child</span>
        </QueryClientProviderDebug>,
      );
    });
    assert.strictEqual(testGlobal.window.__TANSTACK_QUERY_CLIENT__, secondClient);

    await act(async () => firstRoot.unmount());
    assert.strictEqual(testGlobal.window.__TANSTACK_QUERY_CLIENT__, secondClient);

    await act(async () => secondRoot.unmount());
    assert.isUndefined(testGlobal.window.__TANSTACK_QUERY_CLIENT__);
    firstClient.clear();
    secondClient.clear();
  });
});
