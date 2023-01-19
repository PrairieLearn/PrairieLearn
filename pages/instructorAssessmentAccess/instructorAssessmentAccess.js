const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const path = require('path');
const _ = require('lodash');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const config = require('../../lib/config');
const sqldb = require('../../prairielib/lib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

let compareDate = function (oldDate, newDate, oldIsNull, newIsNull, bothAreNull) {
  if (oldDate === null) return newDate === null ? bothAreNull : oldIsNull;
  else if (newDate === null) return newIsNull;
  else return oldDate - newDate;
};

let applyRule = function (list, originalRule) {
  let new_rule = { ...originalRule };
  let rule_still_applies = true;
  new_rule.valid_now = new_rule.valid_now_on_start && new_rule.valid_now_on_end;
  new_rule.valid_now_public = new_rule.valid_now && (new_rule.mode_raw ?? 'Public') === 'Public';
  new_rule.valid_now_exam = new_rule.valid_now && (new_rule.mode_raw ?? 'Exam') === 'Exam';
  list.forEach((old_rule) => {
    if (!rule_still_applies) return;

    if (old_rule.mode_raw !== null && old_rule.mode_raw !== new_rule.mode_raw) {
      if (new_rule.mode_raw === null) {
        // New rule is NULL, old rule is not NULL, so split new rule.
        let new_rule_public = { ...new_rule };
        new_rule_public.mode_raw = 'Public';
        new_rule_public.mode = 'Public';
        applyRule(list, new_rule_public);
        let new_rule_exam = { ...new_rule };
        new_rule_exam.mode_raw = 'Exam';
        new_rule_exam.mode = 'Exam';
        applyRule(list, new_rule_exam);
        rule_still_applies = false;
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
      compareDate(new_rule.start_date_raw, old_rule.start_date_raw, -1, +1, 0) >= 0 &&
      compareDate(new_rule.end_date_raw, old_rule.end_date_raw, +1, -1, 0) <= 0
    ) {
      // Old rule completely encompasses new rule, this rule does not apply
      rule_still_applies = false;
    } else if (
      compareDate(new_rule.start_date_raw, old_rule.start_date_raw, -1, +1, 0) >= 0 &&
      compareDate(new_rule.start_date_raw, old_rule.end_date_raw, -1, -1, -1) <= 0
    ) {
      // Old rule ends after the new one starts, so in effect the new rule starts after the old rule
      new_rule.start_date_raw = old_rule.end_date_plus_one_raw;
      new_rule.start_date = old_rule.end_date_plus_one;
    } else if (
      compareDate(new_rule.end_date_raw, old_rule.start_date_raw, +1, +1, +1) >= 0 &&
      compareDate(new_rule.end_date_raw, old_rule.end_date_raw, +1, -1, 0) <= 0
    ) {
      // Old rule starts before the new one ends, so in effect the new rule ends before the old rule
      new_rule.end_date_raw = old_rule.start_date_minus_one_raw;
      new_rule.end_date = old_rule.start_date_minus_one;
    } else if (
      compareDate(new_rule.start_date_raw, old_rule.start_date_raw, -1, +1, 0) < 0 &&
      compareDate(new_rule.end_date_raw, old_rule.end_date_raw, +1, -1, 0) > 0
    ) {
      // Old rule has dates completely within the new one, so create two effective rules, one ending before the old one...
      let rule_before = { ...new_rule };
      rule_before.end_date_raw = old_rule.start_date_minus_one_raw;
      rule_before.end_date = old_rule.start_date_minus_one;
      rule_before.valid_now_on_end = old_rule.valid_now_on_end;
      applyRule(list, rule_before);

      // ... and one starting after the old one
      let rule_after = { ...new_rule };
      rule_after.start_date_raw = old_rule.end_date_plus_one_raw;
      rule_after.start_date = old_rule.end_date_plus_one;
      rule_after.valid_now_on_start = old_rule.valid_now_on_start;
      applyRule(list, rule_after);

      rule_still_applies = false;
    }
  });
  if (rule_still_applies) {
    list.push(new_rule);
  }
};

router.get(
  '/',
  asyncHandler(async (req, res, _next) => {
    debug('GET /');
    res.locals.access_rules = (
      await sqldb.queryAsync(sql.assessment_access_rules, {
        assessment_id: res.locals.assessment.id,
        link_exam_id: config.syncExamIdAccessRules,
      })
    ).rows;

    debug('building user-friendly description');
    let general_rules = [];
    let user_spec_rules = [];

    // Creates sets of unique user lists
    res.locals.access_rules
      .filter((db_rule) => db_rule.uids_raw !== null)
      .forEach((db_rule) => {
        let uids = db_rule.uids_raw;
        // Check if any existing user list has an intersection with current list.
        user_spec_rules.forEach((old) => {
          let inter = _.intersection(old.uids, uids);
          // If there is an intersection, create three lists...
          if (inter.length) {
            // ...the intersection list, where both rules apply
            user_spec_rules.push({ uids: inter, names: db_rule.uids_names, rules: [] });
            // ...the old list without the intersection, where the previous rules apply
            old.uids = _.difference(old.uids, inter);
            // ...the new list without the intersection, where the new rules apply
            uids = _.difference(uids, inter);
          }
        });
        if (uids) user_spec_rules.push({ uids, names: db_rule.uids_names, rules: [] });
      });
    // Remove lists without UIDs remaining
    user_spec_rules = user_spec_rules.filter((set) => set.uids.length);

    res.locals.access_rules.forEach((db_rule) => {
      if (db_rule.uids_raw === null) {
        applyRule(general_rules, db_rule);
      }

      user_spec_rules.forEach((set) => {
        if (
          db_rule.uids_raw === null ||
          set.uids.filter((uid) => db_rule.uids_raw.includes(uid)).length
        ) {
          applyRule(set.rules, db_rule);
        }
      });
    });

    res.locals.exception_sets = [];
    user_spec_rules.forEach((new_set) => {
      // If a student has no rules or the same rules as the default, list only the default rule
      if (!new_set.rules || _.isEqual(general_rules, new_set.rules)) return;
      // If two or more student lists have the same rules, combine them into a single set of rules
      res.locals.exception_sets
        .filter((old_set) => _.isEqual(old_set.rules, new_set.rules))
        .forEach((old_set) => {
          old_set.uids = _.union(old_set.uids, new_set.uids);
          new_set.uids = [];
        });
      if (new_set.uids.length) res.locals.exception_sets.push(new_set);
    });

    res.locals.exception_sets.forEach((set) => {
      set.rules.sort((rule1, rule2) => rule1.start_date_raw - rule2.start_date_raw);
    });
    general_rules.sort((rule1, rule2) => rule1.start_date_raw - rule2.start_date_raw);

    res.locals.general_rules = { general_rules: true, rules: general_rules };

    res.locals.access_rules.forEach((db_rule) => {
      db_rule.has_application =
        general_rules.some((applied) => applied.id === db_rule.id) ||
        res.locals.exception_sets.some((set) =>
          set.rules.some((applied) => applied.id === db_rule.id)
        );
    });

    debug('render page');
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  })
);

module.exports = router;
