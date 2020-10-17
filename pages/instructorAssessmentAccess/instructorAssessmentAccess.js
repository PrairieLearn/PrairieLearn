const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const config = require('../../lib/config');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

let compare_date = function(old_date, new_date, old_is_null, new_is_null, both_are_null) {
    if (old_date === null)
        return new_date === null ? both_are_null : old_is_null;
    else if (new_date === null)
        return new_is_null;
    else
        return old_date - new_date;
};

let compare_role = function(role1, role2) {
    let role_order = ['Student', 'TA', 'Instructor'];
    return Math.max(role_order.indexOf(role1), 0) - Math.max(role_order.indexOf(role2), 0);
};

let apply_rule = function(list, formal_rule) {

    let new_rule = Object.assign({}, formal_rule);
    let valid = true;
    list.forEach(old_rule => {

        if (!valid) return;
        
        if (old_rule.mode_raw !== null && old_rule.mode_raw !== new_rule.mode_raw) {
            if (new_rule.mode_raw !== null) {
                // New rule is NULL, old rule is not NULL, so split new rule.
                let new_rule_public = Object.assign({}, new_rule);
                new_rule_public.mode_raw = 'Public';
                new_rule_public.mode = 'Public';
                apply_rule(new_rule_public);
                let new_rule_exam = Object.assign({}, new_rule);
                new_rule_exam.mode_raw = 'Exam';
                new_rule_exam.mode = 'Exam';
                apply_rule(new_rule_exam);
                valid = false;
            }
            return;
        }

        // TODO Exam UUID
        
        if (compare_date(new_rule.start_date_raw, old_rule.start_date_raw, -1, +1, 0) >= 0 &&
            compare_date(new_rule.end_date_raw, old_rule.end_date_raw, +1, -1, 0) <= 0)
            valid = false;
        else if (compare_date(new_rule.start_date_raw, old_rule.start_date_raw, -1, +1, 0) >= 0 &&
                 compare_date(new_rule.start_date_raw, old_rule.end_date_raw, -1, -1, -1) <= 0) {
            new_rule.start_date_raw = old_rule.end_date_raw;
            new_rule.start_date = old_rule.end_date;
        }
        else if (compare_date(new_rule.end_date_raw, old_rule.start_date_raw, +1, +1, +1) >= 0 &&
                 compare_date(new_rule.end_date_raw, old_rule.end_date_raw, +1, -1, 0) <= 0) {
            new_rule.end_date_raw = old_rule.start_date_raw;
            new_rule.end_date = old_rule.start_date;
        }
        else if (compare_date(new_rule.start_date_raw, old_rule.start_date_raw, -1, +1, 0) < 0 &&
                 compare_date(new_rule.end_date_raw, old_rule.end_date_raw, +1, -1, 0) > 0) {
            let rule_before = Object.assign({}, new_rule);
            rule_before.end_date_raw = old_rule.start_date_raw;
            rule_before.end_date = old_rule.start_date;
            apply_rule(list, rule_before);
            
            new_rule.start_date_raw = old_rule.end_date_raw;
            new_rule.start_date = old_rule.end_date;
        }
    });
    if (valid) {
        list.push(new_rule);
    }
};

router.get('/', function(req, res, next) {
    debug('GET /');
    var course_roles = {};
    var params = {
        course_instance_id: res.locals.course_instance.id,
        assessment_id: res.locals.assessment.id,
        link_exam_id: config.syncExamIdAccessRules,
    };
    sqldb.query(sql.course_roles, params, function(err, result) {
        if (ERR(err, next)) return;
        result.rows.forEach(row => {
            course_roles[row.user_uid] = row.course_role;
        });
    });
    sqldb.query(sql.assessment_settings, params, function(err, result) {
        if (ERR(err, next)) return;
        result.rows.forEach(row => {
            res.locals.assessment_settings = row;
        });
    });
    sqldb.query(sql.assessment_access_rules, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.access_rules = result.rows;
        debug('building user-friendly description');
        let ta_rules = [];
        let student_rules = [];
        let user_spec_rules = [];

        // Creates sets of unique user lists
        result.rows.forEach(formal => {
            if (formal.uids_raw) {
                let uids = formal.uids_raw;
                (new Set(uids.map(uid => course_roles[uid] || 'Student'))).forEach(role => {
                    
                    // If the role and uids are both set, and the uids
                    // have lower role, ignore uids (e.g., if role is
                    // TA and uids includes students.
                    if (compare_role(formal.role, role) > 0) return;

                    let role_uids = uids.filter(uid => role == (course_roles[uid] || 'Student'));

                    // Check if any existing user list has an intersection with current list.
                    user_spec_rules.forEach(old => {
                        let inter = old.uids.filter(uid => role_uids.includes(uid));
                        if (inter.length) {
                            user_spec_rules.push({set: role + 's: ' + inter.join(', '),
                                                  role: role,
                                                  uids: inter,
                                                  rules: []});
                            old.uids = old.uids.filter(uid => !inter.includes(uid));
                            old.set = old.role + 's: ' + old.uids.join(', ');
                            role_uids = role_uids.filter(uid => !inter.includes(uid));
                        }
                    });
                    if (role_uids)
                        user_spec_rules.push({set: role + 's: ' + role_uids.join(', '),
                                              role: role,
                                              uids: role_uids,
                                              rules: []});
                });
            }
            if (formal.role == 'TA')
                ta_rules = [];
        });
        // Remove lists without UIDs remaining
        user_spec_rules = user_spec_rules.filter(set => set.uids.length);

        result.rows.forEach(formal => {

            if (formal.uids_raw === null) {

                if (ta_rules)
                    apply_rule(ta_rules, formal);
                if (formal.role != 'TA')
                    apply_rule(student_rules, formal);
            }

            user_spec_rules.forEach(set => {
                if ((formal.uids_raw === null ||
                     set.uids.filter(uid => formal.uids_raw.includes(uid)).length) &&
                    compare_role(formal.role, set.role) <= 0) {
                    apply_rule(set.rules, formal);
                }
            });
        });

        if (student_rules && student_rules.length)
            user_spec_rules.push(
                {set: 'Students in general',
                 rules: student_rules});
        if (ta_rules && ta_rules.length)
            user_spec_rules.push(
                {set: 'TAs in general',
                 rules: ta_rules});
        
        res.locals.explained_sets = user_spec_rules;
        
        debug('render page');
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

module.exports = router;
