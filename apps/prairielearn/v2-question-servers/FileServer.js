define(['fs', 'module', 'path'], function (fs, module, path) {
  var server = {};

  server.getData = function (vid, options, questionDir) {
    var fileName = options.fileName;

    // The file contents will be put in a data: link for downloading, so we encode it as a URI
    var fileBuffer = fs.readFileSync(path.join(questionDir, fileName));
    var fileData = encodeURIComponent(fileBuffer.toString('base64'));

    var params = {
      fileData: fileData,
      fileName: fileName,
    };

    var trueAnswer = {};

    return {
      params: params,
      trueAnswer: trueAnswer,
    };
  };

  server.gradeAnswer = function (vid, params, trueAnswer, submittedAnswer, options) {
    return { score: 1 };
  };

  return server;
});
