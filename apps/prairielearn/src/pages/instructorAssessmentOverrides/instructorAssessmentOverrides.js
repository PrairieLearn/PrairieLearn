const express = require('express');
const asyncHandler = require('express-async-handler');
const router = express.Router();
const {loadSqlEquiv} = require('@prairielearn/postgres');
const sqldb = require('@prairielearn/postgres');
const sql = loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    console.log(JSON.stringify(res.locals.course_instance))
    const params = {
      assessment_id: res.locals.assessment.id,
      current_student_uid: res.locals.user.uid,
      current_assessment_title : res.locals.assessment.title
    };
    const result = await sqldb.queryAsync(sql.select_assessment_access_policy, params);
    res.locals.policies = result.rows
    // console.log(res)
    res.render(__filename.replace(/\.js$/, '.ejs'), {
      policies: res.locals.policies,
      assessment_id: params.assessment_id,
      current_student_uid: params.current_student_uid,
      current_assessment_title: params.current_assessment_title
    });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'add_new_override') {
    const params = {
      assessment_id: res.locals.assessment.id,
      created_at: new Date(req.body.created_at),
      created_by: res.locals.user.uid,
      credit: req.body.credit,
      end_date: new Date(req.body.end_date),
      group_id: req.body.group_id || null,
      note: req.body.note || null,
      start_date: new Date(req.body.start_date),
      // type: req.body.type,
      student_uid: req.body.student_uid,
    };
    // First, validate if group belongs to course instance
    const group_validation_result = await sqldb.queryAsync(sql.check_group_in_course_instance, {group_id: params.group_id, course_instance_id: res.locals.course_instance.id});
    console.log(group_validation_result.rows)
    // If group does not belong to course instance, return error
    if (group_validation_result.rows[0].count === 0) {
      return res.status(400).send({ error: 'Group does not belong to the current course instance.' });
    }

    const insert_assessment_access_policy = sql.insert_assessment_access_policy;

    await sqldb.queryAsync(insert_assessment_access_policy, params);
    res.redirect(req.originalUrl);
  
  } 
  
  else if (req.body.__action === 'delete_override')
    {
      const delete_params = {
        assessment_id: res.locals.assessment.id,
        student_uid: req.body.student_uid,
        group_id: req.body.group_id,
      };
      console.log(delete_params)
      // const result_after_delete = await sqldb.queryAsync(deleteQuery, delete_params);
      // console.log(result_after_delete)
      const result_after_delete = await sqldb.queryAsync(sql.delete_assessment_access_policy, delete_params);
      console.log(result_after_delete.rows)
      res.locals.policies = result_after_delete.rows;
      res.redirect(req.originalUrl);
    }

    else if (req.body.__action === 'edit_override') {
      const edit_params = {
        assessment_id: res.locals.assessment.id,
        created_at: new Date(req.body.created_at),
        created_by: res.locals.user.uid,
        credit: req.body.credit,
        end_date: new Date(req.body.end_date),
        group_id: req.body.group_id || null,
        note: req.body.note || null,
        start_date: new Date(req.body.start_date),
        student_uid: req.body.student_uid,
        
      };

      const update_assessment_access_policy = sql.update_assessment_access_policy;

      await sqldb.queryAsync(update_assessment_access_policy, edit_params);
      res.redirect(req.originalUrl);
    }
  })
);


module.exports = router;
