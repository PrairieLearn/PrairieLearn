var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();
var path = require('path');
const plist = require('plist');
const fs = require('fs');
//const util = require('util');
const zlib = require('zlib');
//const crypto = require('crypto');
const jscryptor = require('jscryptor');
var _ = require('lodash');

var csrf = require('../../lib/csrf');
var config = require('../../lib/config');
var sqldb = require('../../lib/sqldb');
var sqlLoader = require('../../lib/sql-loader');
var error = require('../../lib/error');

var sql = sqlLoader.loadSqlEquiv(__filename);

var check_and_send_assessment_config_seb = function(adata, res, callback) {

    var filename = 'config.seb';
    var sebPath = path.join(
        adata.path,
        'courseInstances',
        adata.ci_short_name,
        'assessments',
        adata.tid
    );

    if (fs.existsSync(`${sebPath}/${filename}`, 'utf8')) {

        return res.sendFile(filename, {root: sebPath}, function(err) {
            if (ERR(err, next)) return;
        });
    }
    console.log("no assessment specific config.seb found");
    callback(null);
}

var load_default_config = function(adata, req) {
    var defobj = plist.parse(fs.readFileSync(__dirname + '/seb-default-exam.seb', 'utf8'));
    //console.log(JSON.stringify(defobj));

    var fullUrlPrefix = 'http://' + req.get('host');


    defobj['startURL'] = `${fullUrlPrefix}/pl/course_instance/${adata.ci_id}/assessment/${adata.a_id}`;
    defobj['browserUserAgent'] = adata.a_uuid;
    defobj['browserUserAgentWinDesktopMode'] = 1;
    defobj['browserUserAgentMac'] = 1;
    defobj['browserUserAgentWinTouchMode'] = 1;
    //defobj['sendBrowserExamKey'] = true;

    defobj['URLFilterEnable'] = true;
    var allowedURLs = [
        new RegExp('^' + _.escapeRegExp(fullUrlPrefix) + '\/.*?$'),
        /^https:\/\/shibboleth\.illinois\.edu\/.*?$/,
        /^\/SEBquit$/
    ];
    defobj['whitelistURLFilter'] = allowedURLs.join(';');
    console.log(defobj.whitelistURLFilter);

    defobj['quitURL'] = '/SEBquit'; //http://endeavour.engr.illinois.edu:3000/pl/logout';

    defobj['permittedProcesses'].push({
        active: true,
        autostart: false,
        iconInTaskbar: true,
        runInBackground: false,
        allowUserToChooseApp: false,
        strongKill: false,
        os: 1,
        title: 'EXCEL',
        description: '',
        executable: 'excel.exe',
        originalName: 'Excel.exe',
        windowHandlingProcess: '',
        path: '',
        identifier: '',
        arguments: [],
    });

    return defobj;
}


router.get('/', function(req, res, next) {

    var encodedData = req.query.data || null;

    var data = csrf.getCheckedData(encodedData, config.secretKey, {});

    if (data === null) {
        return next(error.make(403, 'Unrecognized config request, please try again', res.locals));
    }

    if (!('assessment_id' in data)) {
        return next(error.make(403, 'Unrecognized config request, please try again', res.locals));
    }

    var params = { assessment_id: data.assessment_id || null };

    sqldb.queryZeroOrOneRow(sql.select_assessment, params, function(err, result) {
        if (ERR(err, next)) return;
        if (result.rowCount == 0) return next(error.make(403, 'Unrecognized config request, please try again', res.locals));

        var a = result.rows[0];
        //console.log(a);

        check_and_send_assessment_config_seb(a, res, function(err) {

            var SEBconfig = load_default_config(a, req);


        // compress the config
        var SEBinner= zlib.gzipSync(plist.build(SEBconfig));

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

        var SEBencrypted = jscryptor.Encrypt(SEBinner, 'fishsticks');
        var SEBheader = Buffer.from('pswd', 'utf8');
        var SEBfile = Buffer.concat([SEBheader, Buffer.from(SEBencrypted, 'base64')]);

        //console.log(SEBfile);
        return res.send(zlib.gzipSync(SEBfile));

    });
        //console.log(JSON.stringify(defobj, null, 4));
        //return res.send(plist.build(defobj));


        /*
        var SEBconfig = zlib.gzipSync(plist.build(defobj));
        var SEBheader = Buffer.from('plnd', 'utf8');
        var SEBfile = Buffer.concat([SEBheader, SEBconfig]);
        return res.send(zlib.gzipSync(SEBfile));
*/

/*
        var filename = 'config.seb';
        var sebFile = path.join(
            a.path,
            'courseInstances',
            a.ci_short_name,
            'assessments',
            a.tid
        );

        var obj = plist.parse(fs.readFileSync(sebFile + '/' + filename, 'utf8'));
        console.log(JSON.stringify(obj));


            return res.sendFile(filename, {root: sebFile}, function(err) {
                if (ERR(err, next)) return;
            });
*/
    });
});

module.exports = router;
