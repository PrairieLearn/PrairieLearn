const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const config = require('../../lib/config');
const sqldb = require('../../prairielib/lib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

let compare_date = function (old_date, new_date, old_is_null, new_is_null, both_are_null) {
  if (old_date === null) return new_date === null ? both_are_null : old_is_null;
  else if (new_date === null) return new_is_null;
  else return old_date - new_date;
};

let apply_rule = function (list, formal_rule) {
  let new_rule = Object.assign({}, formal_rule);
  let valid = true;
  if (new_rule.mode_raw ?? 'Public' === 'Public') new_rule.valid_now_public = new_rule.valid_now;
  if (new_rule.mode_raw ?? 'Exam' === 'Exam') new_rule.valid_now_exam = new_rule.valid_now;
  list.forEach((old_rule) => {
    if (!valid) return;

    if (old_rule.mode_raw !== null && old_rule.mode_raw !== new_rule.mode_raw) {
      if (new_rule.mode_raw === null) {
        // New rule is NULL, old rule is not NULL, so split new rule.
        let new_rule_public = Object.assign({}, new_rule);
        new_rule_public.mode_raw = 'Public';
        new_rule_public.mode = 'Public';
        apply_rule(list, new_rule_public);
        let new_rule_exam = Object.assign({}, new_rule);
        new_rule_exam.mode_raw = 'Exam';
        new_rule_exam.mode = 'Exam';
        apply_rule(list, new_rule_exam);
        valid = false;
      }
      return;
    }

    if (old_rule.valid_now_public) {
      new_rule.valid_now_public = false;
    }
    if (old_rule.valid_now_exam && old_rule.exam_uuid === new_rule.exam_uuid) {
      new_rule.valid_now_exam = false;
    }

    // Simplification: if there are multiple rules with different
    // CBTF exam UUIDs, they are not considered a conflict, and may all
    // be valid simultaneously.
    if (old_rule.exam_uuid !== new_rule.exam_uuid) return;

    if (
      compare_date(new_rule.start_date_raw, old_rule.start_date_raw, -1, +1, 0) >= 0 &&
      compare_date(new_rule.end_date_raw, old_rule.end_date_raw, +1, -1, 0) <= 0
    ) {
      valid = false;
    } else if (
      compare_date(new_rule.start_date_raw, old_rule.start_date_raw, -1, +1, 0) >= 0 &&
      compare_date(new_rule.start_date_raw, old_rule.end_date_raw, -1, -1, -1) <= 0
    ) {
      new_rule.start_date_raw = old_rule.end_date_plus_one_raw;
      new_rule.start_date = old_rule.end_date_plus_one;
    } else if (
      compare_date(new_rule.end_date_raw, old_rule.start_date_raw, +1, +1, +1) >= 0 &&
      compare_date(new_rule.end_date_raw, old_rule.end_date_raw, +1, -1, 0) <= 0
    ) {
      new_rule.end_date_raw = old_rule.start_date_minus_one_raw;
      new_rule.end_date = old_rule.start_date_minus_one;
    } else if (
      compare_date(new_rule.start_date_raw, old_rule.start_date_raw, -1, +1, 0) < 0 &&
      compare_date(new_rule.end_date_raw, old_rule.end_date_raw, +1, -1, 0) > 0
    ) {
      let rule_before = Object.assign({}, new_rule);
      rule_before.end_date_raw = old_rule.start_date_minus_one_raw;
      rule_before.end_date = old_rule.start_date_minus_one;
      apply_rule(list, rule_before);

      new_rule.start_date_raw = old_rule.end_date_plus_one_raw;
      new_rule.start_date = old_rule.end_date_plus_one;
    }
  });
  if (valid) {
    list.push(new_rule);
  }
};

router.get(
  '/',
  asyncHandler(async (req, res, _next) => {
    debug('GET /');
    res.locals.assessment_settings = (
      await sqldb.queryOneRowAsync(sql.assessment_settings, {
        assessment_id: res.locals.assessment.id,
      })
    ).rows[0];
    res.locals.access_rules = (
      await sqldb.queryAsync(sql.assessment_access_rules, {
        assessment_id: res.locals.assessment.id,
        link_exam_id: config.syncExamIdAccessRules,
      })
    ).rows;

    debug('building user-friendly description');
    let student_rules = [];
    let user_spec_rules = [];

    // Creates sets of unique user lists
    res.locals.access_rules.forEach((formal) => {
      if (formal.uids_raw) {
        let uids = formal.uids_raw;
        // Check if any existing user list has an intersection with current list.
        user_spec_rules.forEach((old) => {
          let inter = old.uids.filter((uid) => uids.includes(uid));
          if (inter.length) {
            user_spec_rules.push({ uids: inter, names: formal.uids_names, rules: [] });
            old.uids = old.uids.filter((uid) => !inter.includes(uid));
            uids = uids.filter((uid) => !inter.includes(uid));
          }
        });
        if (uids) user_spec_rules.push({ uids, names: formal.uids_names, rules: [] });
      }
    });
    // Remove lists without UIDs remaining
    user_spec_rules = user_spec_rules.filter((set) => set.uids.length);

    res.locals.access_rules.forEach((formal) => {
      if (formal.uids_raw === null) {
        apply_rule(student_rules, formal);
      }

      user_spec_rules.forEach((set) => {
        if (
          formal.uids_raw === null ||
          set.uids.filter((uid) => formal.uids_raw.includes(uid)).length
        ) {
          apply_rule(set.rules, formal);
        }
      });
    });

    if (student_rules && student_rules.length) {
      user_spec_rules.push({ other_uids: true, rules: student_rules });
    }

    res.locals.explained_sets = user_spec_rules;

    res.locals.access_rules.forEach((formal) => {
      formal.has_application = user_spec_rules.some((set) =>
        set.rules.some((applied) => applied.id === formal.id)
      );
    });

    debug('render page');
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  })
);

module.exports = router;
