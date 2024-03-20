const express = require('express');
const express_ws = require('express-ws');
const pty = require('node-pty');
const path = require('path');
const cl_args = require('command-line-args');
const cl_usage = require('command-line-usage');

const app = express();
express_ws(app);

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
    name: 'command',
    alias: 'c',
    type: String,
    defaultValue: '/bin/bash',
    description: 'command to execute in the terminal (default /bin/bash)',
  },
  {
    name: 'working-dir',
    alias: 'w',
    type: String,
    defaultValue: process.env.HOME,
    description: 'initial working directory (default $HOME)',
  },
];
const options = cl_args(argument_option_defs);
if (options.help) {
  const usage = cl_usage([{ header: 'Arguments', optionList: argument_option_defs }]);
  console.log(usage);
  return;
}

const default_env = {
  LC_CTYPE: 'C.UTF-8',
};

// Static files
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.use('/xterm', express.static('node_modules/xterm'));
app.use('/xterm-fit', express.static('node_modules/xterm-addon-fit'));

// Create one pseudoterminal that all connections share
let websockets = {};
let ws_id = 0;
let term_output;
let term;

// Wrap the initialization so we can restart the terminal if the client kills
// it (for example with ctrl-d)
const spawn_terminal = () => {
  term_output = '';
  term = pty.spawn(options.command, [], {
    name: 'xterm-color',
    cols: 80,
    rows: 24,
    cwd: options['working-dir'],
    env: Object.assign({}, default_env, process.env),
  });
  term.on('data', function (data) {
    term_output += data;
    Object.values(websockets).forEach((ws) => {
      if (ws.readyState === 1) {
        ws.send(data);
      }
    });
  });
  term.on('exit', () => {
    Object.values(websockets).forEach((ws) => {
      if (ws.readyState === 1) {
        ws.send('[Process completed]\r\n\r\n');
      }
    });
    spawn_terminal();
  });
};
spawn_terminal();

// Listen for any incoming websocket connections
app.ws('/', (ws, req) => {
  const id = ws_id++;
  websockets[id] = ws;
  ws.send(term_output);

  ws.on('message', (msg) => {
    const val = JSON.parse(msg);
    if (val.event === 'data') {
      term.write(val.value);
    } else if (val.event === 'resize') {
      term.resize(val.value.cols, val.value.rows);
    } else if (val.event === 'heartbeat') {
      // do nothing
    }
  });
  ws.on('close', (msg) => {
    delete websockets[id];
  });
});

app.listen(options.port, () =>
  console.log(`XTerm server listening at http://localhost:${options.port}`),
);
