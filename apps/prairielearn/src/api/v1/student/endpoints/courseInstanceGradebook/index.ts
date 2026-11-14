import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import z from 'zod';

import {
  AssessmentInstanceSchema,
  AssessmentSchema,
  AssessmentSetSchema,
} from '../../../../../lib/db-types.js';
import { getGradebookRows } from '../../../../../lib/gradebook.js';
import { computeLabel, computeTitle } from '../../../../../lib/gradebook.shared.js';

const router = Router({ mergeParams: true });

const StudentGradebookRowSchema = z.object({
  assessment_id: AssessmentSchema.shape.id,
  assessment_instance_id: AssessmentInstanceSchema.shape.id,
  assessment_label: z.string(),
  title: z.string(),
  assessment_set_heading: AssessmentSetSchema.shape.heading,
  score_perc: AssessmentInstanceSchema.shape.score_perc,
  score_hidden: z.boolean(),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    // This is the same data that the student gradebook page shows.
    const rows = await getGradebookRows({
      courseInstance: res.locals.course_instance,
      userId: res.locals.authn_user.id,
      authzData: res.locals.authz_data,
      reqDate: res.locals.req_date,
      auth: 'student',
    });

    res.status(200).send(
      z.array(StudentGradebookRowSchema).parse(
        rows.map((row) => {
          const score_hidden = !row.show_closed_assessment_score;
          return {
            assessment_id: row.assessment.id,
            assessment_instance_id: row.assessment_instance.id,
            assessment_label: computeLabel(row),
            title: computeTitle(row),
            assessment_set_heading: row.assessment_set.heading,
            score_perc: score_hidden ? null : row.assessment_instance.score_perc,
            score_hidden,
          };
        }),
      ),
    );
  }),
);

export default router;
