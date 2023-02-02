import type socketIo from 'socket.io-client';

declare const io: typeof socketIo;

$(function () {
  $('[data-toggle="popover"]').popover({
    trigger: 'focus',
  });

  const body = document.querySelector('body')!;
  const workspaceId = body.getAttribute('data-workspace-id')!;
  const heartbeatIntervalSec = body.getAttribute('data-heartbeat-interval-sec')!;
  const parsedHeartbeatIntervalSec = parseInt(heartbeatIntervalSec, 10);

  const socket = io(`/workspace-${workspaceId}`);
  const loadingFrame = document.querySelector<HTMLDivElement>('#loading')!;
  const workspaceFrame = document.querySelector<HTMLIFrameElement>('#workspace')!;
  const stateBadge = document.querySelector('#state')!;
  const messageBadge = document.querySelector('#message')!;

  const showLoadingFrame = () => {
    loadingFrame.style.setProperty('display', 'flex', 'important');
    workspaceFrame.style.setProperty('display', 'none', 'important');
  };

  const showWorkspaceFrame = () => {
    loadingFrame.style.setProperty('display', 'none', 'important');
    workspaceFrame.style.setProperty('display', 'flex', 'important');
  };

  function setMessage(message) {
    messageBadge.innerHTML = message;
    if (message) {
      stateBadge.classList.add('badge-prepend');
    } else {
      stateBadge.classList.remove('badge-prepend');
    }
  }

  function setState(state) {
    if (state == 'running') {
      showWorkspaceFrame();
      workspaceFrame.src = `${window.location.href}/container/`;
    }
    if (state == 'stopped') {
      workspaceFrame.src = 'about:blank';
    }
    stateBadge.innerHTML = state;
  }

  socket.on('change:state', (msg) => {
    console.log(`change:state, msg = ${JSON.stringify(msg)}`);
    setState(msg.state);
    if (msg.message) setMessage(msg.message);
  });

  socket.on('change:message', (msg) => {
    console.log(`change:message, msg = ${JSON.stringify(msg)}`);
    setMessage(msg.message);
  });

  // Start the workspace once when the page loads; we don't start it on
  // reconnects because we don't want to restart the workspace if it's
  // been stopped due to a heartbeat timeout. We'll let the user reload the
  // page to restart the workspace.
  socket.emit('startWorkspace', { workspace_id: workspaceId });

  setInterval(() => {
    socket.emit('heartbeat', { workspace_id: workspaceId }, (msg) => {
      console.log(`heartbeat, msg = ${JSON.stringify(msg)}`);
    });
  }, 1000 * parsedHeartbeatIntervalSec);
});
