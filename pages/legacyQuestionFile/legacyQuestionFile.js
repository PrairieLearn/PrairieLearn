var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();

var error = require('../../prairielib/lib/error');
var sqldb = require('../../prairielib/lib/sql-db');
var sqlLoader = require('../../prairielib/lib/sql-loader');

const chunks = require('../../lib/chunks');
var filePaths = require('../../lib/file-paths');

var sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/:filename', function (req, res, next) {
  var question = res.locals.question;
  var course = res.locals.course;
  var filename = req.params.filename;
  var params = {
    question_id: question.id,
    filename: filename,
    type: question.type,
  };
  sqldb.queryOneRow(sql.check_client_files, params, function (err, result) {
    if (ERR(err, next)) return;
    if (!result.rows[0].access_allowed) {
      return next(
        error.make(403, 'Access denied', {
          locals: res.locals,
          filename: filename,
        })
      );
    }

    const coursePath = chunks.getRuntimeDirectoryForCourse(course);

    chunks.getTemplateQuestionIds(question, (err, questionIds) => {
      if (ERR(err, next)) return;

      const templateQuestionChunks = questionIds.map((id) => ({
        type: 'question',
        questionId: id,
      }));
      const chunksToLoad = [
        {
          type: 'question',
          questionId: question.id,
        },
      ].concat(templateQuestionChunks);
      chunks.ensureChunksForCourse(course.id, chunksToLoad, (err) => {
        if (ERR(err, next)) return;

        filePaths.questionFilePath(
          filename,
          question.directory,
          coursePath,
          question,
          function (err, fullPath, effectiveFilename, rootPath) {
            if (ERR(err, next)) return;
            res.sendFile(effectiveFilename, { root: rootPath });
          }
        );
      });
    });
  });
});

module.exports = router;
