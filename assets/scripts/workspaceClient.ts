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

  const socket = io('/workspace');
  const loadingFrame = document.querySelector<HTMLDivElement>('#loading')!;
  const workspaceFrame = document.querySelector<HTMLIFrameElement>('#workspace')!;
  const stateBadge = document.querySelector<HTMLSpanElement>('#state')!;
  const messageBadge = document.querySelector<HTMLSpanElement>('#message')!;

  const showLoadingFrame = () => {
    loadingFrame.style.setProperty('display', 'flex', 'important');
    workspaceFrame.style.setProperty('display', 'none', 'important');
  };

  const showWorkspaceFrame = () => {
    loadingFrame.style.setProperty('display', 'none', 'important');
    workspaceFrame.style.setProperty('display', 'flex', 'important');
  };

  function setMessage(message) {
    console.log(`message=${message}`);
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
    setMessage(msg.message);
  });

  socket.on('change:message', (msg) => {
    console.log(`change:message, msg = ${JSON.stringify(msg)}`);
    setMessage(msg.message);
  });

  socket.emit('joinWorkspace', { workspace_id: workspaceId }, (msg) => {
    console.log(`joinWorkspace, msg = ${JSON.stringify(msg)}`);
    setState(msg.state);
  });

  setInterval(() => {
    socket.emit('heartbeat', { workspace_id: workspaceId }, (msg) => {
      console.log(`heartbeat, msg = ${JSON.stringify(msg)}`);
    });
  }, 1000 * parsedHeartbeatIntervalSec);
});
