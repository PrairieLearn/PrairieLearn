import RFB from './novnc/core/rfb.js';
import { Spinner } from './spinjs/spin.js';

const poll_ms = 500;
const spinner = new Spinner().spin(document.getElementById('screen'));
const clipboard_textarea = document.getElementById('clipboard-paste-textarea');
const clipboard_modal = document.getElementById('clipboard-paste-modal');
const clipboard_button = document.getElementById('clipboard-button');
const screen = document.getElementById('screen');
clipboard_textarea.value = '';

function strip_trailing_slash(url) {
  if (url[url.length - 1] == '/') {
    return url.substr(0, url.length - 1);
  }
  return url;
}

async function sleep(ms) {
  return new Promise((res, rej) => {
    setTimeout(res, ms);
  });
}

async function set_resolution() {
  const width = screen.clientWidth;
  const height = screen.clientHeight;

  const base_url = `${window.location.protocol}//${window.location.hostname}:${window.location.port}${window.location.pathname}`;
  const url = `${strip_trailing_slash(base_url)}/resize?width=${width}&height=${height}`;
  const req = new XMLHttpRequest();
  return new Promise((res, rej) => {
    req.addEventListener('error', rej);
    req.addEventListener('timeout', rej);
    req.addEventListener('load', () => {
      res();
    });
    req.open('GET', url);
    req.send();
  });
}

function setup_connection() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${window.location.hostname}:${window.location.port}${window.location.pathname}`;
  const rfb = new RFB(screen, url, {
    wsProtocols: ['binary'],
  });

  // Set parameters that can be changed on an active connection
  rfb.viewOnly = false;
  rfb.scaleViewport = false;
  rfb.resizeSession = true;

  rfb.addEventListener('disconnect', () => {
    // If we couldn't connect, try again after some time
    spinner.spin();
    setTimeout(setup_connection, poll_ms);
  });
  rfb.addEventListener('connect', () => {
    spinner.stop();

    // Dismiss the modal when clicking on the screen
    screen.querySelector('canvas').addEventListener('click', () => {
      clipboard_button.classList.remove('active');
      clipboard_modal.classList.add('hidden');
    });
  });
  rfb.addEventListener('clipboard', (ev) => {
    clipboard_textarea.value = ev.detail.text;
  });
  clipboard_textarea.onchange = (ev) => {
    // Note we are directly setting onchange instead of adding a listener
    // each possible connection because we only want one global listener.
    rfb.clipboardPasteFrom(clipboard_textarea.value);
  };
}

(async () => {
  // Setup the button handlers
  clipboard_button.addEventListener('click', () => {
    if (clipboard_button.classList.contains('active')) {
      // Toggle OFF
      clipboard_button.classList.remove('active');
      clipboard_modal.classList.add('hidden');
    } else {
      // Toggle ON
      clipboard_button.classList.add('active');
      clipboard_modal.classList.remove('hidden');
    }
  });

  while (true) {
    // Send our resolution to the server so it can spin up an Xorg instance
    try {
      await set_resolution();
      break;
    } catch (err) {
      await sleep(poll_ms);
    }
  }

  // Now, we can try to connect via VNC
  setup_connection();
})();
