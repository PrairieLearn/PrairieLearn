const ERR = require('async-stacktrace');
const path = require('path');
const express = require('express');
const router = express.Router({
    mergeParams: true,
});

const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.load(path.join(__dirname, '..', 'queries.sql'));

router.get('/', (req, res, next) => {
    const params = {
        course_instance_id: res.locals.course_instance.id,
        authz_data: res.locals.authz_data,
        req_date: res.locals.req_date,
        assessment_id: null,
    };
    sqldb.query(sql.select_assessments, params, (err, result) => {
        if (ERR(err, next)) return;
        res.status(200).send(result.rows);
    });
});

const getAssessment = (req, res, next, callback) => {
    const params = {
        course_instance_id: res.locals.course_instance.id,
        authz_data: res.locals.authz_data,
        req_date: res.locals.req_date,
        assessment_id: req.params.assessment_id,
    };
    sqldb.queryZeroOrOneRow(sql.select_assessments, params, (err, result) => {
        if (ERR(err, next)) return;
        if (result.rows.length === 0) {
            res.status(404).send({
                message: 'Not Found',
            });
        } else {
            callback(result.rows[0]);
        }
    });
};

router.get('/:assessment_id', (req, res, next) => {
    getAssessment(req, res, next, (assessment) => {
        res.status(200).send(assessment);
    });
});

router.get('/:assessment_id/assessment_instances', (req, res, next) => {
    // Select the assessment first to make sure we can access it
    getAssessment(req, res, next, () => {
        const params = {
            course_instance_id: req.params.course_instance_id,
            assessment_id: req.params.assessment_id,
            assessment_instance_id: null,
        };
        sqldb.query(sql.select_assessment_instances, params, (err, result) => {
            if (ERR(err, next)) return;
            res.status(200).send(result.rows);
        });
    });
});

module.exports = router;
