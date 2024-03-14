const express = require('express');
const express_ws = require('express-ws');
const http = require('http');
const http_proxy = require('http-proxy');
const path = require('path');
const cl_args = require('command-line-args');
const cl_usage = require('command-line-usage');
const child_process = require('child_process');

const app = express();
express_ws(app);
const server = http.createServer(app);
const ws_proxy = http_proxy.createProxyServer({
  target: 'http://localhost:5901',
  ws: true,
});

const argument_option_defs = [
  {
    name: 'help',
    alias: 'h',
    type: Boolean,
    description: 'display this usage guide',
  },
  {
    name: 'port',
    alias: 'p',
    type: Number,
    defaultValue: 8080,
    description: 'port that the server is run on (default 8080)',
  },
  {
    name: 'de',
    type: String,
    defaultValue: '/usr/bin/xfce4-session',
    description: 'Binary for the desktop environment to run',
  },
];
const options = cl_args(argument_option_defs);
if (options.help) {
  const usage = cl_usage([{ header: 'Arguments', optionList: argument_option_defs }]);
  console.log(usage);
  return;
}

let x11vnc_proc = null;
let xvfb_proc = null;
let wm_proc = null;

async function sleep(ms) {
  return new Promise((res, rej) => {
    setTimeout(res, ms);
  });
}

const kill_and_wait = async (proc) => {
  return new Promise((res, rej) => {
    proc.on('exit', () => {
      res();
    });
    proc.kill(9);
  });
};

const attach_listeners = (proc) => {
  const name = proc.spawnfile;

  proc.on('exit', (code) => {
    console.log(`Process "${name}" exited with code ${code}`);
  });
  proc.stdout.on('data', (data) => {
    console.log(`[stdout] ${name}: ${data}`);
  });
  proc.stderr.on('data', (data) => {
    console.log(`[stderr] ${name}: ${data}`);
  });
};

const spawn_gui = async (width, height) => {
  // First, create the Xorg server
  if (xvfb_proc) {
    await kill_and_wait(xvfb_proc);
  }
  xvfb_proc = child_process.spawn('/usr/bin/Xvfb', [':1', '-screen', '0', `${width}x${height}x24`]);
  attach_listeners(xvfb_proc);

  // Then, create the VNC server
  if (x11vnc_proc) {
    await kill_and_wait(x11vnc_proc);
  }
  x11vnc_proc = child_process.spawn(
    '/usr/bin/x11vnc',
    [
      '-display',
      ':1',
      '-xkb',
      '-forever',
      '-shared',
      '-repeat',
      '-capslock',
      '-nowireframe',
      '-nowirecopyrect',
      '-noscrollcopyrect',
      '-noxdamage',
    ],
    {
      env: {
        X11VNC_FINDDISPLAY_ALWAYS_FAILS: '1',
      },
    },
  );
  attach_listeners(x11vnc_proc);

  // Now finally, create the window manager. We don't need to kill this.
  // For some reason it gets mad if we _do_ try to kill it.  So, I'm not touching it.
  wm_proc = child_process.spawn(options.de, [], {
    env: {
      DISPLAY: ':1',
    },
  });
  attach_listeners(wm_proc);
};

// Static files
app.use('/', express.static('public'));
app.use('/novnc', express.static('node_modules/@novnc/novnc'));
app.use('/spinjs', express.static('node_modules/spin.js/'));

app.get('/resize', (req, res) => {
  const query = req.query;
  if (!('width' in query) || !('height' in query)) {
    res.sendStatus(400);
  }
  const width = parseInt(query['width']);
  const height = parseInt(query['height']);
  if (isNaN(width) || isNaN(height)) {
    res.sendStatus(400);
  }

  if (!x11vnc_proc) {
    // Let's only resize the window on launch.  We don't want the user to refresh
    // and have all their running apps disappear because the x server was restarted.
    spawn_gui(width, height);
  }
  res.sendStatus(200);
});

// Websocket proxy
server.on('upgrade', (req, socket, head) => {
  ws_proxy.ws(req, socket, head);
});
ws_proxy.on('error', (err, req, res) => {
  console.log(err);
});

server.listen(options.port);
console.log(`NoVNC server listening at http://localhost:${options.port}`);
