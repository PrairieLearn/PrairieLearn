import { io } from 'socket.io-client';

import { onDocumentReady } from '@prairielearn/browser-utils';

import { createWorkspaceTrpcClient } from '../../src/trpc/workspace/client.js';

const WORKSPACE_SANDBOX_AUTHORIZATION_EXPIRED_MESSAGE =
  'prairielearn:workspace-authorization-expired';

interface WorkspaceSandboxAuthorizationResponse {
  authorizationMaxAgeMilliseconds: number;
  bootstrapUrl: string;
  jwt: string;
  sandboxOrigin: string;
}

function getNumericalAttribute(element: HTMLElement, name: string, defaultValue: number): number {
  const value = element.getAttribute(name);
  if (value === null) {
    return defaultValue;
  }
  const parsedValue = Number.parseFloat(value);
  if (Number.isNaN(parsedValue)) {
    return defaultValue;
  }
  return parsedValue;
}

onDocumentReady(function () {
  const socketToken = document.body.getAttribute('data-socket-token');
  const workspaceId = document.body.getAttribute('data-workspace-id');
  const trpcCsrfToken = document.body.getAttribute('data-trpc-csrf-token');
  const publicQuestionEndpoint =
    document.body.getAttribute('data-public-question-endpoint') === 'true';
  const workspaceIsolationMode = document.body.getAttribute('data-workspace-isolation-mode');
  const heartbeatIntervalSec = getNumericalAttribute(
    document.body,
    'data-heartbeat-interval-sec',
    60,
  );
  const visibilityTimeoutSec = getNumericalAttribute(
    document.body,
    'data-visibility-timeout-sec',
    30 * 60,
  );

  const socket = io('/workspace', {
    auth: {
      token: socketToken,
      workspace_id: workspaceId,
    },
  });
  const loadingFrame = document.getElementById('loading') as HTMLDivElement;
  const stoppedFrame = document.getElementById('stopped') as HTMLDivElement;
  const failedFrame = document.getElementById('failed') as HTMLDivElement;
  const authorizationExpiredFrame = document.getElementById(
    'authorization-expired',
  ) as HTMLDivElement;
  const workspaceFrame = document.getElementById('workspace') as HTMLIFrameElement;
  const stateBadge = document.getElementById('state') as HTMLSpanElement;
  const messageBadge = document.getElementById('message') as HTMLSpanElement;
  const failedMessage = document.getElementById('failed-message')!;
  const reloadButton = document.getElementById('reload') as HTMLButtonElement;
  const reconnectButton = document.getElementById('reconnect') as HTMLButtonElement;

  const hideAllFrames = () => {
    loadingFrame.style.setProperty('display', 'none', 'important');
    stoppedFrame.style.setProperty('display', 'none', 'important');
    failedFrame.style.setProperty('display', 'none', 'important');
    authorizationExpiredFrame.style.setProperty('display', 'none', 'important');
    workspaceFrame.style.setProperty('display', 'none', 'important');
  };

  const showLoadingFrame = () => {
    hideAllFrames();
    loadingFrame.style.setProperty('display', 'flex', 'important');
  };

  const showStoppedFrame = () => {
    hideAllFrames();
    stoppedFrame.style.setProperty('display', 'flex', 'important');
  };

  const showFailedFrame = () => {
    hideAllFrames();
    failedFrame.style.setProperty('display', 'flex', 'important');
  };

  const showWorkspaceFrame = () => {
    hideAllFrames();
    workspaceFrame.style.setProperty('display', 'flex', 'important');
  };

  const showAuthorizationExpiredFrame = () => {
    hideAllFrames();
    authorizationExpiredFrame.style.setProperty('display', 'flex', 'important');
  };

  function setMessage(message: string) {
    messageBadge.textContent = message;
    failedMessage.textContent = message;
    stateBadge.classList.toggle('badge-prepend', !!message);
  }

  let previousState: null | string = null;
  let sandboxOrigin: string | null = null;
  let authorizationExpirationTimeout: number | undefined;

  function parseWorkspaceSandboxAuthorizationResponse(
    value: unknown,
  ): WorkspaceSandboxAuthorizationResponse {
    if (value == null || typeof value !== 'object') {
      throw new Error('Invalid workspace authorization response');
    }
    const response = value as Record<string, unknown>;
    if (
      typeof response.authorizationMaxAgeMilliseconds !== 'number' ||
      typeof response.bootstrapUrl !== 'string' ||
      typeof response.jwt !== 'string' ||
      typeof response.sandboxOrigin !== 'string'
    ) {
      throw new Error('Invalid workspace authorization response');
    }
    return {
      authorizationMaxAgeMilliseconds: response.authorizationMaxAgeMilliseconds,
      bootstrapUrl: response.bootstrapUrl,
      jwt: response.jwt,
      sandboxOrigin: response.sandboxOrigin,
    };
  }

  function scheduleAuthorizationExpiration(maxAgeMilliseconds: number) {
    window.clearTimeout(authorizationExpirationTimeout);
    authorizationExpirationTimeout = window.setTimeout(() => {
      if (previousState === 'running') showAuthorizationExpiredFrame();
    }, maxAgeMilliseconds);
  }

  async function loadWorkspaceFrame() {
    showLoadingFrame();

    if (workspaceIsolationMode !== 'cross-origin') {
      const workspaceFrameSrc = window.location.href + '/container/';
      if (workspaceFrame.src !== workspaceFrameSrc) {
        workspaceFrame.src = workspaceFrameSrc;
      }
      showWorkspaceFrame();
      return;
    }

    if (!trpcCsrfToken || !workspaceId) throw new Error('Missing workspace authorization data');

    const trpcClient = createWorkspaceTrpcClient({
      csrfToken: trpcCsrfToken,
      publicQuestionEndpoint,
      workspaceId,
    });
    const authorizationResponse = parseWorkspaceSandboxAuthorizationResponse(
      await trpcClient.authorization.issue.mutate(),
    );
    const bootstrapUrl = new URL(authorizationResponse.bootstrapUrl);
    sandboxOrigin = new URL(authorizationResponse.sandboxOrigin).origin;
    if (bootstrapUrl.origin !== sandboxOrigin) {
      throw new Error('Invalid workspace bootstrap URL');
    }

    scheduleAuthorizationExpiration(authorizationResponse.authorizationMaxAgeMilliseconds);

    const form = document.createElement('form');
    form.action = bootstrapUrl.href;
    form.method = 'POST';
    form.target = workspaceFrame.name;
    form.hidden = true;

    const jwtInput = document.createElement('input');
    jwtInput.name = 'jwt';
    jwtInput.type = 'hidden';
    jwtInput.value = authorizationResponse.jwt;
    form.append(jwtInput);

    document.body.append(form);
    form.submit();
    form.remove();
    showWorkspaceFrame();
  }

  function loadWorkspaceFrameOrShowError() {
    void loadWorkspaceFrame().catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : 'Unable to load workspace');
      showFailedFrame();
    });
  }

  function setState(state: string) {
    // Simplify the state machine by ignoring duplicate states.
    if (state === previousState) return;

    if (state === 'running') {
      loadWorkspaceFrameOrShowError();
    }
    if (state === 'stopped') {
      window.clearTimeout(authorizationExpirationTimeout);
      sandboxOrigin = null;
      workspaceFrame.src = 'about:blank';
      if (previousState === 'running') {
        showStoppedFrame();
      } else if (previousState === 'launching') {
        // When the workspace is first created, it will be in the `uninitialized`
        // state. It then transitions to the `stopped` state, and then immediately
        // to `launching`.
        //
        // We don't want to consider the initial transition to `stopped` as a
        // failure, so we specifically only consider transitions from `launching`.
        showFailedFrame();
      }
    }
    stateBadge.textContent = state;

    previousState = state;
  }

  socket.on('change:state', (msg) => {
    setState(msg.state);
    setMessage(msg.message);
  });

  socket.on('change:message', (msg) => {
    setMessage(msg.message);
  });

  // Whenever we establish or reestablish a connection, join the workspace room.
  socket.on('connect', () => {
    socket.emit('joinWorkspace', (msg: any) => {
      if (msg.errorMessage) {
        setMessage('Error joining workspace: ' + msg.errorMessage);
      } else {
        setState(msg.state);
      }
    });
  });

  // Only start the workspace when the page is first loaded, not on reconnects.
  socket.emit('startWorkspace');

  let lastVisibleTime = Date.now();
  setInterval(() => {
    if (document.visibilityState === 'visible') {
      lastVisibleTime = Date.now();
    }

    // Only send a heartbeat if this page was recently visible.
    if (Date.now() < lastVisibleTime + visibilityTimeoutSec * 1000) {
      socket.emit('heartbeat');
    }
  }, heartbeatIntervalSec * 1000);

  document.addEventListener('visibilitychange', () => {
    // Every time we switch to or from this page, record that it was visible.
    // This is needed to capture the visibility when we switch to this page
    // and then quickly switch away again.
    lastVisibleTime = Date.now();
  });

  reloadButton.addEventListener('click', () => {
    location.reload();
  });

  reconnectButton.addEventListener('click', loadWorkspaceFrameOrShowError);

  window.addEventListener('message', (event) => {
    if (
      workspaceIsolationMode !== 'cross-origin' ||
      sandboxOrigin == null ||
      event.origin !== sandboxOrigin ||
      event.source !== workspaceFrame.contentWindow ||
      event.data == null ||
      typeof event.data !== 'object' ||
      !('type' in event.data) ||
      event.data.type !== WORKSPACE_SANDBOX_AUTHORIZATION_EXPIRED_MESSAGE
    ) {
      return;
    }

    showAuthorizationExpiredFrame();
  });
});
