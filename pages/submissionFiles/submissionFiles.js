const express = require('express');
const asyncHandler = require('express-async-handler');

const sqldb = require('../../prairielib/lib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);
const router = express.Router({ mergeParams: true });

router.get(
  '/*',
  asyncHandler(async (req, res) => {
    const submissionId = req.params.submission_id;
    const fileName = req.params[0];
    console.log(submissionId, fileName);

    const fileRes = await sqldb.queryZeroOrOneRowAsync(sql.select_submission_file, {
      question_id: res.locals.question.id,
      instance_question_id: res.locals.instance_question?.id,
      has_instance_question: !!res.locals.instance_question,
      submission_id: submissionId,
      file_name: fileName,
    });

    if (fileRes.rowCount === 0) {
      res.sendStatus(404);
      return;
    }

    const contents = fileRes.rows[0].contents;
    if (!contents) {
      res.sendStatus(404);
      return;
    }

    res.status(200).send(Buffer.from(contents, 'base64'));
  })
);

module.exports = router;
