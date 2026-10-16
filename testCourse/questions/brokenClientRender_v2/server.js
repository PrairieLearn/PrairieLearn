define(['QServer'], function (QServer) {
  var server = new QServer();

  server.getData = function () {
    return {
      params: {},
      trueAnswer: { s: 100 },
    };
  };

  return server;
});
