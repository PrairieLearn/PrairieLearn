import ERR from 'async-stacktrace';
import async = require('async');
import { Response, NextFunction } from 'express';
import fs = require('fs-extra');
import path = require('node:path');
import { v4 as uuidv4 } from 'uuid';
import * as error from '@prairielearn/error';
import { logger } from '@prairielearn/logger';
import * as sqldb from '@prairielearn/postgres';

import { config } from './config';
import { idsEqual } from './id';
import { QuestionCopyEditor } from './editors';

const sql = sqldb.loadSqlEquiv(__filename);

export function copyQuestion(
  res: Response,
  next: NextFunction,
  { to_course_id }: { to_course_id: string }
) {
  if (idsEqual(to_course_id, res.locals.course.id)) {
    // In this case, we are making a duplicate of this question in the same course
    const editor = new QuestionCopyEditor({
      locals: res.locals,
    });
    editor.canEdit((err) => {
      if (ERR(err, next)) return;
      editor.doEdit((err, job_sequence_id) => {
        if (ERR(err, (e) => logger.error('Error in doEdit()', e))) {
          res.redirect(res.locals.urlPrefix + '/edit_error/' + job_sequence_id);
        } else {
          sqldb.queryOneRow(
            sql.select_question_id_from_uuid,
            { uuid: editor.uuid, course_id: res.locals.course.id },
            (err, result) => {
              if (ERR(err, next)) return;
              res.redirect(
                res.locals.urlPrefix + '/question/' + result.rows[0].question_id + '/settings'
              );
            }
          );
        }
      });
    });
  } else {
    // In this case, we are sending a copy of this question to a different course.
    //
    // Note that we *always* allow copying from a template course, even if the user
    // does not have explicit view permissions.
    if (!res.locals.authz_data.has_course_permission_view && !res.locals.course.template_course) {
      return next(error.make(403, 'Access denied (must be a course Viewer)'));
    }

    const f = uuidv4();
    const relDir = path.join(f.slice(0, 3), f.slice(3, 6));
    const params = {
      from_course_id: res.locals.course.id,
      to_course_id: to_course_id,
      user_id: res.locals.user.user_id,
      transfer_type: 'CopyQuestion',
      from_filename: path.join(res.locals.course.path, 'questions', res.locals.question.qid),
      storage_filename: path.join(relDir, f.slice(6)),
    };
    async.series(
      [
        async () => {
          if (config.filesRoot == null) throw new Error('config.filesRoot is null');
          await fs.copy(
            params.from_filename,
            path.join(config.filesRoot, params.storage_filename),
            { errorOnExist: true }
          );

          const result = await sqldb.queryOneRowAsync(sql.insert_file_transfer, params);
          res.redirect(
            `${res.locals.plainUrlPrefix}/course/${params.to_course_id}/file_transfer/${result.rows[0].id}`
          );
        },
      ],
      (err) => {
        if (ERR(err, next)) return;
      }
    );
  }
}
