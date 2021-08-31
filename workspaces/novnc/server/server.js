const express = require('express');
const express_ws = require('express-ws');
const http = require('http');
const http_proxy = require('http-proxy');
const path = require('path');
const cl_args = require('command-line-args');
const cl_usage = require('command-line-usage');

const app = express();
express_ws(app);
const server = http.createServer(app);
const ws_proxy = http_proxy.createProxyServer({ target: 'http://localhost:5901', ws: true });

const argument_option_defs = [
    { name: 'help', alias: 'h', type: Boolean, description: 'display this usage guide' },
    { name: 'port', alias: 'p', type: Number, defaultValue: 8080, description: 'port that the server is run on (default 8080)' },
];
const options = cl_args(argument_option_defs);
if (options.help) {
    const usage = cl_usage([{ header: 'Arguments', optionList: argument_option_defs }]);
    console.log(usage);
    return;
}

/* Static files */
app.use('/', express.static('public'));
app.use('/novnc', express.static('node_modules/@novnc/novnc'));

/* Websocket proxy */
server.on('upgrade', (req, socket, head) => {
    ws_proxy.ws(req, socket, head);
});

server.listen(options.port);
console.log(`NoVNC server listening at http://localhost:${options.port}`);
