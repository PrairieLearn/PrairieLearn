var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();

var question = require('../../lib/question');
var sqldb = require('../../prairielib/lib/sql-db');
var sqlLoader = require('../../prairielib/lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/variant/:variant_id/*', function (req, res, next) {
  var variant_id = req.params.variant_id;
  var filename = req.params[0];
  var params = {
    // The instance question generally won't be present if this is used on
    // an instructor route.
    has_instance_question: !!res.locals.instance_question,
    instance_question_id: res.locals.instance_question?.id,
    question_id: res.locals.question.id,
    variant_id: variant_id,
  };
  sqldb.queryOneRow(sql.select_variant, params, function (err, result) {
    if (ERR(err, next)) return;
    var variant = result.rows[0];

    question.getFile(
      filename,
      variant,
      res.locals.question,
      res.locals.course,
      res.locals.authn_user.user_id,
      function (err, fileData) {
        if (ERR(err, next)) return;
        res.attachment(filename);
        res.send(fileData);
      }
    );
  });
});

module.exports = router;
