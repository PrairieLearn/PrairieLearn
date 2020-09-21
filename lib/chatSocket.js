const _ = require('lodash');

const config = require('./config');
const csrf = require('./csrf');
const logger = require('./logger');
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

  if (!ensureProps(socket.handshake.query, ['name', 'id', 'channel_token'])) {
    return;
  }

  var name = socket.handshake.query['name'];
  var room_id = socket.handshake.query['id'].toString();
  var channel_token = socket.handshake.query['channel_token'];
  if (!checkToken(channel_token, room_id)) {
    return;
  }

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
        module.exports._namespace.to(room_id).emit('update', {
          count: online_user_count[room_id].toString(),
          name_list: online_user_name[room_id].toString(),
        });
      }
    }
  });
};

function ensureProps(data, props) {
  for (const prop of props) {
    if (!_.has(data, prop)) {
      logger.error(`socket.io chat connected without ${prop}`);
      return false;
    }
  }
  return true;
}

function checkToken(token, channel_id) {
  const data = {
    channel_id: channel_id,
  };
  const ret = csrf.checkToken(token, data, config.secretKey, {
    maxAge: 24 * 60 * 60 * 1000,
  });
  if (!ret) {
    logger.error(`CSRF token for channel ${channel_id} failed validation.`);
  }
  return ret;
}
