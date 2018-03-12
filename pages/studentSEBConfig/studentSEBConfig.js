var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();
//var path = require('path');
const plist = require('plist');
const fs = require('fs');
//const util = require('util');
const zlib = require('zlib');
//const crypto = require('crypto');
const jscryptor = require('jscryptor');

var sqldb = require('../../lib/sqldb');
var sqlLoader = require('../../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/:assessment_id', function(req, res, next) {

    //console.log(req.params.assessment_id);

    var params = { assessment_id: req.params.assessment_id || null };

    sqldb.queryZeroOrOneRow(sql.select_assessment, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.rows = result.rows;

        var a = result.rows[0];
        //console.log(a);

        if (a) { //result.rows.length > 0) {

            var defobj = plist.parse(fs.readFileSync(__dirname + '/seb-default-exam.seb', 'utf8'));
            //console.log(JSON.stringify(defobj));

            defobj['startURL'] = `http://endeavour.engr.illinois.edu:3000/pl/course_instance/${a.ci_id}/assessment/${a.a_id}`;
            defobj['browserUserAgent'] = a.a_uuid;
            defobj['browserUserAgentWinDesktopMode'] = 1;
            defobj['browserUserAgentMac'] = 1;
            defobj['browserUserAgentWinTouchMode'] = 1;
            defobj['sendBrowserExamKey'] = true;

            defobj['URLFilterEnable'] = true;
            var allowedURLs = [
                /^http:\/\/endeavour\.engr\.illinois\.edu:3000\/.*?$/,
                /^https:\/\/shibboleth\.illinois\.edu\/.*?$'/,
                /^\/pl\/logout$/,
            ];
            defobj['whitelistURLFilter'] = allowedURLs.join(';');

            defobj['quitURL'] = 'http://endeavour.engr.illinois.edu:3000/pl/logout';

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

            // compress the config
            var SEBconfig = zlib.gzipSync(plist.build(defobj));

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

            var SEBencrypted = jscryptor.Encrypt(SEBconfig, 'fishsticks');
            var SEBheader = Buffer.from('pswd', 'utf8');
            var SEBfile = Buffer.concat([SEBheader, Buffer.from(SEBencrypted, 'base64')]);

            //console.log(SEBfile);
            return res.send(zlib.gzipSync(SEBfile));

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
        } else {
            res.send('Unable to find SEB config');
        }
    });
});

module.exports = router;
