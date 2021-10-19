var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();

const chunks = require('../../lib/chunks');
var filePaths = require('../../lib/file-paths');

router.get('/:filename', function (req, res, next) {
  const question = res.locals.question;
  const course = res.locals.course;
  const filename = 'text/' + req.params.filename;
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
        },
      );
    });
  });
});

module.exports = router;
