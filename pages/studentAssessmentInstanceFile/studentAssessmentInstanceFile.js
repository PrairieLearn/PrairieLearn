const ERR = require('async-stacktrace');
const _ = require('lodash');
const express = require('express');
const router = express.Router();
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const archiver = require('archiver');

const csvMaker = require('../../lib/csv-maker');
const { paginateQuery } = require('../../lib/paginate');
const assessment = require('../../lib/assessment');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/:assessment_file_id/:display_filename', function(req, res, next) {
        let params = {
            assessment_instance_id: res.locals.assessment_instance.id,
            assessment_file_id: req.params.assessment_file_id,
            display_filename: req.params.display_filename,
        };
    sqldb.query(sql.select_assessment_file, params, function(err, result) {
        if (ERR(err, next)) return;

        if (result.rows.length < 1) {
            return next(new Error('No such file: ' + req.params.display_filename));
        }

        res.sendFile(results.rows[0].storage_filename, {root: config.assessmentFilesRoot});
    });
});
            csvMaker.rowsToCsv(result.rows, columns, function(err, csv) {
                if (ERR(err, next)) return;
                res.attachment(req.params.filename);
                res.send(csv);
            });
        });
    } else if (req.params.filename == res.locals.allFilesZipFilename
               || req.params.filename == res.locals.finalFilesZipFilename
               || req.params.filename == res.locals.bestFilesZipFilename) {
        const include_all = (req.params.filename == res.locals.allFilesZipFilename);
        const include_final = (req.params.filename == res.locals.finalFilesZipFilename);
        const include_best = (req.params.filename == res.locals.bestFilesZipFilename);
        const params = {
            assessment_id: res.locals.assessment.id,
            limit: 100,
            include_all,
            include_final,
            include_best,
        };

        const archive = archiver('zip');
        const dirname = (res.locals.assessment_set.name + res.locals.assessment.number).replace(' ', '');
        const prefix = `${dirname}/`;
        archive.append(null, { name: prefix });
        res.attachment(req.params.filename);
        archive.pipe(res);
        paginateQuery(sql.assessment_instance_files, params, (row, callback) => {
            archive.append(row.contents, { name: prefix + row.filename });
            callback(null);
        }, (err) => {
            if (ERR(err, next)) return;
            archive.finalize();
        });
    } else {
        next(new Error('Unknown filename: ' + req.params.filename));
    }
});

module.exports = router;
