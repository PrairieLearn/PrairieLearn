var _ = require('lodash');
var ERR = require('async-stacktrace');
var config = require('./config');

var sqldb = require('./sqldb');
var sqlLoader = require('./sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

var plpsutilities = module.exports;

plpsutilities.courseLinked = function(pl_course_id, callback) {

    sqldb.query(sql.courseids_by_plcid, {'pl_course_id': pl_course_id}, function(err, result) {

        //console.log(result);
        callback(null, result.rows[0].course_ids);
    });


};

plpsutilities.validPLPSexams = function(plc_id, varname, varvalue, callback) {

    if (!plc_id) return callback(null, []);

    var params = {
        'plc_id': plc_id,
        'course_id': null,
        'a_id': null,
    };

    var sql_to_execute = sql.valid_plps_all;

    if (varname == 'course_id') {
        params.course_id = varvalue;
        sql_to_execute = sql.valid_plps_courseid;
    }

    if (varname == 'assessment_id') {
        params.a_id = varvalue;
        sql_to_execute = sql.valid_plps_aid;
    }

    sqldb.query(sql_to_execute, params, function(err, result) {
        if (ERR(err, callback)) return

        callback(err, result.rows);
    });
}

plpsutilities.plCourseUrl = function(plc_id) {
    return `https://prairielearn.engr.illinois.edu/pl/course/${plc_id}/overview`;
};

plpsutilities.plAssessmentUrl = function(ci_id, a_id) {
    return `https://prairielearn.engr.illinois.edu/pl/course_instance/${ci_id}/instructor/assessment/${a_id}/`;
};

plpsutilities.psExamUrl = function(c_id, e_id) {
    return `https://cbtf.engr.illinois.edu/sched/course/${c_id}/exam/${e_id}/`;
};
