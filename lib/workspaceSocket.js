const socketServer = require('./socket-server');
const request = require('request')

module.exports = {};

module.exports.init = function (callback) {
  module.exports._namespace = socketServer.io.of('/workspace');
  module.exports._namespace.on('connection', module.exports.connection);

  callback(null);
};

async function controlContainer(callback, action) {
    let promise = new Promise(resolve => {
        request.post('http://localhost:8081', {
            json: {
                workspace_id: 0,
                action: action
            },
        }, (error, response, body) => {
            if (error) {
                console.log(error);
                return;
            }
            console.log(`statusCode: ${response.statusCode}`);
            console.log(body);
            if (response.statusCode == 200) {
                resolve(true);
            } else {
                resolve(false);
            };
        });
    });
    let res = await promise;
    if (res) {
        if (action == "init") {
            console.log("Container started");
            callback.emit('host-ready', "");
        } else if (action == "stop") {
            console.log("Container stopped");
        }
    } else {
        console.log("Failed to execuate " + action);
    };
};

module.exports.connection = function (socket) {
    var workspace_id = socket.handshake.query['id'];

    socket.join(workspace_id, () => {
        let rooms = Object.keys(socket.rooms);
        console.log(rooms);
        console.log('Connection to workspace ' + workspace_id + ' established.');
        console.log('Initlizing remote workspace host');
        controlContainer(module.exports._namespace.to(workspace_id), "init");
    });

    socket.on('heartbeat', function () {
        console.log('Ping from workspace ' + workspace_id + ' received.');
        controlContainer(module.exports._namespace.to(workspace_id), "sync");
        module.exports._namespace.to(workspace_id).emit('update', 'I got your msg!');
    });

    socket.on('disconnect', () => {
        console.log('user disconnected');
        controlContainer(module.exports._namespace.to(workspace_id), "stop");
    });
};
