const express = require('express');
const router = express.Router();
const { loadSqlEquiv } = require('@prairielearn/postgres');

const sqldb = require('@prairielearn/postgres');
const { config } = require('../../lib/config');

const sql = loadSqlEquiv(__filename);

router.get('/', async (req, res, next) => {
  try {
    const params = {
      assessment_id: res.locals.assessment.id,
      link_exam_id: config.syncExamIdAccessRules,
      
    };

    const result = await sqldb.queryAsync(sql.assessment_access_policies, params);
    
    res.render(__filename.replace(/\.js$/, '.ejs'), { 
      policies: result.rows,
      assessment_id: params.assessment_id,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const params = {
      assessment_id: req.body.assessment_id,
      created_at: new Date(req.body.created_at),
      created_by: req.body.created_by,
      credit: req.body.credit,
      end_date: new Date(req.body.end_date),
      group_id: req.body.group_id || null,
      note: req.body.note || null,
      start_date: new Date(req.body.start_date),
      type: req.body.type,
      user_id: req.body.user_id,
    };

    const insertQuery = `
      INSERT INTO assessment_access_policies
      (assessment_id, created_at, created_by, credit, end_date, group_id, note, start_date, type, user_id)
      VALUES
      ($assessment_id, $created_at, $created_by, $credit, $end_date, $group_id, $note, $start_date, $type, $user_id)
    `;

    await sqldb.queryAsync(insertQuery, params);
    
    res.json({ status: 'success' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
