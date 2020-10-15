const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const config = require('../../lib/config');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

function compare_date(old_date, new_date, old_is_null, new_is_null, both_are_null) {
    if (old_date === null)
        return new_date === null ? both_are_null : old_is_null;
    else if (new_date === null)
        return new_is_null;
    else
        return old_date - new_date;
}

function apply_rule(list, formal_rule) {

    let new_rule = Object.assign({}, formal_rule);
    let valid = true;
    list.forEach(old_rule => {
        // TODO Consider differences in mode
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
}

router.get('/', function(req, res, next) {
    debug('GET /');
    var params = {
        assessment_id: res.locals.assessment.id,
        link_exam_id: config.syncExamIdAccessRules,
    };
    sqldb.query(sql.assessment_access_rules, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.access_rules = result.rows;
        debug('building user-friendly description');
        let ta_rules = null;
        let student_rules = [];
        let user_spec_rules = [];

        // Creates sets of unique user lists
        result.rows.forEach(function(formal) {
            if (formal.uids_raw) {
                let new_array = formal.uids_raw.split(',');
                user_spec_rules.forEach(old => {
                    let inter = old.uids.filter(uid => new_array.includes(uid));
                    if (inter.length) {
                        user_spec_rules.push({set: inter.join(', '),
                                              uids: inter,
                                              rules: []});
                        old.uids = old.uids.filter(uid => !inter.includes(uid));
                        new_array = new_array.filter(uid => !inter.includes(uid));
                    }
                });
                if (new_array)
                    user_spec_rules.push({set: new_array.join(', '),
                                          uids: new_array,
                                          rules: []});
            }
            if (formal.role == 'TA')
                ta_rules = [];
            // TODO Distinguish TA roles with specific UIDs
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

            // TODO Consider cases where uuid list includes TAs
            
            if (formal.role != 'TA')
                user_spec_rules.forEach(set => {
                    if (formal.uids_raw === null ||
                        set.uids.filter(uid => formal.uids_raw.includes(uid)).length) {
                        apply_rule(set.rules, formal);
                    }
                });
        });

        if (ta_rules)
            user_spec_rules.push(
                {set: 'TAs without a user-specific rule',
                 rules: ta_rules});
        user_spec_rules.push(
            {set: 'Students without a user-specific rule',
             rules: student_rules});
        res.locals.explained_sets = user_spec_rules;
        
        debug('render page');
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

module.exports = router;
