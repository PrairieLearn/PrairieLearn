import { io } from 'socket.io-client';

import { onDocumentReady } from '@prairielearn/browser-utils';

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
  const workspaceFrame = document.getElementById('workspace') as HTMLIFrameElement;
  const stateBadge = document.getElementById('state') as HTMLSpanElement;
  const messageBadge = document.getElementById('message') as HTMLSpanElement;
  const failedMessage = document.getElementById('failed-message')!;
  const reloadButton = document.getElementById('reload') as HTMLButtonElement;

  const showStoppedFrame = () => {
    loadingFrame.style.setProperty('display', 'none', 'important');
    stoppedFrame.style.setProperty('display', 'flex', 'important');
    failedFrame.style.setProperty('display', 'none', 'important');
    workspaceFrame.style.setProperty('display', 'none', 'important');
  };

  const showFailedFrame = () => {
    loadingFrame.style.setProperty('display', 'none', 'important');
    stoppedFrame.style.setProperty('display', 'none', 'important');
    failedFrame.style.setProperty('display', 'flex', 'important');
    workspaceFrame.style.setProperty('display', 'none', 'important');
  };

  const showWorkspaceFrame = () => {
    loadingFrame.style.setProperty('display', 'none', 'important');
    stoppedFrame.style.setProperty('display', 'none', 'important');
    failedFrame.style.setProperty('display', 'none', 'important');
    workspaceFrame.style.setProperty('display', 'flex', 'important');
  };

  function setMessage(message: string) {
    messageBadge.textContent = message;
    failedMessage.textContent = message;
    stateBadge.classList.toggle('badge-prepend', message);
  }

  let previousState: null | string = null;

  function setState(state: string) {
    // Simplify the state machine by ignoring duplicate states.
    if (state === previousState) return;

    if (state === 'running') {
      showWorkspaceFrame();

      // Avoid unnecessarily reassigning the src attribute, which causes the
      // iframe to reload.
      const workspaceFrameSrc = window.location.href + '/container/';
      if (workspaceFrame.src !== workspaceFrameSrc) {
        workspaceFrame.src = workspaceFrameSrc;
      }
    }
    if (state === 'stopped') {
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
});
