const socketServer = require('./socket-server');

module.exports = {};

module.exports.init = function (callback) {
  module.exports._namespace = socketServer.io.of('/chat');
  module.exports._namespace.on('connection', module.exports.connection);

  callback(null);
};
var online_user_count = {};
var online_user_name = {};
var message_count = {};
module.exports.connection = function (socket) {
  var name = socket.handshake.query['name'];
  var room_id = socket.handshake.query['id'].toString();
  if (!(room_id in online_user_count)) {
    online_user_name[room_id] = [];
    online_user_count[room_id] = 0;
    if (!(room_id in message_count)) {
      message_count[room_id] = 0;
    }
  }

  socket.join(room_id, () => {
    online_user_count[room_id] += 1;
    socket.username = name;
    online_user_name[room_id].push(name);
    module.exports._namespace.to(room_id).emit('update', {
        count: online_user_count[room_id].toString(),
        name_list: online_user_name[room_id].toString(),
      });
  });
  socket.on('send', (msg) => {
    module.exports._namespace.to(room_id).emit('boardcast', {
        id: message_count[room_id],
        message: msg.slice(0, 500),
        username: socket.username,
      });
    message_count[room_id] += 1;
  });

  socket.on('send reaction', (msg) => {
    module.exports._namespace.to(room_id).emit('boardcast reaction', {
        id: msg.id,
        reaction: msg.reaction,
      });
  });

  socket.on('send reaction recall', (msg) => {
    module.exports._namespace.to(room_id).emit('boardcast reaction recall', {
        id: msg.id,
        reaction: msg.reaction,
      });
  });

  socket.on('disconnect', () => {
    online_user_count[room_id] -= 1;

    var index = online_user_name[room_id].indexOf(socket.username);
    if (index >= 0) {
      online_user_name[room_id].splice(index, 1);
      if (online_user_count[room_id] == 0) {
        delete online_user_count[room_id];
        delete online_user_name[room_id];
      } else {
        module.exports._namespace
          .to(room_id)
          .emit('update', {
            count: online_user_count[room_id].toString(),
            name_list: online_user_name[room_id].toString(),
          });
      }
    }
  });
};
