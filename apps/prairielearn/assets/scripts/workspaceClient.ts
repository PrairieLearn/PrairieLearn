import { io } from 'socket.io-client';

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

$(function () {
  $('[data-toggle="popover"]').popover({
    trigger: 'focus',
  });

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

  const socket = io('/workspace');
  const loadingFrame = document.getElementById('loading') as HTMLDivElement;
  const stoppedFrame = document.getElementById('stopped') as HTMLDivElement;
  const workspaceFrame = document.getElementById('workspace') as HTMLIFrameElement;
  const stateBadge = document.getElementById('state') as HTMLSpanElement;
  const messageBadge = document.getElementById('message') as HTMLSpanElement;
  const reloadButton = document.getElementById('reload') as HTMLButtonElement;

  const showStoppedFrame = () => {
    loadingFrame.style.setProperty('display', 'none', 'important');
    stoppedFrame.style.setProperty('display', 'flex', 'important');
    workspaceFrame.style.setProperty('display', 'none', 'important');
  };

  const showWorkspaceFrame = () => {
    loadingFrame.style.setProperty('display', 'none', 'important');
    stoppedFrame.style.setProperty('display', 'none', 'important');
    workspaceFrame.style.setProperty('display', 'flex', 'important');
  };

  function setMessage(message: string) {
    console.log('message', message);
    messageBadge.innerHTML = message;
    if (message) {
      stateBadge.classList.add('badge-prepend');
    } else {
      stateBadge.classList.remove('badge-prepend');
    }
  }

  let previousState: null | string = null;
  function setState(state: string) {
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
      }
    }
    stateBadge.innerHTML = state;

    previousState = state;
  }

  socket.on('change:state', (msg) => {
    console.log('change:state, msg =', msg);
    setState(msg.state);
    setMessage(msg.message);
  });

  socket.on('change:message', (msg) => {
    console.log('change:message, msg =', msg);
    setMessage(msg.message);
  });

  socket.on('connect', () => {
    socket.emit('joinWorkspace', { workspace_id: workspaceId }, (msg) => {
      console.log('joinWorkspace, msg =', msg);
      setState(msg.state);
    });
  });

  socket.emit('startWorkspace', { workspace_id: workspaceId });

  let lastVisibleTime = Date.now();
  setInterval(() => {
    if (document.visibilityState === 'visible') {
      lastVisibleTime = Date.now();
    }

    // Only send a heartbeat if this page was recently visible.
    if (Date.now() < lastVisibleTime + visibilityTimeoutSec * 1000) {
      socket.emit('heartbeat', { workspace_id: workspaceId }, (msg) => {
        console.log('heartbeat, msg =', msg);
      });
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
