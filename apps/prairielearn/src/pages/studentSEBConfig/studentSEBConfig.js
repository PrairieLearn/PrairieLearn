const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
//const path = require('path');
const plist = require('plist');
const fs = require('fs');
const zlib = require('zlib');
const crypto = require('crypto');
//const jscryptor = require('jscryptor'); // temporarily disabled, see commit 192dda72f
const _ = require('lodash');

const { generateSignedToken, getCheckedSignedTokenData } = require('@prairielearn/signed-token');
const { config } = require('../../lib/config');
const sqldb = require('@prairielearn/postgres');
const error = require('@prairielearn/error');

var sql = sqldb.loadSqlEquiv(__filename);

var load_default_config = function (res, _req) {
  var defobj = plist.parse(fs.readFileSync(__dirname + '/seb-default-exam.seb', 'utf8'));

  var fullUrlPrefix = config.SEBServerUrl;

  defobj['startURL'] =
    `${fullUrlPrefix}/pl/course_instance/${res.locals.course_instance.id}/assessment/${res.locals.assessment.id}`;

  var hashdata = {
    assessment_id: res.locals.assessment.id,
    user_id: res.locals.authz_data.user.user_id,
  };
  defobj['browserUserAgent'] = 'prairielearn:' + generateSignedToken(hashdata, config.secretKey);

  defobj['browserUserAgentWinDesktopMode'] = 1;
  defobj['browserUserAgentMac'] = 1;
  defobj['browserUserAgentWinTouchMode'] = 1;
  //defobj['sendBrowserExamKey'] = true;
  defobj['removeBrowserProfile'] = true;

  defobj['URLFilterRules'] = [
    {
      active: true,
      regex: false,
      expression: config.SEBServerFilter,
      action: 1,
    },
    {
      active: true,
      regex: false,
      expression: 'shibboleth.illinois.edu/*',
      action: 1,
    },
  ];

  defobj['quitURL'] = fullUrlPrefix + '/pl/SEBquit';

  //console.log(defobj);
  return defobj;
};

var add_allowed_program = function (SEBconfig, program) {
  var template_program = {
    active: true,
    autostart: false,
    iconInTaskbar: true,
    runInBackground: false,
    allowUserToChooseApp: false,
    strongKill: false,
    os: 1,
    description: '',
    windowHandlingProcess: '',
    path: '',
    identifier: '',
    arguments: [],
  };

  if (program === 'excel') {
    var progObj = _.clone(template_program);
    progObj['title'] = 'EXCEL';
    progObj['executable'] = 'excel.exe';
    progObj['originalName'] = 'Excel.exe';
  }

  SEBconfig['permittedProcesses'].push(progObj);
};

router.get('/', function (req, res, next) {
  var encodedData = req.query.data || null;

  var data = getCheckedSignedTokenData(encodedData, config.secretKey);

  if (data === null) {
    return next(error.make(403, 'Unrecognized config request, please try again'));
  }

  var params = {
    assessment_id: data.assessment_id || null,
    course_instance_id: data.course_instance_id,
    authz_data: data.authz_data,
    req_date: res.locals.req_date,
  };

  res.locals.authz_data = data.authz_data;

  sqldb.queryZeroOrOneRow(sql.select_and_auth, params, function (err, result) {
    if (ERR(err, next)) return;
    if (result.rowCount === 0) {
      return next(error.make(403, 'Unrecognized config request, please try again'));
    }

    _.assign(res.locals, result.rows[0]);
    //console.log(res.locals);

    // FIXME check that res.locals.authz_result.seb_config exists or exit with error

    //check_and_send_assessment_config_seb(res, function(err) {
    //    if (ERR(err, next)) return;

    var SEBconfig = load_default_config(res, req);

    if ('quitPassword' in res.locals.authz_result.seb_config) {
      SEBconfig['hashedQuitPassword'] = crypto
        .createHash('sha256')
        .update(res.locals.authz_result.seb_config.quitPassword)
        .digest('hex');
    }

    if ('allowedPrograms' in res.locals.authz_result.seb_config) {
      //console.log(res.locals.authz_result.seb_config);
      _.each(res.locals.authz_result.seb_config.allowedPrograms, function (program) {
        add_allowed_program(SEBconfig, program);
      });
    }

    // If password is defined, use that dressing
    if ('password' in res.locals.authz_result.seb_config) {
      var password = res.locals.authz_result.seb_config.password;
      dressPassword(SEBconfig, password, function (err, result) {
        if (ERR(err, next)) return;
        return res.send(result);
      });
    }
  });
});

module.exports = router;

function dressPassword(obj, password, callback) {
  zlib.gzip(plist.build(obj), function (err, result) {
    if (ERR(err)) return;
    var SEBinner = result;
    var SEBencrypted = SEBinner; // jscryptor.Encrypt(SEBinner, password); // temporarily disabled, see commit 192dda72f
    var SEBheader = Buffer.from('pswd', 'utf8');
    var SEBfile = Buffer.concat([SEBheader, Buffer.from(SEBencrypted, 'base64')]);
    zlib.gzip(SEBfile, function (err, result) {
      if (ERR(err)) return;
      return callback(null, result);
    });
  });
}
