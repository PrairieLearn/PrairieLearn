const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const path = require('path');
const plist = require('plist');
const fs = require('fs');
//const util = require('util');
const zlib = require('zlib');
const crypto = require('crypto');
const jscryptor = require('jscryptor');
const _ = require('lodash');

const csrf = require('../../lib/csrf');
const config = require('../../lib/config');
const sqldb = require('@prairielearn/prairielib').sqlDb;
const sqlLoader = require('@prairielearn/prairielib').sqlLoader;
const error = require('@prairielearn/prairielib').error;

var sql = sqlLoader.loadSqlEquiv(__filename);

var check_and_send_assessment_config_seb = function(res, callback) {

    var filename = 'config.seb';
    var sebPath = path.join(
        res.locals.course.path,
        'courseInstances',
        res.locals.course_instance.short_name,
        'assessments',
        res.locals.assessment.tid
    );

    if (fs.existsSync(`${sebPath}/${filename}`, 'utf8')) {

        return res.sendFile(filename, {root: sebPath}, function(err) {
            if (ERR(err, callback)) return;
        });
    }
    //console.log('no assessment specific config.seb found');
    callback(null);
};

var load_default_config = function(res, req) {
    var defobj = plist.parse(fs.readFileSync(__dirname + '/seb-default-exam.seb', 'utf8'));
    //console.log(JSON.stringify(defobj));

    var fullUrlPrefix = req.protocol + '://' + req.get('host');

    defobj['startURL'] = `${fullUrlPrefix}/pl/course_instance/${res.locals.course_instance.id}/assessment/${res.locals.assessment.id}`;

    //console.log(qdata);
    var hashdata = {
        assessment_id: res.locals.assessment.id,
        user_id: res.locals.authz_data.user.user_id,
    };

    defobj['browserUserAgent'] = 'prairielearn:' + csrf.generateToken(hashdata, config.secretKey);
    defobj['browserUserAgentWinDesktopMode'] = 1;
    defobj['browserUserAgentMac'] = 1;
    defobj['browserUserAgentWinTouchMode'] = 1;
    //defobj['sendBrowserExamKey'] = true;
    defobj['removeBrowserProfile'] = true;

    defobj['URLFilterRules'] = [
        {   active: true,
            regex: false,
            expression: req.get('host') + '/*',
            action: 1 },
        {   active: true,
            regex: false,
            expression: 'shibboleth.illinois.edu/*',
            action: 1 },
    ];

    defobj['quitURL'] = fullUrlPrefix + '/pl/SEBquit';

    //console.log(defobj);
    return defobj;
};

var add_allowed_program = function(SEBconfig, program) {

    var template_program = {
        active: true,
        autostart: false,
        iconInTaskbar: true,
        runInBackground: false,
        allowUserToChooseApp: false,
        strongKill: false,
        os: 1,
//        title: 'EXCEL',
        description: '',
//        executable: 'excel.exe',
//        originalName: 'Excel.exe',
        windowHandlingProcess: '',
        path: '',
        identifier: '',
        arguments: [],
    };

    if (program == 'excel') {
        var progObj = _.clone(template_program);
        progObj['title'] = 'EXCEL';
        progObj['executable'] = 'excel.exe';
        progObj['originalName'] = 'Excel.exe';
    }

    SEBconfig['permittedProcesses'].push(progObj);
};

router.get('/', function(req, res, next) {

    var encodedData = req.query.data || null;

    var data = csrf.getCheckedData(encodedData, config.secretKey);

    if (data === null) {
        return next(error.make(403, 'Unrecognized config request, please try again', res.locals));
    }

    var params = {
        assessment_id: data.assessment_id || null,
        course_instance_id: data.course_instance_id,
        authz_data: data.authz_data,
        req_date: res.locals.req_date,
    };

    res.locals.authz_data = data.authz_data;

    sqldb.queryZeroOrOneRow(sql.select_and_auth, params, function(err, result) {
        if (ERR(err, next)) return;
        if (result.rowCount == 0) return next(error.make(403, 'Unrecognized config request, please try again', res.locals));

        _.assign(res.locals, result.rows[0]);
        //console.log(res.locals);

        check_and_send_assessment_config_seb(res, function(err) {
            if (ERR(err, next)) return;

            var SEBconfig = load_default_config(res, req);

            if ('quitPassword' in res.locals.authz_result.seb_config) {
                SEBconfig['hashedQuitPassword'] = crypto.createHash('sha256').update(res.locals.authz_result.seb_config.quitPassword).digest('hex');
            }

            if ('allowedPrograms' in res.locals.authz_result.seb_config) {
                //console.log(res.locals.authz_result.seb_config);
                _.each(res.locals.authz_result.seb_config.allowedPrograms, function(program) {
                    add_allowed_program(SEBconfig, program);
                });
            }

            //
            // Finish up the file, dress it, and send it along
            //
            var SEBdressing = 'xml'; // default case
            if ('dressing' in res.locals.authz_result.seb_config) {
                SEBdressing = res.locals.authz_result.seb_config.dressing;
            }

            if (SEBdressing == 'xml')
                return res.send(dressPlainXML(SEBconfig));

            if (SEBdressing == 'gzip')
                return res.send(dressPlainGzip(SEBconfig));

            if (SEBdressing == 'password') {
                var password = 'fishsticks'; // default case
                if ('password' in res.locals.authz_result.seb_config) {
                    password = res.locals.authz_result.seb_config.password;
                }
                return res.send(dressPassword(SEBconfig, password));
            }
        });
    });
});

module.exports = router;

function dressPlainXML(obj) {
    return plist.build(obj);
}

function dressPlainGzip(obj) {
    var SEBinner = zlib.gzipSync(plist.build(obj));
    var SEBheader = Buffer.from('plnd', 'utf8');
    var SEBfile = Buffer.concat([SEBheader, Buffer.from(SEBinner, 'base64')]);
    return zlib.gzipSync(SEBfile);
}

function dressPassword(obj, password) {
    var SEBinner = zlib.gzipSync(plist.build(obj));
    var SEBencrypted = jscryptor.Encrypt(SEBinner, password);
    var SEBheader = Buffer.from('pswd', 'utf8');
    var SEBfile = Buffer.concat([SEBheader, Buffer.from(SEBencrypted, 'base64')]);
    return zlib.gzipSync(SEBfile);
}

//function dressRSA(obj) {
    // Not implemented

    /* Asymm key stuff
     *
    // create random symmetric key and encrypt the config with it
    var sym_key = crypto.randomBytes(32); //.toString('hex').toUpperCase();
    //console.log(`${sym_key.length} bytes: ${sym_key.toString('hex')}`);

    var payload = jscryptor.Encrypt(SEBconfig, sym_key.toString('base64'));
    //console.log(payload);

    var publicKey = fs.readFileSync('/PrairieLearn/pages/studentSEBConfig/cert.pem', 'utf8');

    var publicKeyHash = crypto.createHash('sha1').update(publicKey).digest('hex');
    console.log(publicKeyHash);
    console.log(publicKeyHash.length);

    var encrypted_sym_key = crypto.publicEncrypt(publicKey, sym_key);

    console.log(`${encrypted_sym_key.length} bytes: ${encrypted_sym_key.toString('hex')}`);
    */
//}
