const express = require('express');
const express_ws = require('express-ws');
const pty = require('node-pty');
const path = require('path');
const cl_args = require('command-line-args');
const cl_usage = require('command-line-usage');

const app = express();
express_ws(app);

const argument_option_defs = [
    { name: 'help', alias: 'h', type: Boolean, description: 'display this usage guide' },
    { name: 'port', alias: 'p', type: Number, defaultValue: 8080, description: 'port that the server is run on (default 8080)' },
    { name: 'command', alias: 'c', type: String, defaultValue: '/bin/bash', description: 'command to execute in the terminal (default /bin/bash)' },
    { name: 'working-dir', alias: 'w', type: String, defaultValue: process.env.HOME, description: 'initial working directory (default $HOME)' },
];
const options = cl_args(argument_option_defs);
if (options.help) {
    const usage = cl_usage([{ header: 'Arguments', optionList: argument_option_defs }]);
    console.log(usage);
    return;
}

/* Static files */
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.use('/xterm', express.static('node_modules/xterm'));
app.use('/xterm-fit', express.static('node_modules/xterm-addon-fit'));

/* Create a new pseudoterminal on each websocket connection */
app.ws('/', (ws, req) => {
    let term = pty.spawn(options.command, [], {
        name: 'xterm-color',
        cols: 80,
        rows: 24,
        cwd: options['working-dir'],
        env: process.env
    });

    term.on('data', function(data) {
        ws.send(data);
    });

    ws.on('message', (msg) => {
        const val = JSON.parse(msg);
        if (val.event === 'keypress') {
            term.write(val.value.key);
        } else if (val.event === 'resize') {
            term.resize(val.value.cols, val.value.rows);
        }
    });

    ws.on('close', (msg) => {
        term.destroy();
    });
});

app.listen(options.port, () => console.log(`XTerm server listening at http://localhost:${options.port}`));
