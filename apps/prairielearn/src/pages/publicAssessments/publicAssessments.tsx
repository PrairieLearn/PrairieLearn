import { Router } from 'express';
import z from 'zod';

import { PageLayout } from '../../components/PageLayout.js';
import { PublicCourseInstanceSchema, PublicCourseSchema } from '../../lib/client/safe-db-types.js';
import { getCourseInstanceCopyTargets } from '../../lib/copy-content.js';
import { UserSchema } from '../../lib/db-types.js';
import { features } from '../../lib/features/index.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { selectAssessments } from '../../models/assessment.js';
import { selectQuestionsForCourseInstanceCopy } from '../../models/question.js';

import {
  SafeCopyTargetSchema,
  SafeQuestionForCopySchema,
} from './components/CopyCourseInstanceModal.js';
import { PublicAssessments, SafeAssessmentRowSchema } from './publicAssessments.html.js';

const router = Router({ mergeParams: true });

router.get(
  '/',
  typedAsyncHandler<'public-course-instance'>(async (req, res) => {
    const courseInstanceCopyTargets = await getCourseInstanceCopyTargets({
      course: res.locals.course,
      is_administrator: res.locals.is_administrator,
      user: UserSchema.parse(res.locals.authn_user),
      authn_user: res.locals.authn_user,
      courseInstance: res.locals.course_instance,
    });

    const rows = await selectAssessments({
      course_instance_id: res.locals.course_instance.id,
    });
    const questionsForCopy = await selectQuestionsForCourseInstanceCopy(
      res.locals.course_instance.id,
    );

    const safeCourse = PublicCourseSchema.parse(res.locals.course);
    const safeCourseInstance = PublicCourseInstanceSchema.parse(res.locals.course_instance);
    const safeQuestionsForCopy = z.array(SafeQuestionForCopySchema).parse(questionsForCopy);
    const safeCourseInstanceCopyTargets = z
      .array(SafeCopyTargetSchema)
      .parse(courseInstanceCopyTargets);
    const safeRows = z.array(SafeAssessmentRowSchema).parse(rows);

    // Check the feature flag globally since we don't know the destination course yet
    const enrollmentManagementEnabled = await features.enabled('enrollment-management', {});

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Assessments',
        navContext: {
          type: 'public',
          page: 'assessments',
        },
        options: {
          fullWidth: false,
        },
        content: (
          <PublicAssessments
            rows={safeRows}
            courseInstance={safeCourseInstance}
            course={safeCourse}
            courseInstanceCopyTargets={safeCourseInstanceCopyTargets}
            questionsForCopy={safeQuestionsForCopy}
            enrollmentManagementEnabled={enrollmentManagementEnabled}
          />
        ),
      }),
    );
  }),
);

export default router;
