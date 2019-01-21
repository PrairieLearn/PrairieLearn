var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();

var sqldb = require('@prairielearn/prairielib').sqldb;
var sqlLoader = require('@prairielearn/prairielib').sqlLoader;

var sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {

    var params = {
        course_instance_id: res.locals.course_instance.id,
    };

    sqldb.query(sql.get_sd_reduction_status, params, function(err, result) {
        if (ERR(err, next)) return;

        res.locals.generated_assessment_sd_reduction_enabled = result.rows[0].sd_reduction_status;
        if (res.locals.generated_assessment_sd_reduction_enabled) {
          res.locals.generated_assessment_sd_reduction_text = "enabled";
          res.locals.generated_assessment_sd_reduction_change_text = "Disable";
          res.locals.generated_assessment_sd_reduction_change_text_lower = "disable";
        } else {
          res.locals.generated_assessment_sd_reduction_text = "disabled";
          res.locals.generated_assessment_sd_reduction_change_text = "Enable";
          res.locals.generated_assessment_sd_reduction_change_text_lower = "enable";
        }

        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

router.post('/', function(req, res, next) {
    if (!res.locals.authz_data.has_instructor_edit) return next();

    if (req.body.__action == 'change_generated_assessment_sd_reduction') {
      var params = {
          course_instance_id: res.locals.course_instance.id
      };

      sqldb.query(sql.toggle_sd_reduction_status, params, function(err, result) {
          if (ERR(err, next)) return;
          res.redirect(req.originalUrl);
      });
    } else {
      return next(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
    }
});

module.exports = router;
